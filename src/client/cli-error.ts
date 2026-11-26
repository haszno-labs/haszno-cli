import { HasznoApiError } from './error.js'

let jsonMode = () => false
let redactions: string[] = []

export function configureCliErrors(isJson: () => boolean, secrets: Array<string | undefined>): void {
  jsonMode = isJson
  redactions = secrets.filter((s): s is string => Boolean(s)).sort((a, b) => b.length - a.length)
}

function redact(value: string): string {
  for (const secret of redactions) value = value.replaceAll(secret, '[kitakarva]')
  return value.replace(/\bhaszno_(?:live|test|oa)_[A-Za-z0-9_-]+\b/g, '[kitakarva]')
}

interface ErrorOptions {
  json?: boolean
  code?: string
  human?: string
}

function apiHint(status: number, code?: string): string | undefined {
  if (status === 401 || code === 'unauthenticated') return 'Futtasd: haszno login'
  if (status === 403 || code === 'forbidden') return 'Ellenőrizd a token hatókörét (read/write) és a bolt-token korlátozásait.'
  if (status === 404 || code === 'not_found') return 'Ellenőrizd az azonosítót.'
  if (status === 409 || code === 'conflict') return 'Ismételt nonce: kérj új azonosítót (randomUUID), vagy keresd a GET listában az eredeti bejegyzést.'
  if (status === 422 || code === 'unprocessable') return 'Ellenőrizd az árszintet: a javasolt ár nem lehet az ár-minimum alatt.'
  if (status === 429 || code === 'rate_limited') return 'Túl sok kérés — várj egy percet és próbáld újra.'
}

export function writeCliError(err: unknown, { json = jsonMode(), code, human }: ErrorOptions = {}): void {
  const message = redact(err instanceof Error ? err.message : String(err)).trim()
  const api = err instanceof HasznoApiError ? err : undefined
  const apiCode = typeof api?.code === 'string' ? redact(api.code) : undefined
  const requestId = typeof api?.requestId === 'string' ? redact(api.requestId) : undefined
  const hint = api && apiHint(api.status, apiCode)
  if (json) {
    process.stderr.write(JSON.stringify({
      error: message, code: apiCode || code || 'command_failed', status: api?.status, requestId, hint,
    }) + '\n')
    return
  }
  let text = human === undefined ? (message.startsWith('Hiba:') ? message : `Hiba: ${message}`) : redact(human).trimEnd()
  if (api) {
    text += ` (HTTP ${api.status})`
    if (apiCode) text += `  [code: ${apiCode}]`
    if (requestId) text += `  [requestId: ${requestId}]`
  }
  process.stderr.write(text + '\n')
  if (hint) process.stderr.write(`  → ${hint}\n`)
}

export function failCli(err: unknown, exitCode = 1, options?: ErrorOptions): never {
  writeCliError(err, { code: exitCode === 2 ? 'invalid_input' : undefined, ...options })
  process.exit(exitCode)
}
