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
 * The config file is used as one unit: its values are read only when neither a flag nor the
 * environment supplies credentials, so a key from the environment is never sent to a URL that
 * only the config file names.
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

export function readConfigFile(configPath = CONFIG_PATH): HasznoConfig {
  // Try primary config path first
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, 'utf-8')
      return JSON.parse(raw) as HasznoConfig
    }
  } catch {
    // fall through to legacy
  }
  // Silent fallback: read old arfutar config if haszno config does not exist
  if (configPath === CONFIG_PATH) {
    try {
      if (existsSync(LEGACY_CONFIG_PATH)) {
        const raw = readFileSync(LEGACY_CONFIG_PATH, 'utf-8')
        return JSON.parse(raw) as HasznoConfig
      }
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
    apiKey = nonEmpty(config.apiKey)
    basicAuth = nonEmpty(config.basicAuth)
    baseUrl ??= nonEmpty(config.apiUrl)
  }

  return { baseUrl: (baseUrl ?? DEFAULT_API_URL).replace(/\/$/, ''), apiKey, basicAuth }
}
