import { Command } from 'commander'
import { afterEach, expect, it, vi } from 'vitest'
import { registerRestaurantCommands } from '../commands/restaurant.js'

const site = {
  restaurant: { name: 'Sarok', slug: 'sarok', country: 'HU', published: false },
  urls: { order: null, admin: 'https://admin.munchi.hu/sarok', munchiListing: 'https://munchi.hu/restaurants/sarok' },
  menu: { categories: [], items: [] },
}
const token = 'haszno_test_fixture'

async function run(result: { isError?: boolean; content: Array<{ type: string; text: string }> }) {
  const program = new Command().option('--json').exitOverride()
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ jsonrpc: '2.0', id: 1, result }))
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  registerRestaurantCommands(program, { apiKey: token, baseUrl: 'https://fixture.example', fetch })
  await program.parseAsync(['node', 'haszno', 'restaurant', 'site', '--json'])
  return { fetch, out, err }
}

afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

it('reads the current shop via its authenticated MCP tool, preserving a missing public order URL', async () => {
  const { fetch, out, err } = await run({ content: [{ type: 'text', text: JSON.stringify(site) }] })
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('https://fixture.example/api/mcp')
  expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`)
  expect(JSON.parse(String(init?.body))).toMatchObject({
    method: 'tools/call', params: { name: 'haszno_restaurant_get_site', arguments: {} },
  })
  expect(out).toHaveBeenCalledWith(JSON.stringify(site) + '\n')
  expect(err).not.toHaveBeenCalled()
})

it('reports a missing restaurant as a JSON error on stderr and exits nonzero', async () => {
  const { out, err } = await run({ isError: true, content: [{ type: 'text', text: 'Error (404): Nincs saját étterem.' }] })
  expect(out).not.toHaveBeenCalled()
  expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toMatchObject({ error: expect.stringContaining('(404)') })
  expect(process.exitCode).toBe(1)
})
