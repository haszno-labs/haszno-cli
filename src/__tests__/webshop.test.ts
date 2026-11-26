/**
 * `haszno webshop …` — each command must call the right hosted MCP tool with the right arguments, and the MCP
 * caller must send the shop token as Bearer and surface a tool error. No live network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerWebshopCommands } from '../commands/webshop.js'
import { callMcpTool, McpToolError } from '../client/mcp.js'

type Call = { name: string; args: Record<string, unknown> }

async function runCli(argv: string[], answer = '{"ok":true}') {
  const calls: Call[] = []
  const program = new Command().option('--json').exitOverride()
  registerWebshopCommands(program, {}, async (name, args) => {
    calls.push({ name, args })
    return answer
  })
  await program.parseAsync(['node', 'haszno', ...argv])
  return calls
}

let out: string[]
let err: string[]
beforeEach(() => {
  out = []
  err = []
  process.exitCode = 0
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (out.push(String(chunk)), true))
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { err.push(String(chunk)); return true })
})
afterEach(() => {
  vi.restoreAllMocks()
  process.exitCode = 0
})

describe('haszno webshop commands → MCP tools', () => {
  it('maps the read commands', async () => {
    expect(await runCli(['webshop', 'list'])).toEqual([{ name: 'haszno_webshop_list', args: {} }])
    expect(await runCli(['webshop', 'pages', '--slug', 'pekseg'])).toEqual([{ name: 'haszno_webshop_list_pages', args: { slug: 'pekseg' } }])
    expect(await runCli(['webshop', 'inspect'])).toEqual([{ name: 'haszno_webshop_inspect', args: {} }])
    expect(await runCli(['webshop', 'inspect', 'rolunk'])).toEqual([{ name: 'haszno_webshop_inspect_page', args: { page: 'rolunk' } }])
    expect(await runCli(['webshop', 'widget', 'hero'])).toEqual([{ name: 'haszno_webshop_describe_widget', args: { type: 'hero' } }])
    expect(await runCli(['webshop', 'guide', 'pages'])).toEqual([{ name: 'haszno_site_builder_skill', args: { section: 'pages' } }])
  })

  it('batch sends the ops with baseVersion, expect and dryRun', async () => {
    const calls = await runCli(['webshop', 'batch', '--ops', '[{"op":"create_page","slug":"rolunk","title":"Rólunk"}]',
      '--base-version', '7', '--expect', '{"pages":{"rolunk":{"widgets":0}}}', '--dry-run'])
    expect(calls).toEqual([{
      name: 'haszno_webshop_page_batch',
      args: { ops: [{ op: 'create_page', slug: 'rolunk', title: 'Rólunk' }], baseVersion: 7, expect: { pages: { rolunk: { widgets: 0 } } }, dryRun: true },
    }])
  })

  it('batch refuses ops that are not a JSON array, without calling the server', async () => {
    expect(await runCli(['webshop', 'batch', '--ops', '{"op":"x"}'])).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
    expect(await runCli(['webshop', 'batch', '--ops', 'not json'])).toEqual([])
    expect(process.exitCode).toBe(1)
    expect(await runCli(['webshop', 'batch', '--ops', '[]', '--base-version', 'x'])).toEqual([])
  })

  it('brand maps its flags to the tool arguments', async () => {
    expect(await runCli(['webshop', 'brand', '--primary', '#0f766e', '--font', 'Inter', '--base-version', '3'])).toEqual([
      { name: 'haszno_webshop_set_brand', args: { primaryColor: '#0f766e', fontFamily: 'Inter', baseVersion: 3 } },
    ])
  })

  it('publish needs --yes', async () => {
    expect(await runCli(['webshop', 'publish'])).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
    expect(await runCli(['webshop', 'publish', '--yes'])).toEqual([{ name: 'haszno_webshop_publish', args: {} }])
  })

  it('tool calls only haszno_webshop_* tools', async () => {
    expect(await runCli(['webshop', 'tool', 'haszno_orders_list'])).toEqual([])
    expect(process.exitCode).toBe(1)
    process.exitCode = 0
    expect(await runCli(['webshop', 'tool', 'haszno_webshop_undo', '--args', '{"baseVersion":4}'])).toEqual([
      { name: 'haszno_webshop_undo', args: { baseVersion: 4 } },
    ])
  })

  it('prints JSON answers pretty, compact with --json, and plain text as it is', async () => {
    await runCli(['webshop', 'list'], '{"items":[]}')
    expect(out.join('')).toBe('{\n  "items": []\n}\n')
    out.length = 0
    await runCli(['--json', 'webshop', 'list'], '{"items":[]}')
    expect(out.join('')).toBe('{"items":[]}\n')
    out.length = 0
    await runCli(['webshop', 'preview'], 'https://example.test/x')
    expect(out.join('')).toBe('https://example.test/x\n')
  })
})

describe('callMcpTool', () => {
  const opts = (fetchImpl: typeof fetch, apiKey = 'haszno_test_token_1234') => ({ baseUrl: 'https://api.test', apiKey, fetch: fetchImpl, readConfig: () => ({}) })

  it('posts a tools/call with the token as Bearer and returns the text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ok' }] } })))
    expect(await callMcpTool('haszno_webshop_list', { a: 1 }, opts(fetchMock as unknown as typeof fetch))).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.test/api/mcp')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer haszno_test_token_1234')
    expect(JSON.parse(String(init.body))).toMatchObject({ method: 'tools/call', params: { name: 'haszno_webshop_list', arguments: { a: 1 } } })
  })

  it('reads an event-stream answer', async () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"sse"}]}}\n\n'
    expect(await callMcpTool('x', {}, opts((async () => new Response(body)) as unknown as typeof fetch))).toBe('sse')
  })

  it('throws McpToolError with the tool’s message when the tool reports an error', async () => {
    const res = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [{ type: 'text', text: 'A vázlat megváltozott' }] } })
    await expect(callMcpTool('x', {}, opts((async () => new Response(res)) as unknown as typeof fetch))).rejects.toThrow(McpToolError)
  })

  it('needs a shop token and never calls the server without one; a rejected key is a clear error', async () => {
    const fetchMock = vi.fn()
    await expect(callMcpTool('x', {}, opts(fetchMock as unknown as typeof fetch, 'legacy-key'))).rejects.toThrow(/haszno_/)
    expect(fetchMock).not.toHaveBeenCalled()
    await expect(callMcpTool('x', {}, opts((async () => new Response('', { status: 401 })) as unknown as typeof fetch)))
      .rejects.toMatchObject({ status: 401, code: 'unauthenticated' })
  })
})
