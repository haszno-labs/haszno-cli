/**
 * Calls a tool of the hosted Haszno MCP server (`<api-url>/api/mcp`) over plain HTTP.
 *
 * The webshop editor's tools live on that server: they hold the page model, the validation and the conflict
 * handling for several agents writing one shop. The CLI calls the same tools instead of repeating that logic, so a
 * terminal and an MCP client always behave the same.
 *
 * Needs a shop token (`haszno_…`, sent as Bearer) — the MCP server takes no other credential. Never logs it.
 */
import { type HttpOptions, isShopToken } from './http.js'
import { resolveConnection } from './config.js'
import { HasznoApiError } from './error.js'

/** A tool call the server answered with an error (`isError`), e.g. a refused or invalid write. */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpToolError'
  }
}

/** The JSON-RPC answer is either a JSON body or one `data:` line of an event stream. */
export function parseRpcBody(text: string): unknown {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const data = text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).pop()
  if (!data) throw new Error('A Haszno MCP szerver üres választ adott.')
  return JSON.parse(data)
}

interface RpcAnswer {
  result?: { content?: { type?: string; text?: string }[]; isError?: boolean }
  error?: { message?: string }
}

/** Calls one MCP tool and returns its text answer. Throws McpToolError when the tool itself reports an error. */
export async function callMcpTool(name: string, args: Record<string, unknown>, opts: HttpOptions = {}): Promise<string> {
  const conn = resolveConnection(opts, process.env, opts.readConfig)
  if (!isShopToken(conn.apiKey)) {
    throw new Error('Ehhez bolt-kulcs (haszno_…) kell: `haszno configure --api-key <kulcs>` vagy HASZNO_API_TOKEN.')
  }
  const fetchFn = opts.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000)
  let response: Response
  try {
    response = await fetchFn(`${conn.baseUrl}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${conn.apiKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      signal: controller.signal,
      redirect: 'manual',
    })
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401 || response.status === 403) {
    throw new HasznoApiError(response.status, 'A kulcsot a szerver elutasította. Ellenőrizd: haszno account doctor',
      response.status === 401 ? 'unauthenticated' : 'forbidden', response.headers.get('x-request-id') ?? undefined)
  }
  if (!response.ok) throw new HasznoApiError(response.status, 'A Haszno MCP szerver hibát adott.',
    response.status === 429 ? 'rate_limited' : 'mcp_http_error', response.headers.get('x-request-id') ?? undefined)

  const answer = parseRpcBody(await response.text()) as RpcAnswer
  if (answer.error) throw new McpToolError(answer.error.message ?? 'Ismeretlen hiba')
  const text = (answer.result?.content ?? []).map((part) => part.text ?? '').join('\n')
  if (answer.result?.isError) throw new McpToolError(text || 'Ismeretlen hiba')
  return text
}
