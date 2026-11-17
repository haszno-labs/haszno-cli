/**
 * Minimal Agent Client Protocol (ACP) client: newline-delimited JSON-RPC 2.0 over a child
 * process's stdio. Only what the Vászon bridge needs — requests, notifications, and answering the
 * agent's own requests (permission prompts).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface RpcError {
  code: number
  message: string
  data?: unknown
}

export type NotificationHandler = (method: string, params: unknown) => void
/** Returns the result of an agent → client request; throw an RpcError-shaped object to refuse. */
export type RequestHandler = (method: string, params: unknown) => Promise<unknown>

export interface AcpTransport {
  write(line: string): void
  onLine(cb: (line: string) => void): void
  onClose(cb: (reason: { code: number | null; error?: NodeJS.ErrnoException }) => void): void
  kill(): void
}

/** Spawn the adapter. On Windows the global npm bin is a .cmd shim, which needs a shell. */
export function spawnTransport(command: string, args: string[], env: NodeJS.ProcessEnv): AcpTransport {
  const child: ChildProcess = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'ignore'],
    env,
    shell: process.platform === 'win32',
  })
  let closed = false
  const closeCbs: Array<(r: { code: number | null; error?: NodeJS.ErrnoException }) => void> = []
  const close = (r: { code: number | null; error?: NodeJS.ErrnoException }) => {
    if (closed) return
    closed = true
    for (const cb of closeCbs) cb(r)
  }
  child.on('error', (error: NodeJS.ErrnoException) => close({ code: null, error }))
  child.on('exit', (code) => close({ code }))
  // A dead adapter must not crash the bridge with EPIPE.
  child.stdin?.on('error', () => {})
  return {
    write: (line) => { if (!closed) child.stdin?.write(line + '\n') },
    onLine: (cb) => { if (child.stdout) createInterface({ input: child.stdout }).on('line', cb) },
    onClose: (cb) => { closeCbs.push(cb) },
    kill: () => { child.kill() },
  }
}

export class AcpConnection {
  private nextId = 1
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: RpcError) => void }>()
  private closed = false

  constructor(
    private transport: AcpTransport,
    private onNotification: NotificationHandler,
    private onRequest: RequestHandler,
    onClose: (reason: { code: number | null; error?: NodeJS.ErrnoException }) => void,
  ) {
    transport.onLine((line) => this.handleLine(line))
    transport.onClose((reason) => {
      this.closed = true
      for (const p of this.pending.values()) p.reject({ code: -32099, message: 'Az adapter leállt.' })
      this.pending.clear()
      onClose(reason)
    })
  }

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    if (this.closed) return Promise.reject({ code: -32099, message: 'Az adapter leállt.' } satisfies RpcError)
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.transport.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  notify(method: string, params: unknown): void {
    if (!this.closed) this.transport.write(JSON.stringify({ jsonrpc: '2.0', method, params }))
  }

  close(): void {
    this.transport.kill()
  }

  private handleLine(line: string): void {
    let msg: { id?: number | string | null; method?: string; params?: unknown; result?: unknown; error?: RpcError }
    try {
      msg = JSON.parse(line)
    } catch {
      return // not protocol output
    }
    if (!msg || typeof msg !== 'object') return

    if (msg.method === undefined) {
      if (typeof msg.id !== 'number') return
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(msg.error)
      else p.resolve(msg.result)
      return
    }

    if (msg.id === undefined || msg.id === null) {
      this.onNotification(msg.method, msg.params)
      return
    }

    const id = msg.id
    this.onRequest(msg.method, msg.params).then(
      (result) => this.transport.write(JSON.stringify({ jsonrpc: '2.0', id, result: result ?? null })),
      (err: unknown) => {
        const e = err as Partial<RpcError> | undefined
        const error: RpcError = {
          code: typeof e?.code === 'number' ? e.code : -32603,
          message: typeof e?.message === 'string' ? e.message : 'Internal error',
        }
        this.transport.write(JSON.stringify({ jsonrpc: '2.0', id, error }))
      },
    )
  }
}
