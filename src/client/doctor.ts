import { resolveConnection } from './config.js'
import { buildAuthHeader, isShopToken, type HttpOptions } from './http.js'
import { parseRpcBody } from './mcp.js'

type CheckStatus = 'ok' | 'unreachable' | 'timeout' | 'unauthenticated' | 'forbidden' | 'rate_limited' |
  'http_error' | 'invalid_response' | 'skipped' | 'missing'
interface Check {
  status: CheckStatus
  httpStatus?: number
}
type Identity = { email?: string; name?: string; shopName?: string; shopId?: number; tokenScope?: string }

export async function checkDoctor(opts: HttpOptions) {
  const conn = resolveConnection(opts, process.env, opts.readConfig)
  const isShop = isShopToken(conn.apiKey)
  const credentialMode = isShop ? 'shop-token (Bearer)' : conn.apiKey ? 'api-key (x-api-key)' : conn.basicAuth ? 'Basic' : 'nincs hitelesítés'
  const hasCredentials = Boolean(conn.apiKey || conn.basicAuth)
  const fetchFn = opts.fetch ?? fetch

  async function probe(path: string, init: RequestInit, read: (response: Response) => Promise<boolean>): Promise<Check> {
    let response: Response
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 8_000)
    try {
      response = await fetchFn(conn.baseUrl + path, { ...init, redirect: 'manual', signal })
    } catch {
      return { status: signal.aborted ? 'timeout' : 'unreachable' }
    }
    const httpStatus = response.status
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      return { status: httpStatus === 401 ? 'unauthenticated' : httpStatus === 403 ? 'forbidden' :
        httpStatus === 429 ? 'rate_limited' : 'http_error', httpStatus }
    }
    try {
      return { status: await read(response) ? 'ok' : 'invalid_response', httpStatus }
    } catch {
      return { status: signal.aborted ? 'timeout' : 'invalid_response', httpStatus }
    }
  }

  const headers = { Accept: 'application/json', ...buildAuthHeader(conn) }
  let me: Identity = {}
  const [api, authCheck] = await Promise.all([
    probe('/api/health', { headers: { Accept: 'application/json' } }, async response =>
      (await response.json() as { ok?: unknown } | null)?.ok === true),
    hasCredentials
      ? probe('/api/v1/auth/me', { headers }, async response => {
        const user = await response.json() as Identity | null
        if (!user || (typeof user.name !== 'string' && typeof user.shopId !== 'number')) return false
        // Never forward unknown fields from the identity endpoint.
        me = {
          email: typeof user.email === 'string' ? user.email : undefined,
          name: typeof user.name === 'string' ? user.name : undefined,
          shopName: typeof user.shopName === 'string' ? user.shopName : undefined,
          shopId: typeof user.shopId === 'number' ? user.shopId : undefined,
          tokenScope: user.tokenScope === 'read' || user.tokenScope === 'write' ? user.tokenScope : undefined,
        }
        return true
      })
      : Promise.resolve<Check>({ status: 'missing' }),
  ])
  let mcp: Check = { status: 'skipped' }
  if (isShop && authCheck.status === 'ok') {
    mcp = await probe('/api/mcp', {
      method: 'POST',
      headers: { ...headers, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'haszno-cli-doctor', version: '1' },
      } }),
    }, async response => {
      const answer = parseRpcBody(await response.text()) as {
        id?: unknown; jsonrpc?: unknown; error?: unknown; result?: { protocolVersion?: unknown }
      } | null
      return answer?.jsonrpc === '2.0' && answer.id === 1 &&
        !answer.error && typeof answer.result?.protocolVersion === 'string'
    })
  }

  const apiOk = authCheck.status === 'ok' // legacy field: success of the identity request
  const apiError = apiOk ? null : authCheck.status === 'missing' ? 'Nincs bejelentkezve'
    : authCheck.httpStatus ? `HTTP ${authCheck.httpStatus} (${authCheck.status})` : authCheck.status
  return { isShop, credentialMode, apiOk, apiError, me, api, auth: { ...authCheck, scope: me.tokenScope ?? null }, mcp }
}
