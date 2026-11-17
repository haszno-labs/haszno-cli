/**
 * Vászon bridge — drives the user's own Claude Code through the ACP adapter
 * (`@agentclientprotocol/claude-agent-acp`). No API key is handled here: Claude Code runs with
 * its own login. The agent gets exactly one MCP server (Haszno) and no built-in tools, so it can
 * act on the shop but not on the machine.
 */
import { AcpConnection, spawnTransport, type AcpTransport, type RpcError } from './acp.js'

export const ADAPTER_COMMAND = 'claude-agent-acp'
export const ADAPTER_INSTALL_COMMAND = 'npm install -g @agentclientprotocol/claude-agent-acp'
export const CLAUDE_LOGIN_COMMAND = 'claude-agent-acp --cli auth login --claudeai'
export const HASZNO_LOGIN_COMMAND = 'haszno login'

/** JSON-RPC error code the adapter answers with when Claude Code is not signed in. */
const AUTH_REQUIRED_CODE = -32000
const MCP_TOOL_PREFIX = 'mcp__haszno__'
const MAX_PROMPT_CHARS = 8_000
const MAX_RESULT_PREVIEW_CHARS = 2_000
/** Events kept for a browser that (re)connects mid-conversation. */
const MAX_LOG_EVENTS = 4_000

export type BridgeState =
  /** the adapter is starting / the session is being created */
  | 'starting'
  /** a session is open and accepts prompts */
  | 'ready'
  /** Claude Code is not signed in on this machine */
  | 'auth_required'
  /** the adapter is not installed */
  | 'not_installed'
  /** the CLI has no Haszno shop token (`haszno login`) */
  | 'haszno_login'
  | 'error'

export interface StateSnapshot {
  state: BridgeState
  /** human-readable reason for `error` */
  detail: string | null
  /** command the user should run for `not_installed` / `auth_required` / `haszno_login` */
  command: string | null
  /** Claude plan label, e.g. "Claude Max" — never the e-mail address */
  account: string | null
  busy: boolean
}

export type ToolStatus = 'running' | 'ok' | 'error'

export type BridgeEvent =
  | { type: 'reset' }
  | { type: 'user'; text: string }
  | { type: 'text'; messageId: string; text: string }
  | { type: 'tool'; id: string; tool: string; input: Record<string, unknown>; status: ToolStatus; resultPreview: string | null }
  | { type: 'permission'; id: string; toolId: string; tool: string; input: Record<string, unknown> }
  | { type: 'permission_resolved'; id: string; decision: 'approve' | 'reject' }
  | { type: 'turn'; status: 'running' | 'done' | 'stopped' | 'error'; message: string | null }

export type LoggedEvent = BridgeEvent & { seq: number }

export interface McpServerConfig {
  type?: 'http'
  name: string
  [key: string]: unknown
}

export interface AgentOptions {
  /** MCP servers handed to the session; `null` means the CLI has no usable Haszno credentials. */
  mcpServers: McpServerConfig[] | null
  /** Empty working directory for the Claude Code session. */
  cwd: string
  systemPrompt: string
  /** Injectable for tests. */
  spawn?: () => AcpTransport
}

type PermissionOption = { optionId: string; kind: string }
type PendingPermission = {
  options: PermissionOption[]
  resolve: (result: unknown) => void
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** `mcp__haszno__haszno_orders_list` → `haszno_orders_list`; anything else is returned unchanged. */
export function displayToolName(raw: string): string {
  return raw.startsWith(MCP_TOOL_PREFIX) ? raw.slice(MCP_TOOL_PREFIX.length) : raw
}

export function isHasznoTool(raw: string): boolean {
  return raw.startsWith(MCP_TOOL_PREFIX)
}

function toolNameOf(call: Record<string, unknown>): string {
  const meta = isRecord(call['_meta']) && isRecord(call['_meta']['claudeCode']) ? call['_meta']['claudeCode'] : undefined
  const fromMeta = meta && typeof meta['toolName'] === 'string' ? meta['toolName'] : undefined
  if (fromMeta) return fromMeta
  if (typeof call['name'] === 'string') return call['name']
  return typeof call['title'] === 'string' ? call['title'] : ''
}

/** Text of an ACP tool result (`rawOutput` content blocks or a plain value), cut to a preview. */
export function resultPreviewOf(rawOutput: unknown): string | null {
  let text = ''
  if (typeof rawOutput === 'string') text = rawOutput
  else if (Array.isArray(rawOutput)) {
    text = rawOutput
      .map((b) => (isRecord(b) && typeof b['text'] === 'string' ? b['text'] : ''))
      .filter(Boolean)
      .join('\n')
  } else if (rawOutput != null) {
    try { text = JSON.stringify(rawOutput) } catch { text = '' }
  }
  if (!text) return null
  return text.length > MAX_RESULT_PREVIEW_CHARS ? text.slice(0, MAX_RESULT_PREVIEW_CHARS) + '…' : text
}

export class VaszonAgent {
  private conn: AcpConnection | null = null
  private sessionId: string | null = null
  private snapshot: StateSnapshot = { state: 'starting', detail: null, command: null, account: null, busy: false }
  private log: LoggedEvent[] = []
  private seq = 0
  private listeners = new Set<(e: LoggedEvent) => void>()
  private stateListeners = new Set<(s: StateSnapshot) => void>()
  private permissions = new Map<string, PendingPermission>()
  private tools = new Map<string, { tool: string; input: Record<string, unknown>; status: ToolStatus; resultPreview: string | null }>()
  /** Bumped on every (re)start so callbacks of a previous adapter process are ignored. */
  private generation = 0

  constructor(private opts: AgentOptions) {}

  // ── Observation ────────────────────────────────────────────────────────────

  state(): StateSnapshot {
    return { ...this.snapshot }
  }

  /** Conversation events after `since` (a sequence number), for a browser that just connected. */
  eventsSince(since: number): LoggedEvent[] {
    return this.log.filter((e) => e.seq > since)
  }

  onEvent(cb: (e: LoggedEvent) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  onState(cb: (s: StateSnapshot) => void): () => void {
    this.stateListeners.add(cb)
    return () => this.stateListeners.delete(cb)
  }

  private setState(patch: Partial<StateSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const cb of this.stateListeners) cb(this.state())
  }

  private emit(event: BridgeEvent): void {
    const logged = { ...event, seq: ++this.seq } as LoggedEvent
    this.log.push(logged)
    if (this.log.length > MAX_LOG_EVENTS) this.log.splice(0, this.log.length - MAX_LOG_EVENTS)
    for (const cb of this.listeners) cb(logged)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Start (or restart) the adapter and open a fresh session. Never throws: failures become states. */
  async start(): Promise<void> {
    const generation = ++this.generation
    this.stop()
    this.sessionId = null
    this.setState({ state: 'starting', detail: null, command: null, busy: false })

    if (!this.opts.mcpServers) {
      this.setState({ state: 'haszno_login', command: HASZNO_LOGIN_COMMAND })
      return
    }

    const transport = this.opts.spawn ? this.opts.spawn() : spawnTransport(ADAPTER_COMMAND, [], process.env)
    const conn = new AcpConnection(
      transport,
      (method, params) => { if (generation === this.generation) this.handleNotification(method, params) },
      (method, params) =>
        // A request still in the pipe of a replaced adapter must never reach the user as a prompt.
        generation === this.generation
          ? this.handleRequest(method, params)
          : Promise.reject({ code: -32099, message: 'Stale session' } satisfies RpcError),
      (reason) => {
        if (generation !== this.generation) return
        this.conn = null
        this.sessionId = null
        this.failPendingPermissions()
        if (reason.error?.code === 'ENOENT' || reason.code === 127) {
          this.setState({ state: 'not_installed', command: ADAPTER_INSTALL_COMMAND, detail: null, busy: false })
        } else if (this.snapshot.state !== 'auth_required') {
          this.setState({ state: 'error', detail: 'A Claude Code adapter leállt.', command: null, busy: false })
        }
      },
    )
    this.conn = conn

    try {
      await conn.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: 'haszno-vaszon', title: 'Haszno Vászon', version: '1' },
      })
      const session = await conn.request<{ sessionId: string }>('session/new', {
        cwd: this.opts.cwd,
        mcpServers: this.opts.mcpServers,
        _meta: {
          systemPrompt: this.opts.systemPrompt,
          // No built-in tools (no shell, no file access) and none of the user's own Claude Code
          // settings, hooks or MCP servers: the agent only reaches the Haszno MCP server.
          claudeCode: { options: { tools: [], settingSources: [], strictMcpConfig: true } },
        },
      })
      if (generation !== this.generation) return
      // "default" = ask before every tool call; the browser panel decides what needs the user.
      await conn.request('session/set_mode', { sessionId: session.sessionId, modeId: 'default' })
      if (generation !== this.generation) return
      this.sessionId = session.sessionId
      this.setState({ state: 'ready', detail: null, command: null })
    } catch (err) {
      if (generation !== this.generation) return
      this.handleStartError(err as RpcError)
    }
  }

  private handleStartError(err: RpcError): void {
    const terminal: BridgeState[] = ['not_installed', 'auth_required']
    if (terminal.includes(this.snapshot.state)) return
    if (err?.code === AUTH_REQUIRED_CODE) {
      this.setState({ state: 'auth_required', command: CLAUDE_LOGIN_COMMAND, detail: null })
      return
    }
    this.setState({ state: 'error', detail: typeof err?.message === 'string' ? err.message : 'Ismeretlen hiba', command: null })
  }

  stop(): void {
    this.failPendingPermissions()
    const conn = this.conn
    this.conn = null
    conn?.close()
  }

  /** New conversation: the event log is cleared and a fresh Claude Code session is opened. */
  async reset(): Promise<void> {
    this.log = []
    this.tools.clear()
    this.emit({ type: 'reset' })
    await this.start()
  }

  // ── Turns ──────────────────────────────────────────────────────────────────

  /**
   * Send a user message. `label` is what the panel shows for it (the prompt itself may carry
   * extra canvas context). Resolves when the turn has been accepted, not when it ends.
   */
  prompt(text: string, label?: string): { ok: true } | { ok: false; error: string } {
    const conn = this.conn
    const sessionId = this.sessionId
    if (this.snapshot.state !== 'ready' || !conn || !sessionId) return { ok: false, error: 'not_ready' }
    if (this.snapshot.busy) return { ok: false, error: 'busy' }
    const trimmed = text.trim().slice(0, MAX_PROMPT_CHARS)
    if (!trimmed) return { ok: false, error: 'empty' }

    const generation = this.generation
    this.setState({ busy: true })
    this.emit({ type: 'user', text: (label?.trim() || trimmed).slice(0, MAX_PROMPT_CHARS) })
    this.emit({ type: 'turn', status: 'running', message: null })

    conn.request<{ stopReason?: string }>('session/prompt', { sessionId, prompt: [{ type: 'text', text: trimmed }] }).then(
      (result) => {
        if (generation !== this.generation) return
        this.setState({ busy: false })
        this.emit({ type: 'turn', status: result?.stopReason === 'cancelled' ? 'stopped' : 'done', message: null })
      },
      (err: RpcError) => {
        if (generation !== this.generation) return
        this.setState({ busy: false })
        if (err?.code === AUTH_REQUIRED_CODE) {
          this.setState({ state: 'auth_required', command: CLAUDE_LOGIN_COMMAND })
        }
        this.emit({ type: 'turn', status: 'error', message: typeof err?.message === 'string' ? err.message : 'Ismeretlen hiba' })
      },
    )
    return { ok: true }
  }

  /** Stop the running turn; open permission prompts are answered as cancelled. */
  cancel(): void {
    if (!this.conn || !this.sessionId) return
    this.failPendingPermissions()
    this.conn.notify('session/cancel', { sessionId: this.sessionId })
  }

  /** The user's answer to a permission prompt. Returns false for an unknown / already answered id. */
  decide(id: string, decision: 'approve' | 'reject'): boolean {
    const pending = this.permissions.get(id)
    if (!pending) return false
    this.permissions.delete(id)
    const kind = decision === 'approve' ? 'allow_once' : 'reject_once'
    const option = pending.options.find((o) => o.kind === kind)
    pending.resolve(option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : { outcome: { outcome: 'cancelled' } })
    this.emit({ type: 'permission_resolved', id, decision: option ? decision : 'reject' })
    return true
  }

  private failPendingPermissions(): void {
    for (const [id, pending] of this.permissions) {
      pending.resolve({ outcome: { outcome: 'cancelled' } })
      this.emit({ type: 'permission_resolved', id, decision: 'reject' })
    }
    this.permissions.clear()
  }

  // ── Agent → bridge ─────────────────────────────────────────────────────────

  private handleRequest(method: string, params: unknown): Promise<unknown> {
    if (method !== 'session/request_permission' || !isRecord(params) || !isRecord(params['toolCall'])) {
      return Promise.reject({ code: -32601, message: 'Method not found' } satisfies RpcError)
    }
    const call = params['toolCall']
    const options = (Array.isArray(params['options']) ? params['options'] : []).filter(
      (o): o is PermissionOption => isRecord(o) && typeof o['optionId'] === 'string' && typeof o['kind'] === 'string',
    )
    const rawName = toolNameOf(call)
    const toolId = typeof call['toolCallId'] === 'string' ? call['toolCallId'] : ''

    // Only Haszno tools can ever run. Anything else is refused here, without asking.
    if (!isHasznoTool(rawName) || !toolId) {
      const reject = options.find((o) => o.kind === 'reject_once')
      return Promise.resolve(reject ? { outcome: { outcome: 'selected', optionId: reject.optionId } } : { outcome: { outcome: 'cancelled' } })
    }

    const input = isRecord(call['rawInput']) ? call['rawInput'] : {}
    this.upsertTool(toolId, rawName, { input })
    return new Promise((resolve) => {
      this.permissions.set(toolId, { options, resolve })
      this.emit({ type: 'permission', id: toolId, toolId, tool: displayToolName(rawName), input })
    })
  }

  private handleNotification(method: string, params: unknown): void {
    if (!isRecord(params)) return

    if (method === 'auth/status_update') {
      const accounts = Array.isArray(params['accounts']) ? params['accounts'] : []
      const active = accounts.find((a) => isRecord(a) && a['active'] === true) ?? accounts[0]
      if (params['state'] === 'authenticated') {
        this.setState({ account: isRecord(active) && typeof active['label'] === 'string' ? active['label'] : null })
      } else if (params['state'] === 'unauthenticated') {
        this.setState({ state: 'auth_required', command: CLAUDE_LOGIN_COMMAND, detail: null, account: null })
      }
      return
    }

    if (method !== 'session/update' || !isRecord(params['update'])) return
    const update = params['update']
    const kind = update['sessionUpdate']

    if (kind === 'agent_message_chunk') {
      const content = update['content']
      if (isRecord(content) && content['type'] === 'text' && typeof content['text'] === 'string' && content['text']) {
        this.emit({ type: 'text', messageId: typeof update['messageId'] === 'string' ? update['messageId'] : '', text: content['text'] })
      }
      return
    }

    if (kind === 'tool_call' || kind === 'tool_call_update') {
      const toolId = typeof update['toolCallId'] === 'string' ? update['toolCallId'] : ''
      if (!toolId) return
      const rawName = toolNameOf(update)
      const patch: { input?: Record<string, unknown>; status?: ToolStatus; resultPreview?: string | null } = {}
      if (isRecord(update['rawInput'])) patch.input = update['rawInput']
      if (update['status'] === 'completed') patch.status = 'ok'
      else if (update['status'] === 'failed') patch.status = 'error'
      if (update['rawOutput'] !== undefined) patch.resultPreview = resultPreviewOf(update['rawOutput'])
      this.upsertTool(toolId, rawName, patch)
    }
  }

  private upsertTool(
    id: string,
    rawName: string,
    patch: { input?: Record<string, unknown>; status?: ToolStatus; resultPreview?: string | null },
  ): void {
    const prev = this.tools.get(id)
    const next = {
      tool: prev?.tool || displayToolName(rawName),
      input: patch.input && Object.keys(patch.input).length > 0 ? patch.input : (prev?.input ?? {}),
      status: patch.status ?? prev?.status ?? ('running' as ToolStatus),
      resultPreview: patch.resultPreview !== undefined ? patch.resultPreview : (prev?.resultPreview ?? null),
    }
    if (
      prev &&
      prev.status === next.status &&
      prev.resultPreview === next.resultPreview &&
      JSON.stringify(prev.input) === JSON.stringify(next.input)
    ) return
    this.tools.set(id, next)
    this.emit({ type: 'tool', id, ...next })
  }
}
