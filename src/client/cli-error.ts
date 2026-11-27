import type { Command } from 'commander'
import { HasznoApiError } from './error.js'

let jsonMode = () => false
let redactions: RegExp[] = []

export function configureCliErrors(isJson: () => boolean, secrets: Array<string | undefined>): void {
  jsonMode = isJson
  redactions = secrets.filter((s): s is string => Boolean(s)).sort((a, b) => b.length - a.length).map(secret => {
    const literal = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // A short legacy key or password can be an ordinary substring of a diagnostic code.
    const pattern = secret.length < 6 ? `(?<![\\p{L}\\p{N}_])${literal}(?![\\p{L}\\p{N}_])` : literal
    return new RegExp(pattern, 'gu')
  })
}

/** Manually attached Commander commands do not inherit the parent's output settings. */
export function configureCommandErrors(command: Command, wantsJson: () => boolean): void {
  command.configureOutput({
    outputError: (message, write) => {
      if (wantsJson()) {
        writeCliError(message.replace(/^error:\s*/i, ''), { json: true, code: 'invalid_input' })
      } else {
        write(message)
      }
    },
  })
  for (const child of command.commands) configureCommandErrors(child, wantsJson)
}

function redact(value: string): string {
  for (const secret of redactions) value = value.replace(secret, '[kitakarva]')
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
  if (err instanceof CliExit) throw err
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
  exitCli(exitCode, err, options?.code)
}

export class CliExit extends Error {
  constructor(readonly exitCode: number, readonly originalError?: unknown, readonly code?: string) {
    super('CLI action ended')
  }
}

let deferExit = false

export function deferCliExit(): void {
  deferExit = true
}

export function exitCli(code: number, originalError?: unknown, errorCode?: string): never {
  if (deferExit) throw new CliExit(code, originalError, errorCode)
  process.exit(code)
}
