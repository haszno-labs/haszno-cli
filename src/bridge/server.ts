/**
 * Vászon bridge — loopback HTTP server the Vászon page (haszno.com/app/vaszon) talks to.
 *
 * It listens on 127.0.0.1 only. Every request must
 *   - carry the pairing token (Authorization: Bearer …, or ?token= for EventSource),
 *   - come from an allowed web origin (when the browser sends an Origin header), and
 *   - name the loopback host (DNS-rebinding guard).
 *
 * Routes:
 *   GET  /status                      → state snapshot
 *   GET  /events?since=<seq>&epoch=<e> → Server-Sent Events: `state` + conversation events after
 *                                       <seq> (from the start when <e> is not this process's epoch)
 *   POST /prompt     {text, label?}   → start a turn
 *   POST /permission {id, decision}   → answer a permission prompt ("approve" | "reject")
 *   POST /cancel                      → stop the running turn
 *   POST /reset                       → new conversation
 *   POST /restart                     → restart the adapter (after installing / signing in)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { VaszonAgent } from './agent.js'

const MAX_BODY_BYTES = 64 * 1024
const HEARTBEAT_MS = 15_000

export interface BridgeServerOptions {
  agent: VaszonAgent
  token: string
  port: number
  /** Web origins allowed to call the bridge, e.g. ["https://haszno.com"]. */
  allowedOrigins: string[]
  /** Shown by the panel so the user sees which shop the agent acts on. */
  shop: { id: number | null; name: string | null } | null
  version: string
}

function tokenMatches(given: string | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** True for `127.0.0.1:<port>` / `localhost:<port>` — anything else is a rebinding attempt. */
export function isLoopbackHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        resolve(null)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size === 0) return resolve({})
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null)
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

export function createBridgeServer(opts: BridgeServerOptions): Server {
  const { agent, token, port, shop, version } = opts
  const allowed = new Set(opts.allowedOrigins)

  // Identifies this bridge process: event sequence numbers restart with it, so a browser that
  // still holds an older epoch must replay the conversation from the beginning.
  const epoch = randomBytes(8).toString('hex')
  const statusBody = () => ({ app: 'haszno-vaszon', version, shop, epoch, ...agent.state() })

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origin = req.headers.origin
    const cors: Record<string, string> = { Vary: 'Origin' }
    if (origin && allowed.has(origin)) {
      cors['Access-Control-Allow-Origin'] = origin
      cors['Access-Control-Allow-Headers'] = 'authorization, content-type, last-event-id'
      cors['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
      // Chrome's Private Network Access preflight (public site → loopback).
      cors['Access-Control-Allow-Private-Network'] = 'true'
      cors['Access-Control-Max-Age'] = '600'
    }
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify(body))
    }

    if (!isLoopbackHost(req.headers.host, port)) return json(403, { error: 'forbidden_host' })
    if (origin && !allowed.has(origin)) return json(403, { error: 'forbidden_origin' })
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (!tokenMatches(bearer ?? url.searchParams.get('token') ?? undefined, token)) return json(401, { error: 'unpaired' })

    if (req.method === 'GET' && url.pathname === '/status') return json(200, statusBody())

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      })
      const send = (event: string, data: unknown, id?: number) => {
        res.write(`${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
      const sameEpoch = url.searchParams.get('epoch') === epoch
      const since = sameEpoch ? Number(req.headers['last-event-id'] ?? url.searchParams.get('since') ?? 0) || 0 : 0
      send('state', statusBody())
      for (const e of agent.eventsSince(since)) send('message', e, e.seq)
      const offEvent = agent.onEvent((e) => send('message', e, e.seq))
      const offState = agent.onState(() => send('state', statusBody()))
      const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS)
      req.on('close', () => {
        clearInterval(heartbeat)
        offEvent()
        offState()
      })
      return
    }

    if (req.method !== 'POST') return json(404, { error: 'not_found' })
    const body = await readJson(req)
    if (!body) return json(400, { error: 'bad_request' })

    switch (url.pathname) {
      case '/prompt': {
        if (typeof body['text'] !== 'string') return json(400, { error: 'bad_request' })
        const result = agent.prompt(body['text'], typeof body['label'] === 'string' ? body['label'] : undefined)
        return result.ok ? json(200, { ok: true }) : json(409, { error: result.error })
      }
      case '/permission': {
        const decision = body['decision']
        if (typeof body['id'] !== 'string' || (decision !== 'approve' && decision !== 'reject')) return json(400, { error: 'bad_request' })
        return agent.decide(body['id'], decision) ? json(200, { ok: true }) : json(404, { error: 'unknown_permission' })
      }
      case '/cancel':
        agent.cancel()
        return json(200, { ok: true })
      case '/reset':
        void agent.reset()
        return json(200, { ok: true })
      case '/restart':
        void agent.start()
        return json(200, { ok: true })
      default:
        return json(404, { error: 'not_found' })
    }
  }

  // An unexpected throw must not take the bridge down as an unhandled rejection.
  return createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: 'internal' }))
    })
  })
}
