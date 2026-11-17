/**
 * Vászon bridge — agent state machine, permission handling and the loopback HTTP server.
 * The ACP adapter is replaced by an in-memory scripted transport; no process is spawned.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { AcpTransport } from '../bridge/acp.js'
import {
  VaszonAgent,
  displayToolName,
  resultPreviewOf,
  ADAPTER_INSTALL_COMMAND,
  CLAUDE_LOGIN_COMMAND,
  HASZNO_LOGIN_COMMAND,
  type LoggedEvent,
} from '../bridge/agent.js'
import { createBridgeServer, isLoopbackHost } from '../bridge/server.js'
import { allowedOriginsFor, hasznoMcpServers, loadOrCreatePairingToken, pairingLink } from '../commands/vaszon.js'

type Msg = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: unknown }

/** A scripted stand-in for the adapter process. `handle` answers the client's messages. */
function fakeAdapter(handle: (msg: Msg, api: { send: (m: object) => void; close: (r: { code: number | null; error?: NodeJS.ErrnoException }) => void }) => void) {
  const received: Msg[] = []
  let lineCb: (line: string) => void = () => {}
  let closeCb: (r: { code: number | null; error?: NodeJS.ErrnoException }) => void = () => {}
  const api = {
    send: (m: object) => queueMicrotask(() => lineCb(JSON.stringify({ jsonrpc: '2.0', ...m }))),
    close: (r: { code: number | null; error?: NodeJS.ErrnoException }) => queueMicrotask(() => closeCb(r)),
  }
  const transport: AcpTransport = {
    write: (line) => {
      const msg = JSON.parse(line) as Msg
      received.push(msg)
      handle(msg, api)
    },
    onLine: (cb) => { lineCb = cb },
    onClose: (cb) => { closeCb = cb },
    kill: () => {},
  }
  return { transport, received, api }
}

/** Answers the session handshake; `onPrompt` scripts the turn. */
function handshake(onPrompt?: (msg: Msg, api: { send: (m: object) => void }) => void) {
  return (msg: Msg, api: { send: (m: object) => void }) => {
    if (msg.method === 'initialize') api.send({ id: msg.id, result: { protocolVersion: 1 } })
    else if (msg.method === 'session/new') api.send({ id: msg.id, result: { sessionId: 's1' } })
    else if (msg.method === 'session/set_mode') api.send({ id: msg.id, result: {} })
    else if (msg.method === 'session/prompt') onPrompt?.(msg, api)
  }
}

const MCP = [{ type: 'http' as const, name: 'haszno', url: 'https://haszno.com/api/mcp', headers: [] }]
const newAgent = (spawn: () => AcpTransport, mcpServers: typeof MCP | null = MCP) =>
  new VaszonAgent({ mcpServers, cwd: '/tmp', systemPrompt: 'test', spawn })

const tick = () => new Promise((r) => setTimeout(r, 5))
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !cond(); i++) await tick()
  if (!cond()) throw new Error('condition not reached')
}

describe('VaszonAgent — states', () => {
  it('reaches ready and opens an isolated session with only the Haszno MCP server', async () => {
    const fake = fakeAdapter(handshake())
    const agent = newAgent(() => fake.transport)
    await agent.start()
    expect(agent.state()).toMatchObject({ state: 'ready', command: null, busy: false })

    const session = fake.received.find((m) => m.method === 'session/new')!
    expect(session.params!['mcpServers']).toEqual(MCP)
    const options = (session.params!['_meta'] as { claudeCode: { options: Record<string, unknown> } }).claudeCode.options
    expect(options).toMatchObject({ tools: [], settingSources: [], strictMcpConfig: true })
    expect(fake.received.find((m) => m.method === 'session/set_mode')!.params).toMatchObject({ modeId: 'default' })
  })

  it('reports not_installed with the install command when the adapter is missing', async () => {
    const fake = fakeAdapter((msg, api) => {
      if (msg.method === 'initialize') api.close({ code: null, error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) })
    })
    const agent = newAgent(() => fake.transport)
    await agent.start()
    expect(agent.state()).toMatchObject({ state: 'not_installed', command: ADAPTER_INSTALL_COMMAND })
  })

  it('reports auth_required with the login command when Claude Code is signed out', async () => {
    const fake = fakeAdapter((msg, api) => {
      if (msg.method === 'initialize') api.send({ id: msg.id, result: {} })
      else if (msg.method === 'session/new') api.send({ id: msg.id, error: { code: -32000, message: 'Authentication required' } })
    })
    const agent = newAgent(() => fake.transport)
    await agent.start()
    expect(agent.state()).toMatchObject({ state: 'auth_required', command: CLAUDE_LOGIN_COMMAND })
  })

  it('reports haszno_login without starting the adapter when there is no shop token', async () => {
    let spawned = false
    const agent = newAgent(() => { spawned = true; return fakeAdapter(() => {}).transport }, null)
    await agent.start()
    expect(spawned).toBe(false)
    expect(agent.state()).toMatchObject({ state: 'haszno_login', command: HASZNO_LOGIN_COMMAND })
  })

  it('keeps the plan label but never the e-mail of the Claude account', async () => {
    const fake = fakeAdapter(handshake())
    const agent = newAgent(() => fake.transport)
    await agent.start()
    fake.api.send({ method: 'auth/status_update', params: { state: 'authenticated', accounts: [{ label: 'Claude Max', active: true, email: 'someone@example.com' }] } })
    await until(() => agent.state().account !== null)
    expect(JSON.stringify(agent.state())).not.toContain('someone@example.com')
    expect(agent.state().account).toBe('Claude Max')
  })
})

describe('VaszonAgent — turns and permissions', () => {
  const toolCall = (name: string, input: Record<string, unknown>) => ({
    toolCallId: 't1',
    title: name,
    rawInput: input,
    _meta: { claudeCode: { toolName: name } },
  })
  const options = [
    { optionId: 'allow-once', kind: 'allow_once' },
    { optionId: 'allow-always', kind: 'allow_always' },
    { optionId: 'reject', kind: 'reject_once' },
  ]

  it('streams text, asks for permission, and finishes the turn after approval', async () => {
    let promptId: number | undefined
    const fake = fakeAdapter(handshake((msg, api) => {
      promptId = msg.id
      api.send({ method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', messageId: 'm1', content: { type: 'text', text: 'Átírom a főcímet.' } } } })
      api.send({ method: 'session/update', params: { update: { sessionUpdate: 'tool_call', status: 'pending', ...toolCall('mcp__haszno__haszno_webshop_set_headline', {}) } } })
      api.send({ id: 900, method: 'session/request_permission', params: { toolCall: toolCall('mcp__haszno__haszno_webshop_set_headline', { headline: 'Őszi akció' }), options } })
    }))
    const agent = newAgent(() => fake.transport)
    const events: LoggedEvent[] = []
    agent.onEvent((e) => events.push(e))
    await agent.start()

    expect(agent.prompt('<canvas>{}</canvas>\nÍrd át a főcímet', 'Írd át a főcímet')).toEqual({ ok: true })
    expect(agent.prompt('még egy')).toEqual({ ok: false, error: 'busy' })
    await until(() => events.some((e) => e.type === 'permission'))

    expect(events.find((e) => e.type === 'user')).toMatchObject({ text: 'Írd át a főcímet' })
    expect(fake.received.find((m) => m.method === 'session/prompt')!.params!['prompt']).toEqual([{ type: 'text', text: '<canvas>{}</canvas>\nÍrd át a főcímet' }])
    expect(events.find((e) => e.type === 'permission')).toMatchObject({ id: 't1', tool: 'haszno_webshop_set_headline', input: { headline: 'Őszi akció' } })

    expect(agent.decide('t1', 'approve')).toBe(true)
    expect(agent.decide('t1', 'approve')).toBe(false)
    await until(() => fake.received.some((m) => m.id === 900))
    expect(fake.received.find((m) => m.id === 900)!.result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow-once' } })

    fake.api.send({ method: 'session/update', params: { update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', rawOutput: [{ type: 'text', text: '{"ok":true}' }] } } })
    fake.api.send({ id: promptId, result: { stopReason: 'end_turn' } })
    await until(() => events.some((e) => e.type === 'turn' && e.status === 'done'))

    const lastTool = events.filter((e) => e.type === 'tool').at(-1)
    expect(lastTool).toMatchObject({ id: 't1', tool: 'haszno_webshop_set_headline', status: 'ok', resultPreview: '{"ok":true}', input: { headline: 'Őszi akció' } })
    expect(agent.state().busy).toBe(false)
    // A browser that connects late gets the whole conversation.
    expect(agent.eventsSince(0).map((e) => e.seq)).toEqual(events.map((e) => e.seq))
  })

  it('refuses any tool that is not a Haszno MCP tool, without asking the user', async () => {
    const fake = fakeAdapter(handshake((_msg, api) => {
      api.send({ id: 901, method: 'session/request_permission', params: { toolCall: toolCall('Bash', { command: 'rm -rf ~' }), options } })
    }))
    const agent = newAgent(() => fake.transport)
    const events: LoggedEvent[] = []
    agent.onEvent((e) => events.push(e))
    await agent.start()
    agent.prompt('futtass parancsot')
    await until(() => fake.received.some((m) => m.id === 901))
    expect(fake.received.find((m) => m.id === 901)!.result).toEqual({ outcome: { outcome: 'selected', optionId: 'reject' } })
    expect(events.some((e) => e.type === 'permission')).toBe(false)
  })

  it('cancel answers open prompts as cancelled and notifies the agent', async () => {
    const fake = fakeAdapter(handshake((_msg, api) => {
      api.send({ id: 902, method: 'session/request_permission', params: { toolCall: toolCall('mcp__haszno__haszno_rules_run', { id: 2 }), options } })
    }))
    const agent = newAgent(() => fake.transport)
    const events: LoggedEvent[] = []
    agent.onEvent((e) => events.push(e))
    await agent.start()
    agent.prompt('futtasd a szabályt')
    await until(() => events.some((e) => e.type === 'permission'))
    agent.cancel()
    await until(() => fake.received.some((m) => m.id === 902))
    expect(fake.received.find((m) => m.id === 902)!.result).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(fake.received.some((m) => m.method === 'session/cancel')).toBe(true)
    expect(events.find((e) => e.type === 'permission_resolved')).toMatchObject({ id: 't1', decision: 'reject' })
  })

  it('refuses a permission request that arrives from a replaced adapter', async () => {
    const first = fakeAdapter(handshake())
    const second = fakeAdapter(handshake())
    const transports = [first.transport, second.transport]
    const agent = newAgent(() => transports.shift()!)
    const events: LoggedEvent[] = []
    agent.onEvent((e) => events.push(e))
    await agent.start()
    await agent.start()
    first.api.send({ id: 903, method: 'session/request_permission', params: { toolCall: toolCall('mcp__haszno__haszno_rules_run', { id: 2 }), options } })
    await until(() => first.received.some((m) => m.id === 903))
    expect(first.received.find((m) => m.id === 903)!.error).toMatchObject({ code: -32099 })
    expect(events.some((e) => e.type === 'permission')).toBe(false)
  })

  it('refuses a prompt while not ready', async () => {
    const agent = newAgent(() => fakeAdapter(() => {}).transport, null)
    await agent.start()
    expect(agent.prompt('szia')).toEqual({ ok: false, error: 'not_ready' })
  })
})

describe('bridge HTTP server', () => {
  let server: Server | undefined
  afterEach(() => { server?.close(); server = undefined })

  async function boot() {
    const fake = fakeAdapter(handshake())
    const agent = newAgent(() => fake.transport)
    await agent.start()
    // Listen on an ephemeral port first, then build the server that knows it.
    const probe = createBridgeServer({ agent, token: 'x', port: 0, allowedOrigins: [], shop: null, version: 't' })
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r))
    const port = (probe.address() as AddressInfo).port
    await new Promise((r) => probe.close(r))
    server = createBridgeServer({ agent, token: 'secret-token', port, allowedOrigins: ['https://haszno.com'], shop: { id: 7, name: 'Teszt bolt' }, version: 't' })
    await new Promise<void>((r) => server!.listen(port, '127.0.0.1', r))
    return { base: `http://127.0.0.1:${port}`, agent }
  }
  const auth = { Authorization: 'Bearer secret-token' }

  it('requires the pairing token', async () => {
    const { base } = await boot()
    expect((await fetch(`${base}/status`)).status).toBe(401)
    expect((await fetch(`${base}/status`, { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401)
  })

  it('answers status to a paired, allowed origin with CORS headers', async () => {
    const { base } = await boot()
    const res = await fetch(`${base}/status`, { headers: { ...auth, Origin: 'https://haszno.com' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://haszno.com')
    expect(await res.json()).toMatchObject({ app: 'haszno-vaszon', state: 'ready', shop: { id: 7, name: 'Teszt bolt' } })
  })

  it('refuses other web origins even with the right token', async () => {
    const { base } = await boot()
    const res = await fetch(`${base}/status`, { headers: { ...auth, Origin: 'https://evil.example' } })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers the private-network preflight for an allowed origin', async () => {
    const { base } = await boot()
    const res = await fetch(`${base}/prompt`, { method: 'OPTIONS', headers: { Origin: 'https://haszno.com', 'Access-Control-Request-Method': 'POST' } })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-private-network')).toBe('true')
  })

  it('validates request bodies', async () => {
    const { base } = await boot()
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect((await post('/prompt', {})).status).toBe(400)
    expect((await post('/permission', { id: 'nope', decision: 'approve' })).status).toBe(404)
    expect((await post('/permission', { id: 'x', decision: 'maybe' })).status).toBe(400)
    expect((await post('/nope', {})).status).toBe(404)
  })

  it('only accepts the loopback host name', () => {
    expect(isLoopbackHost('127.0.0.1:47600', 47600)).toBe(true)
    expect(isLoopbackHost('localhost:47600', 47600)).toBe(true)
    expect(isLoopbackHost('evil.example:47600', 47600)).toBe(false)
    expect(isLoopbackHost(undefined, 47600)).toBe(false)
  })
})

describe('helpers', () => {
  it('strips the MCP prefix from tool names', () => {
    expect(displayToolName('mcp__haszno__haszno_orders_list')).toBe('haszno_orders_list')
    expect(displayToolName('Bash')).toBe('Bash')
  })

  it('builds a result preview from content blocks', () => {
    expect(resultPreviewOf([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb')
    expect(resultPreviewOf(undefined)).toBeNull()
    expect(resultPreviewOf('x'.repeat(5000))!.length).toBe(2001)
  })

  it('hands the session the hosted MCP server only for a shop token', () => {
    expect(hasznoMcpServers({ baseUrl: 'https://haszno.com', apiKey: 'legacy-key' })).toBeNull()
    expect(hasznoMcpServers({ baseUrl: 'https://haszno.com' })).toBeNull()
    expect(hasznoMcpServers({ baseUrl: 'https://haszno.com', apiKey: 'haszno_live_abc' })).toEqual([
      { type: 'http', name: 'haszno', url: 'https://haszno.com/api/mcp', headers: [{ name: 'Authorization', value: 'Bearer haszno_live_abc' }] },
    ])
  })

  it('allows the configured site (and www for haszno.com), plus explicit extras', () => {
    expect(allowedOriginsFor('https://haszno.com')).toEqual(['https://haszno.com', 'https://www.haszno.com'])
    expect(allowedOriginsFor('http://localhost:8787', ['http://localhost:5173/app', 'not a url'])).toEqual(['http://localhost:8787', 'http://localhost:5173'])
  })

  it('creates the pairing token once, private to the user', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'haszno-vaszon-')), 'vaszon-bridge.json')
    const token = loadOrCreatePairingToken(path)
    expect(token).toMatch(/^[a-f0-9]{48}$/)
    expect(loadOrCreatePairingToken(path)).toBe(token)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ token })
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(pairingLink('https://haszno.com', 47600, token)).toBe(`https://haszno.com/app/vaszon#hid=47600.${token}`)
  })
})
