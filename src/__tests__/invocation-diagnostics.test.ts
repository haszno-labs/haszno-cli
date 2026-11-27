import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const token = `haszno_${'t'.repeat(43)}`
const fixture = mkdtempSync(join(tmpdir(), 'haszno-cli-diagnostics-'))
const requests: { path?: string; tool?: string; auth?: string; body?: unknown }[] = []
const server = createServer(async (req, res) => {
  let raw = ''
  for await (const chunk of req) raw += chunk
  const tool = req.headers['x-haszno-tool']
  requests.push({
    path: req.url, tool: typeof tool === 'string' ? tool : undefined,
    auth: req.headers.authorization, body: raw ? JSON.parse(raw) : undefined,
  })
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/api/openapi.json') {
    res.end(JSON.stringify({ paths: { '/api/test': { get: { 'x-haszno-risk': 'read' } } } }))
  } else if (req.url?.includes('forbidden')) {
    res.statusCode = 403
    res.end(JSON.stringify({ error: 'Private error message' }))
  } else if (req.url === '/api/agent/diagnostics') {
    res.statusCode = 503 // Diagnostic rejection never retries or changes the command outcome.
    res.end('{}')
  } else {
    res.end('{"ok":true}')
  }
})

beforeAll(() => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)))
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
  rmSync(fixture, { recursive: true, force: true })
})

function cli(enabled: boolean, args: string[]) {
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/vite-node/vite-node.mjs', 'src/index.ts', '--',
      '--json', '--api-url', base, '--api-key', token, ...args], {
      env: { ...process.env, HOME: fixture, USERPROFILE: fixture, HASZNO_DIAGNOSTICS: enabled ? '1' : '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('CLI invocation diagnostics', () => {
  it('reports one command, not two HTTP requests, even when reporting fails', async () => {
    const before = requests.length
    const result = await cli(true, ['api', 'GET', '/api/test', '--query', 'private=some-value'])
    expect(result).toMatchObject({ code: 0, stderr: '' })
    expect(JSON.parse(result.stdout)).toEqual({ ok: true })
    expect(requests.slice(before)).toEqual([
      { path: '/api/openapi.json', tool: 'cli api get', auth: `Bearer ${token}`, body: undefined },
      { path: '/api/test?private=some-value', tool: 'cli api get', auth: `Bearer ${token}`, body: undefined },
      { path: '/api/agent/diagnostics', tool: undefined, auth: `Bearer ${token}`,
        body: { source: 'cli', kind: 'invocation', target: 'api.get', outcome: 'ok' } },
    ])
  }, 15000)

  it('reports permission failures and unknown commands without sending arguments or raw errors', async () => {
    const forbidden = await cli(true, ['api', 'get', '/api/forbidden'])
    expect(forbidden.code).toBe(1)
    expect(JSON.parse(forbidden.stderr)).toMatchObject({ status: 403 })
    expect(requests.at(-1)?.body).toEqual({
      source: 'cli', kind: 'invocation', target: 'api.get', outcome: 'blocked', reason: 'permission_denied',
    })
    const missing = await cli(true, ['private-misspelling'])
    expect(missing.code).toBe(1)
    expect(requests.at(-1)?.body).toEqual({
      source: 'cli', kind: 'invocation', target: 'command-not-found', outcome: 'blocked', reason: 'not_available',
    })
  }, 15000)

  it('does not report when disabled or for help output', async () => {
    const before = requests.length
    expect((await cli(false, ['api', 'get', '/api/test'])).code).toBe(0)
    expect((await cli(true, ['products', '--help'])).code).toBe(0)
    const observed = requests.slice(before)
    expect(observed.some((request) => request.path === '/api/test')).toBe(true)
    expect(observed.some((request) => request.path === '/api/agent/diagnostics')).toBe(false)
  }, 15000)

  it('keeps the typed reason when an action sets an exit code without throwing', async () => {
    const before = requests.length
    const blocked = await cli(true, ['webshop', 'publish'])
    expect(blocked.code).toBe(1)
    expect(JSON.parse(blocked.stderr)).toMatchObject({ code: 'confirmation_required' })
    expect(requests.slice(before)).toMatchObject([{
      path: '/api/agent/diagnostics',
      body: { source: 'cli', kind: 'invocation', target: 'webshop.publish', outcome: 'blocked', reason: 'permission_denied' },
    }])
  }, 15000)
})
