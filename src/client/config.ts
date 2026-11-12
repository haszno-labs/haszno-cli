/**
 * Where the CLI gets its API URL and credentials from.
 *
 * Priority (highest first) — the same order the MCP server uses:
 *   1. explicit options (--api-url / --api-key flags)
 *   2. HASZNO_API_URL / HASZNO_API_KEY / HASZNO_BASIC environment variables
 *   3. ARFUTAR_* environment variables (silent fallback for migration)
 *   4. ~/.config/haszno/config.json (written by `haszno login`)
 *   5. ~/.config/arfutar/config.json (silent fallback for migration)
 *   6. https://haszno.com, no credentials
 *
 * The config file is used as one unit: it is read only when neither a flag nor the environment
 * supplies credentials (so an environment key is never sent to a URL that only the file names),
 * and its credentials are sent only to the URL they were saved for (so a saved key is never sent
 * to a different server named by --api-url or HASZNO_API_URL).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const CONFIG_PATH = join(homedir(), '.config', 'haszno', 'config.json')
/** Legacy path — read as silent fallback, never written */
export const LEGACY_CONFIG_PATH = join(homedir(), '.config', 'arfutar', 'config.json')
export const DEFAULT_API_URL = 'https://haszno.com'

export interface HasznoConfig {
  apiUrl?: string
  apiKey?: string
  /** "user:password" for HTTP Basic auth (written by the MCP server's configure tool) */
  basicAuth?: string
}

/** Parse a config file; anything that is not a JSON object with string values is ignored. */
function parseConfig(raw: string): HasznoConfig {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const src = parsed as Record<string, unknown>
  const out: HasznoConfig = {}
  for (const key of ['apiUrl', 'apiKey', 'basicAuth'] as const) {
    if (typeof src[key] === 'string') out[key] = src[key]
  }
  return out
}

/** Raw file contents as an object (for rewriting the file without losing unknown keys). */
export function readConfigObject(configPath = CONFIG_PATH): Record<string, unknown> {
  try {
    if (existsSync(configPath)) {
      const parsed: unknown = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    }
  } catch {
    // unreadable or malformed: start from an empty object
  }
  return {}
}

export function readConfigFile(configPath = CONFIG_PATH): HasznoConfig {
  // Try primary config path first
  try {
    if (existsSync(configPath)) return parseConfig(readFileSync(configPath, 'utf-8'))
  } catch {
    // fall through to legacy
  }
  // Silent fallback: read old arfutar config if haszno config does not exist
  if (configPath === CONFIG_PATH) {
    try {
      if (existsSync(LEGACY_CONFIG_PATH)) return parseConfig(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'))
    } catch {
      // ignore
    }
  }
  return {}
}

export interface ConnectionOptions {
  baseUrl?: string
  apiKey?: string
  basicAuth?: string
}

export interface Connection {
  baseUrl: string
  apiKey?: string
  basicAuth?: string
}

const normalizeUrl = (url: string): string => url.replace(/\/+$/, '')
const nonEmpty = (v: string | undefined): string | undefined => (v ? v : undefined)

/**
 * Resolve the API URL and credentials. `env` and `readConfig` are injectable for tests;
 * the config file is only read when it can actually contribute something.
 */
export function resolveConnection(
  opts: ConnectionOptions = {},
  env: NodeJS.ProcessEnv = process.env,
  readConfig: () => HasznoConfig = readConfigFile,
): Connection {
  let apiKey = nonEmpty(opts.apiKey) ?? nonEmpty(env['HASZNO_API_KEY']) ?? nonEmpty(env['ARFUTAR_API_KEY'])
  let basicAuth = nonEmpty(opts.basicAuth) ?? nonEmpty(env['HASZNO_BASIC']) ?? nonEmpty(env['ARFUTAR_BASIC'])
  let baseUrl = nonEmpty(opts.baseUrl) ?? nonEmpty(env['HASZNO_API_URL']) ?? nonEmpty(env['ARFUTAR_API_URL'])

  if (!apiKey && !basicAuth) {
    const config = readConfig()
    const configUrl = normalizeUrl(nonEmpty(config.apiUrl) ?? DEFAULT_API_URL)
    baseUrl ??= nonEmpty(config.apiUrl)
    // Saved credentials belong to the server they were saved for: if a flag or the environment points
    // somewhere else, they are not sent there.
    if (normalizeUrl(baseUrl ?? DEFAULT_API_URL) === configUrl) {
      apiKey = nonEmpty(config.apiKey)
      basicAuth = nonEmpty(config.basicAuth)
    }
  }

  return { baseUrl: normalizeUrl(baseUrl ?? DEFAULT_API_URL), apiKey, basicAuth }
}
