/**
 * Low-level fetch wrapper — the ONLY place HTTP calls happen in the client.
 *
 * Authentication is dual-mode:
 *   - Shop API token (starts with "haszno_"): Authorization: Bearer <token>
 *   - Non-prefixed key: x-api-key header (unchanged legacy behaviour).
 *   - HTTP Basic ("user:password"): Authorization: Basic <base64> (unchanged).
 *
 * URL and credentials are resolved by resolveConnection() — the precedence is:
 *   flags → HASZNO_API_TOKEN (new) → HASZNO_API_KEY / HASZNO_BASIC → ARFUTAR_*
 *   → config file from `haszno login`.
 * Never logs or exposes credentials.
 * Retries 5xx and 429 with exponential back-off (max 3 attempts).
 */
import { HasznoApiError } from './error.js'
import { type Connection, type HasznoConfig, resolveConnection } from './config.js'

/** Prefix that server-issued shop API tokens always carry. */
export const SHOP_TOKEN_PREFIX = 'haszno_'

/** Returns true when `key` is a server-issued shop API token. */
export function isShopToken(key: string | undefined): key is string {
  return !!key?.startsWith(SHOP_TOKEN_PREFIX)
}

export interface HttpOptions {
  baseUrl?: string
  apiKey?: string
  basicAuth?: string
  /** fetch implementation; defaults to global fetch */
  fetch?: typeof fetch
  /** initial retry delay ms (doubles each attempt) */
  retryDelayMs?: number
  /** max retry attempts */
  maxRetries?: number
  /** request timeout ms */
  timeoutMs?: number
  /** config-file reader; defaults to ~/.config/haszno/config.json (override in tests) */
  readConfig?: () => HasznoConfig
}

/** CLI version for User-Agent */
const CLI_VERSION = '0.3.0'

function buildAuthHeader(conn: Connection): Record<string, string> {
  // Never print credentials.
  if (conn.apiKey) {
    // Shop API token → Bearer; any other key → x-api-key (legacy behaviour unchanged).
    if (isShopToken(conn.apiKey)) return { Authorization: `Bearer ${conn.apiKey}` }
    return { 'x-api-key': conn.apiKey }
  }
  if (conn.basicAuth) {
    const encoded = Buffer.from(conn.basicAuth).toString('base64')
    return { Authorization: `Basic ${encoded}` }
  }
  return {}
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function request<T>(
  method: string,
  path: string,
  body: unknown,
  opts: HttpOptions,
): Promise<T> {
  // Flags > environment (HASZNO_API_TOKEN/KEY/BASIC) > config file (see ./config.ts)
  const conn = resolveConnection(opts, process.env, opts.readConfig)
  const url = `${conn.baseUrl}${path}`
  const fetchFn = opts.fetch ?? fetch

  const maxRetries = opts.maxRetries ?? 3
  const retryDelayMs = opts.retryDelayMs ?? 500
  const timeoutMs = opts.timeoutMs ?? 30_000

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': `haszno-cli/${CLI_VERSION}`,
    ...buildAuthHeader(conn),
  }

  let lastError: unknown
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs * Math.pow(2, attempt - 1))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetchFn(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      lastError = err
      // Network errors (not HTTP errors) are retried
      continue
    } finally {
      clearTimeout(timer)
    }

    // Retry on 429 or 5xx
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries - 1) {
      lastError = new HasznoApiError(response.status, `HTTP ${response.status}`)
      continue
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`
      let code: string | undefined
      let requestId: string | undefined
      try {
        const json = (await response.json()) as { error?: string; code?: string; requestId?: string }
        if (json.error) message = json.error
        if (json.code) code = json.code
        if (json.requestId) requestId = json.requestId
      } catch {
        // ignore parse errors — keep generic message
      }
      // Fall back to X-Request-Id response header if not in body
      if (!requestId) {
        const hdr = response.headers.get('x-request-id')
        if (hdr) requestId = hdr
      }
      throw new HasznoApiError(response.status, message, code, requestId)
    }

    // 204 or empty body
    const text = await response.text()
    if (!text) return undefined as unknown as T
    return JSON.parse(text) as T
  }

  if (lastError instanceof HasznoApiError) throw lastError
  throw new Error(`Network error after ${maxRetries} attempts: ${String(lastError)}`)
}

export function get<T>(path: string, opts: HttpOptions): Promise<T> {
  return request<T>('GET', path, undefined, opts)
}

export function post<T>(path: string, body: unknown, opts: HttpOptions): Promise<T> {
  return request<T>('POST', path, body, opts)
}

export function put<T>(path: string, body: unknown, opts: HttpOptions): Promise<T> {
  return request<T>('PUT', path, body, opts)
}

export function patch<T>(path: string, body: unknown, opts: HttpOptions): Promise<T> {
  return request<T>('PATCH', path, body, opts)
}

export function del<T>(path: string, opts: HttpOptions): Promise<T> {
  return request<T>('DELETE', path, undefined, opts)
}
