/**
 * CLI commands — `haszno api` (OpenAPI-based generic API client).
 *
 * Fetches /api/openapi.json at runtime and exposes every route as a CLI call.
 * No CLI release is needed when new endpoints appear on the server.
 *
 * Subcommands:
 *   haszno api ls [query] [--tag <t>] [--risk <r>] [--json] [--refresh]
 *   haszno api describe <METHOD> <path>
 *   haszno api <METHOD> <path> [--query k=v ...] [--data '<json>' | --data @file.json]
 *                              [--yes] [--json]
 *
 * Risk levels (x-haszno-risk extension):
 *   read    — safe GET; no confirmation needed
 *   write   — mutation; non-GET with a read-scope key → server will 403
 *   confirm — requires interactive y/N or --yes; non-TTY without --yes → refuse
 *   blocked — always refused by the CLI
 *
 * When x-haszno-risk is absent (pre-extension server):
 *   GET  → read
 *   else → confirm
 *
 * Exit codes: 0 OK, 1 runtime error.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import readline from 'node:readline'
import { Command } from 'commander'
import { request as rawRequest } from '../client/http.js'
import { resolveConnection } from '../client/config.js'
import { failCli } from '../client/cli-error.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RiskLevel = 'read' | 'write' | 'confirm' | 'blocked'

export interface OpenApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  schema?: { type?: string; description?: string }
  description?: string
}

export interface OpenApiOperation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: unknown }>
  }
  'x-haszno-risk'?: RiskLevel
}

export interface OpenApiPathItem {
  get?: OpenApiOperation
  post?: OpenApiOperation
  put?: OpenApiOperation
  patch?: OpenApiOperation
  delete?: OpenApiOperation
  head?: OpenApiOperation
  options?: OpenApiOperation
}

export interface OpenApiSpec {
  openapi?: string
  info?: { title?: string; version?: string }
  servers?: Array<{ url: string; description?: string }>
  paths?: Record<string, OpenApiPathItem>
}

export interface SpecEntry {
  method: string
  path: string
  operation: OpenApiOperation
  risk: RiskLevel
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_DIR = join(homedir(), '.config', 'haszno', 'cache')
const CACHE_FILE = join(CACHE_DIR, 'openapi.json')
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

interface CacheEntry {
  fetchedAt: number
  baseUrl: string
  spec: OpenApiSpec
}

function readCache(): CacheEntry | null {
  try {
    if (!existsSync(CACHE_FILE)) return null
    const raw = readFileSync(CACHE_FILE, 'utf-8')
    return JSON.parse(raw) as CacheEntry
  } catch {
    return null
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(entry), 'utf-8')
  } catch {
    // best-effort
  }
}

// ── Spec fetch and parse ──────────────────────────────────────────────────────

export async function fetchSpec(
  opts: { baseUrl?: string; apiKey?: string; refresh?: boolean; _fetch?: typeof fetch; _readConfig?: () => { apiUrl?: string; apiKey?: string } },
): Promise<OpenApiSpec> {
  const conn = resolveConnection({ baseUrl: opts.baseUrl, apiKey: opts.apiKey }, process.env, opts._readConfig)
  const baseUrl = conn.baseUrl

  if (!opts.refresh) {
    const cached = readCache()
    if (cached && cached.baseUrl === baseUrl && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.spec
    }
  }

  const spec = await rawRequest<OpenApiSpec>('GET', '/api/openapi.json', undefined, {
    baseUrl: opts.baseUrl,
    apiKey: opts.apiKey,
    fetch: opts._fetch,
    readConfig: opts._readConfig,
  })

  writeCache({ fetchedAt: Date.now(), baseUrl, spec })
  return spec
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const

/**
 * Extract the path prefix from the spec's first server URL, so spec paths can be
 * resolved to the correct absolute path.
 *
 * e.g. servers[0].url = "https://haszno.com/api/v1" → "/api/v1"
 *      servers[0].url = "https://haszno.com"        → ""
 *      servers[0].url = "/api"                      → "/api"
 * Returns "" when no servers entry or URL is relative to root.
 */
export function extractServerPrefix(spec: OpenApiSpec): string {
  const serverUrl = spec.servers?.[0]?.url
  if (!serverUrl) return ''
  try {
    // If absolute URL, extract path
    const u = new URL(serverUrl)
    return u.pathname.replace(/\/$/, '')
  } catch {
    // Relative URL — use as-is, strip trailing slash
    return serverUrl.replace(/\/$/, '')
  }
}

/** Derive risk level for an operation, defaulting gracefully when x-haszno-risk is absent. */
export function deriveRisk(method: string, op: OpenApiOperation): RiskLevel {
  if (op['x-haszno-risk']) return op['x-haszno-risk']
  return method.toLowerCase() === 'get' ? 'read' : 'confirm'
}

/** Flatten spec.paths into a list of {method, path, operation, risk}. */
export function specEntries(spec: OpenApiSpec): SpecEntry[] {
  const entries: SpecEntry[] = []
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = item[method]
      if (op) {
        entries.push({ method: method.toUpperCase(), path, operation: op, risk: deriveRisk(method, op) })
      }
    }
  }
  return entries
}

/** Fill path params: /api/products/{id} + {id: '42'} → /api/products/42 */
export function fillPathParams(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    if (name in values) return encodeURIComponent(values[name])
    return `{${name}}`  // leave unfilled — server or validation will reject
  })
}

/** Extract literal path segments that look like param values: /api/products/42 → {id: '42'} */
export function matchPathTemplate(template: string, literal: string): Record<string, string> | null {
  const tParts = template.split('/')
  const lParts = literal.split('/')
  if (tParts.length !== lParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < tParts.length; i++) {
    const t = tParts[i]!
    const l = lParts[i]!
    if (t.startsWith('{') && t.endsWith('}')) {
      params[t.slice(1, -1)] = decodeURIComponent(l)
    } else if (t !== l) {
      return null
    }
  }
  return params
}

/** Find a spec entry that matches a method+path. Returns entry + extracted path params. */
export function findEntry(
  entries: SpecEntry[],
  method: string,
  path: string,
): { entry: SpecEntry; pathParams: Record<string, string> } | null {
  const upper = method.toUpperCase()
  // Exact match first
  for (const e of entries) {
    if (e.method === upper && e.path === path) {
      return { entry: e, pathParams: {} }
    }
  }
  // Template match
  for (const e of entries) {
    if (e.method === upper) {
      const params = matchPathTemplate(e.path, path)
      if (params !== null) return { entry: e, pathParams: params }
    }
  }
  return null
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function isJsonMode(cmd: Command): boolean {
  let p: Command | null = cmd
  while (p) {
    if ((p.opts<{ json?: boolean }>()).json) return true
    p = p.parent
  }
  return false
}

export async function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise<boolean>((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

/** Check whether stdin is a real TTY. Injectable for tests. */
export function isTTY(): boolean {
  return Boolean(process.stdin.isTTY)
}

// ── haszno api ls ─────────────────────────────────────────────────────────────

export async function cmdApiLs(
  query: string | undefined,
  opts: {
    tag?: string
    risk?: string
    refresh?: boolean
    json?: boolean
    baseUrl?: string
    apiKey?: string
    _fetch?: typeof fetch
    _readConfig?: () => { apiUrl?: string; apiKey?: string }
  },
): Promise<void> {
  const spec = await fetchSpec({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, refresh: opts.refresh, _fetch: opts._fetch, _readConfig: opts._readConfig })
  let entries = specEntries(spec)

  if (query) {
    const q = query.toLowerCase()
    entries = entries.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        (e.operation.summary ?? '').toLowerCase().includes(q) ||
        (e.operation.operationId ?? '').toLowerCase().includes(q),
    )
  }
  if (opts.tag) {
    const t = opts.tag.toLowerCase()
    entries = entries.filter((e) => (e.operation.tags ?? []).some((tag) => tag.toLowerCase().includes(t)))
  }
  if (opts.risk) {
    const r = opts.risk.toLowerCase()
    entries = entries.filter((e) => e.risk === r)
  }

  if (opts.json) {
    console.log(JSON.stringify(entries.map((e) => ({ method: e.method, path: e.path, summary: e.operation.summary ?? '', risk: e.risk })), null, 2))
    return
  }

  if (entries.length === 0) {
    console.log('Nincs találat.')
    return
  }

  console.log(padEnd('MÓDSZER', 8) + ' │ ' + padEnd('KOCKÁZAT', 9) + ' │ ' + padEnd('ÚT', 45) + ' │ LEÍRÁS')
  console.log('─'.repeat(8) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(45) + '─┼─' + '─'.repeat(40))
  for (const e of entries) {
    const summary = e.operation.summary ?? e.operation.operationId ?? ''
    console.log(
      padEnd(e.method, 8) + ' │ ' +
      padEnd(e.risk, 9) + ' │ ' +
      padEnd(e.path, 45) + ' │ ' +
      summary.slice(0, 60),
    )
  }
}

// ── haszno api describe ───────────────────────────────────────────────────────

export async function cmdApiDescribe(
  method: string,
  path: string,
  opts: {
    json?: boolean
    baseUrl?: string
    apiKey?: string
    _fetch?: typeof fetch
    _readConfig?: () => { apiUrl?: string; apiKey?: string }
  },
): Promise<void> {
  const spec = await fetchSpec({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, _fetch: opts._fetch, _readConfig: opts._readConfig })
  const entries = specEntries(spec)
  const match = findEntry(entries, method, path)

  if (!match) {
    const message = `Ismeretlen végpont: ${method.toUpperCase()} ${path}`
    failCli(message, 1, { json: opts.json, code: 'not_found', human: message })
  }

  const { entry } = match

  if (opts.json) {
    console.log(JSON.stringify({ method: entry.method, path: entry.path, risk: entry.risk, operation: entry.operation }, null, 2))
    return
  }

  console.log(`${entry.method} ${entry.path}`)
  console.log(`Kockázat: ${entry.risk}`)
  if (entry.operation.summary) console.log(`Leírás: ${entry.operation.summary}`)
  if (entry.operation.description) console.log(`\n${entry.operation.description}`)

  const params = entry.operation.parameters ?? []
  if (params.length > 0) {
    console.log('\nParaméterek:')
    for (const p of params) {
      const req = p.required ? ' (kötelező)' : ''
      const desc = p.description ?? p.schema?.description ?? ''
      console.log(`  ${p.in.toUpperCase()} ${p.name}${req}${desc ? ': ' + desc : ''}`)
    }
  }

  if (entry.operation.requestBody) {
    console.log('\nTörzs: igen' + (entry.operation.requestBody.required ? ' (kötelező)' : ''))
    const content = entry.operation.requestBody.content ?? {}
    const types = Object.keys(content)
    if (types.length) console.log(`Content-Type: ${types.join(', ')}`)
  }
}

// ── haszno api <METHOD> <path> ────────────────────────────────────────────────

export async function cmdApiCall(
  method: string,
  path: string,
  opts: {
    query?: string[]   // ["k=v", ...]
    data?: string      // raw JSON or "@file.json"
    yes?: boolean
    json?: boolean
    baseUrl?: string
    apiKey?: string
    _fetch?: typeof fetch
    _readConfig?: () => { apiUrl?: string; apiKey?: string }
    _isTTY?: () => boolean
    _askConfirm?: (q: string) => Promise<boolean>
  },
): Promise<void> {
  const isTtyFn = opts._isTTY ?? isTTY
  const askFn = opts._askConfirm ?? askConfirm

  // Fetch spec; allow missing (old server), but warn
  let entry: SpecEntry | null = null
  let pathParams: Record<string, string> = {}
  let risk: RiskLevel = method.toLowerCase() === 'get' ? 'read' : 'confirm'
  let serverPrefix = ''

  try {
    const spec = await fetchSpec({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, _fetch: opts._fetch, _readConfig: opts._readConfig })
    serverPrefix = extractServerPrefix(spec)
    const entries = specEntries(spec)
    const match = findEntry(entries, method, path)
    if (match) {
      entry = match.entry
      pathParams = match.pathParams
      risk = entry.risk
    } else if (!opts.json) {
      process.stderr.write(`Figyelmeztetés: a végpont nincs a specifikációban — a hívás folytatódik.\n`)
    }
  } catch {
    if (!opts.json) process.stderr.write(`Figyelmeztetés: nem sikerült letölteni az OpenAPI specifikációt — folytatás spec nélkül.\n`)
  }

  // blocked
  if (risk === 'blocked') {
    failCli('Ez a végpont le van tiltva (blocked) — a CLI megtagadja a hívást.', 1, { json: opts.json, code: 'forbidden' })
  }

  // confirm
  if (risk === 'confirm') {
    if (opts.yes) {
      // --yes supplied: proceed
    } else if (!isTtyFn()) {
      failCli('Ez a végpont megerősítést igényel (confirm), de a bemenet nem TTY. Használj --yes kapcsolót.', 1,
        { json: opts.json, code: 'confirmation_required' })
    } else {
      const ok = await askFn(`Megerősíted a következő hívást: ${method.toUpperCase()} ${path}?`)
      if (!ok) {
        failCli('Megszakítva.', 1, { json: opts.json, code: 'cancelled' })
      }
    }
  }

  // Build resolved path (fill template params, then prepend server prefix)
  const templatePath = entry ? entry.path : path
  const filledPath = fillPathParams(templatePath, pathParams)
  // Avoid double-prefixing: only prepend serverPrefix when the path doesn't already start with it
  const resolvedPath = serverPrefix && !filledPath.startsWith(serverPrefix)
    ? serverPrefix + filledPath
    : filledPath

  // Build query string
  let queryString = ''
  if (opts.query && opts.query.length > 0) {
    const params = new URLSearchParams()
    for (const kv of opts.query) {
      const idx = kv.indexOf('=')
      if (idx === -1) {
        params.append(kv, '')
      } else {
        params.append(kv.slice(0, idx), kv.slice(idx + 1))
      }
    }
    queryString = '?' + params.toString()
  }

  // Build body
  let body: unknown
  if (opts.data) {
    let raw = opts.data
    if (raw.startsWith('@')) {
      try {
        raw = readFileSync(raw.slice(1), 'utf-8')
      } catch (err) {
        failCli(`Nem lehet olvasni a fájlt: ${raw.slice(1)}`, 1, { json: opts.json, code: 'invalid_input' })
      }
    }
    try {
      body = JSON.parse(raw)
    } catch {
      failCli('Érvénytelen JSON-törzs.', 1, { json: opts.json, code: 'invalid_input' })
    }
  }

  // Execute
  let result: unknown
  try {
    result = await rawRequest('GET' === method.toUpperCase() ? 'GET' : method.toUpperCase(), resolvedPath + queryString, body, {
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      fetch: opts._fetch,
      readConfig: opts._readConfig,
    })
  } catch (err: unknown) {
    failCli(err, 1, { json: opts.json })
  }

  if (opts.json || isRawJson(result)) {
    console.log(JSON.stringify(result, null, opts.json ? 2 : 0))
  } else {
    console.log(JSON.stringify(result, null, 2))
  }
}

function isRawJson(_result: unknown): boolean {
  return false // always pretty-print; --json flag switches to compact
}

// ── Commander registration ────────────────────────────────────────────────────

/**
 * Note on --json: the global --json is defined on the root program (not on each subcommand).
 * We resolve it via isJsonMode(cmd) which walks up the parent chain.
 * Defining a local --json on a subcommand when the parent also has one causes Commander to
 * silently ignore the child's flag, so we don't define it locally here.
 */
export function registerApiCommands(
  program: Command,
  clientOpts: { baseUrl?: string; apiKey?: string },
): void {
  const api = program
    .command('api')
    .description('Haszno API — runtime OpenAPI-alapú generikus hívások')

  // haszno api ls [query] [--tag t] [--risk r] [--refresh] [--json]
  api
    .command('ls [query]')
    .description('Listázza az elérhető API végpontokat (forrás: /api/openapi.json)')
    .option('--tag <tag>', 'szűrés tag alapján')
    .option('--risk <szint>', 'szűrés kockázati szint alapján: read|write|confirm|blocked')
    .option('--refresh', 'gyorsítótár megkerülése, friss letöltés')
    .action(async (query: string | undefined, opts: { tag?: string; risk?: string; refresh?: boolean }, cmd: Command) => {
      await cmdApiLs(query, { ...opts, json: isJsonMode(cmd), ...clientOpts })
    })

  // haszno api describe <METHOD> <path> [--json]
  api
    .command('describe <METHOD> <path>')
    .description('Egy végpont paramétereinek és törzssémájának leírása')
    .action(async (method: string, path: string, _opts: Record<string, unknown>, cmd: Command) => {
      await cmdApiDescribe(method, path, { json: isJsonMode(cmd), ...clientOpts })
    })

  // haszno api <METHOD> <path> [--query k=v ...] [--data '<json>'|@file] [--yes] [--json]
  // Commander requires literal subcommand names, so we register each HTTP method.
  // Both lowercase (haszno api get /health) and uppercase (haszno api GET /health) are accepted.
  const HTTP_METHOD_NAMES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
  for (const method of HTTP_METHOD_NAMES) {
    const lc = method.toLowerCase()
    // Register the lowercase variant as the canonical subcommand; alias uppercase
    const methodCmd = api
      .command(`${lc} <path>`)
      .alias(method)
      .description(`HTTP ${method} kérés végrehajtása (pl. haszno api ${lc} /health)`)
      .option('--query <k=v>', 'query paraméter (ismételhető)', (val, prev: string[]) => [...prev, val], [] as string[])
      .option('--data <json>', 'kérés törzse JSON-ként, vagy @fájl.json')
      .option('--yes', 'megerősítés megkerülése (confirm végpontoknál)')
      .action(async (path: string, opts: { query?: string[]; data?: string; yes?: boolean }, cmd: Command) => {
        await cmdApiCall(method, path, { ...opts, json: isJsonMode(cmd), ...clientOpts })
      })
    // Hide from help for uppercase aliases to avoid duplication
    void methodCmd
  }
}
