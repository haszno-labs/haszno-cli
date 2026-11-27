import type { Connection } from './config.js'
import { HasznoApiError } from './error.js'
import { isShopToken } from './http.js'

export function invocationResult(exitCode: number, error?: unknown, code?: string) {
  if (exitCode === 0) return { outcome: 'ok' } as const
  const status = error instanceof HasznoApiError ? error.status : undefined
  if (status === 401 || status === 403 || code === 'forbidden' || code === 'confirmation_required') {
    return { outcome: 'blocked', reason: 'permission_denied' } as const
  }
  if (code === 'credentials_required') return { outcome: 'blocked', reason: 'not_configured' } as const
  if (status === 404 || code === 'not_found') return { outcome: 'blocked', reason: 'not_available' } as const
  if (exitCode === 2 || status === 400 || status === 422 || code === 'invalid_input') {
    return { outcome: 'error', reason: 'invalid_input' } as const
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return { outcome: 'error', reason: 'timeout' } as const
  }
  return { outcome: 'error', reason: 'tool_error' } as const
}

export async function reportCliInvocation(
  enabled: boolean,
  { baseUrl, apiKey }: Connection,
  target: string,
  result: ReturnType<typeof invocationResult>,
): Promise<void> {
  if (!enabled || !isShopToken(apiKey) || target.length > 76 || !/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/.test(target)) return
  try {
    const url = new URL(`${baseUrl}/api/agent/diagnostics`)
    if (url.username || url.password || url.search || url.hash) return
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) return
    // Not the normal retrying HTTP client: reporting must not count as a
    // command request or accidentally submit the same invocation twice.
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'cli', kind: 'invocation', target, ...result }),
      redirect: 'error',
      signal: AbortSignal.timeout(750),
    })
    await response.body?.cancel()
  } catch {
    // Best effort: diagnostics cannot change stdout, stderr or exit status.
  }
}
