/**
 * Low-level fetch wrapper — the ONLY place HTTP calls happen in the client.
 * - URL and credentials: flags > HASZNO_* env (ARFUTAR_* fallback) > config file from `haszno login`.
 * - API key → x-api-key header; "user:password" → HTTP Basic auth.
 * - Never logs or exposes credentials.
 * - Retries 5xx and 429 with exponential back-off (max 3 attempts).
 */
import { HasznoApiError } from './error.js'
import { type Connection, type HasznoConfig, resolveConnection } from './config.js'

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
const CLI_VERSION = '0.1.0'

function buildAuthHeader(conn: Connection): Record<string, string> {
  // Never print credentials
  if (conn.apiKey) return { 'x-api-key': conn.apiKey }
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
  // Flags > environment > config file written by `haszno login` (see ./config.ts)
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
      try {
        const json = (await response.json()) as { error?: string }
        if (json.error) message = json.error
      } catch {
        // ignore parse errors — keep generic message
      }
      throw new HasznoApiError(response.status, message)
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
