/**
 * CLI commands — account domain.
 *
 * Top-level subcommands:
 *   haszno login                     bejelentkezés e-maillel+jelszóval → token mentése
 *   haszno logout                    token törlése a konfigurációs fájlból
 *   haszno whoami                    aktuális felhasználó megjelenítése
 *   haszno configure                 API kulcs közvetlen mentése (régi flow, alias-szerű)
 *
 * account sub-group:
 *   haszno account ping              check API connectivity (exit 0 ok, 1 hiba)
 *   haszno account whoami            identity + settings summary
 *   haszno account stats             dashboard product & order counts
 *   haszno account impact            profit impact metrics
 *   haszno account suppliers         list own suppliers
 *   haszno account settings          show current pricing settings
 *   haszno account settings update   update pricing settings (write, --yes or confirm)
 *   haszno account version           show CLI version and API connectivity
 *
 * Config file format (~/.config/haszno/config.json):
 *   {
 *     "apiUrl": "https://haszno.com",   // optional, overrides default
 *     "apiKey": "haszno_live_..."       // shop token (written by `haszno login`)
 *   }
 * This file is shared with the MCP server (haszno-mcp) — running `haszno login`
 * once configures both the CLI and the MCP server.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import type { Command } from 'commander'
import type { HasznoClient } from '../client/index.js'
import { HasznoApiError } from '../client/index.js'
import { CONFIG_PATH, readConfigFile, readConfigObject, type HasznoConfig } from '../client/config.js'
import { type HttpOptions } from '../client/http.js'
import { cliLogin } from '../client/shop.js'

export { CONFIG_PATH, LEGACY_CONFIG_PATH, readConfigFile, type HasznoConfig } from '../client/config.js'

// ── Config file ──────────────────────────────────────────────────────────────

export function writeConfigFile(config: HasznoConfig, configPath = CONFIG_PATH): void {
  const dir = dirname(configPath)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
}

// ── Output helpers ───────────────────────────────────────────────────────────

function getJsonFlag(cmd: Command): boolean {
  try {
    return (cmd.optsWithGlobals() as { json?: boolean }).json === true
  } catch {
    return false
  }
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function printKv(rows: Array<[string, string | number | boolean]>): void {
  const maxLen = Math.max(...rows.map(([k]) => k.length))
  for (const [k, v] of rows) {
    process.stdout.write(`  ${k.padEnd(maxLen)}  ${v}\n`)
  }
}

// ── Error handling ───────────────────────────────────────────────────────────

export function handleError(err: unknown): never {
  if (err instanceof HasznoApiError) {
    process.stderr.write(`Hiba: ${err.message} (HTTP ${err.status})\n`)
  } else if (err instanceof Error) {
    process.stderr.write(`Hiba: ${err.message}\n`)
  } else {
    process.stderr.write(`Hiba: ${String(err)}\n`)
  }
  process.exit(1)
}

// ── Interactive helpers ──────────────────────────────────────────────────────

async function askConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise<boolean>((resolve) => {
    rl.question(`${message} [y/N] `, (ans) => {
      rl.close()
      resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'igen')
    })
  })
}

async function askInput(message: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise<string>((resolve) => {
    rl.question(message, (ans) => {
      rl.close()
      resolve(ans.trim())
    })
  })
}

// ── Registration ─────────────────────────────────────────────────────────────

export interface RegisterAccountOptions {
  /** Override the config file path — useful in tests. */
  configPath?: string
  /** Override HTTP opts for the login call — useful in tests (inject mock fetch). */
  httpOpts?: HttpOptions
}

// ── Password prompt (no echo) ─────────────────────────────────────────────────

async function readPasswordNoEcho(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // Non-TTY: read a plain line (e.g. piped input or automated test)
    const rl = createInterface({ input: process.stdin })
    return new Promise<string>((resolve) => {
      rl.once('line', (line) => { rl.close(); resolve(line.trim()) })
    })
  }
  // TTY: switch to raw mode so characters are not echoed
  process.stderr.write(prompt)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  return new Promise<string>((resolve) => {
    const chars: string[] = []
    const onData = (buf: Buffer) => {
      const ch = buf.toString()
      if (ch === '\r' || ch === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stderr.write('\n')
        resolve(chars.join(''))
      } else if (ch === '\x03') {
        // Ctrl-C
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.exit(1)
      } else if (ch === '\x7f' || ch === '\x08') {
        // Backspace / DEL
        chars.pop()
      } else {
        chars.push(ch)
      }
    }
    process.stdin.on('data', onData)
  })
}

export function registerAccountCommands(
  program: Command,
  client: HasznoClient,
  { configPath = CONFIG_PATH, httpOpts = {} }: RegisterAccountOptions = {},
): void {

  // ── login (top-level, email+password → token) ─────────────────────────────
  program
    .command('login')
    .description('Bejelentkezés e-mail/jelszóval; az API-token elmentése (~/.config/haszno/config.json)')
    .option('--api-url <url>', 'Haszno API alap URL-je (env: HASZNO_API_URL)')
    .option('--label <name>', 'Token neve (alapért.: "CLI")', 'CLI')
    .option('--show-token', 'Token megjelenítése mentés után')
    .action(
      async (
        opts: { apiUrl?: string; label?: string; showToken?: boolean },
        cmd: Command,
      ) => {
        const globals = (cmd?.optsWithGlobals() ?? {}) as { apiUrl?: string }
        const apiUrl = opts.apiUrl ?? globals.apiUrl

        // Read credentials from env or interactive prompt
        let email = process.env['HASZNO_EMAIL'] ?? ''
        let password = process.env['HASZNO_PASSWORD'] ?? ''

        if (!email || !password) {
          if (!process.stdin.isTTY) {
            process.stderr.write(
              'Interaktív mód TTY nélkül nem elérhető. ' +
              'Állítsd be a HASZNO_EMAIL és HASZNO_PASSWORD változókat.\n',
            )
            process.exit(2)
            return
          }
          process.stdout.write('Haszno bejelentkezés\n')
          if (!email) email = await askInput('E-mail cím: ')
          if (!password) password = await readPasswordNoEcho('Jelszó: ')
        }

        try {
          const loginOpts: HttpOptions = { ...httpOpts, baseUrl: apiUrl }
          const result = await cliLogin(
            { email, password, label: opts.label ?? 'CLI' },
            loginOpts,
          )

          const existing: HasznoConfig & Record<string, unknown> = {
            ...readConfigFile(configPath),
            ...readConfigObject(configPath),
          }
          existing.apiKey = result.token
          if (apiUrl) existing.apiUrl = apiUrl
          // Store user info for `whoami` without needing a server call
          ;(existing as Record<string, unknown>)['userEmail'] = result.user.email
          ;(existing as Record<string, unknown>)['userName'] = result.user.name
          ;(existing as Record<string, unknown>)['shopName'] = result.user.shopName

          writeConfigFile(existing, configPath)

          process.stdout.write(
            `Bejelentkezve: ${result.user.name} <${result.user.email}>${result.user.shopName ? ` (${result.user.shopName})` : ''}\n` +
            `Token elmentve: ${configPath}\n`,
          )
          if (opts.showToken) {
            process.stdout.write(`Token: ${result.token}\n`)
          }
          process.stdout.write(
            '\nMegjegyzés: az MCP szerver (haszno-mcp) is ebből a fájlból olvas,\n' +
            'ezért elegendő egyszer futtatni a `haszno login` parancsot.\n',
          )
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── logout (top-level) ────────────────────────────────────────────────────
  program
    .command('logout')
    .description('API-token törlése a konfigurációs fájlból')
    .action(async (_opts: Record<string, unknown>, _cmd: Command) => {
      const existing: Record<string, unknown> = { ...readConfigObject(configPath) }
      delete existing['apiKey']
      delete existing['userEmail']
      delete existing['userName']
      delete existing['shopName']
      writeConfigFile(existing as HasznoConfig, configPath)
      process.stdout.write(`Kijelentkezve. Token törölve: ${configPath}\n`)
    })

  // ── whoami (top-level) ────────────────────────────────────────────────────
  program
    .command('whoami')
    .description('Aktuális felhasználó és bejelentkezési állapot')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      const cfg = readConfigObject(configPath) as Record<string, unknown>
      const apiKey = cfg['apiKey'] as string | undefined
      const userEmail = cfg['userEmail'] as string | undefined
      const userName = cfg['userName'] as string | undefined
      const shopName = cfg['shopName'] as string | undefined
      const apiUrl = (cfg['apiUrl'] as string | undefined) ?? 'https://haszno.com'

      const data = { userEmail, userName, shopName, apiUrl, authenticated: !!apiKey }
      if (getJsonFlag(cmd)) {
        printJson(data)
      } else {
        if (!apiKey) {
          process.stdout.write('Nincs mentett token. Futtasd: haszno login\n')
          return
        }
        process.stdout.write(`Felhasználó: ${userName ?? '(ismeretlen)'}\n`)
        process.stdout.write(`E-mail:      ${userEmail ?? '(ismeretlen)'}\n`)
        if (shopName) process.stdout.write(`Bolt:        ${shopName}\n`)
        process.stdout.write(`API URL:     ${apiUrl}\n`)
        process.stdout.write(`Token:       ${apiKey.slice(0, 12)}...\n`)
      }
    })

  // ── configure (key-based login, backward-compat) ──────────────────────────
  const configureAction = async (opts: { apiUrl?: string; apiKey?: string }, cmd?: Command) => {
    const globals = (cmd?.optsWithGlobals() ?? {}) as { apiUrl?: string; apiKey?: string }
    let apiUrl = opts.apiUrl ?? globals.apiUrl
    let apiKey = opts.apiKey ?? globals.apiKey

    if (!apiUrl && !apiKey) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          'Interaktív mód TTY nélkül nem elérhető. ' +
          'Adj meg --api-url és/vagy --api-key paramétert.\n',
        )
        process.exit(2)
        return
      }
      process.stdout.write('Haszno CLI konfiguráció\n')
      process.stdout.write(`Konfigurációs fájl: ${configPath}\n\n`)
      apiUrl = await askInput('API URL (Enter = alapértelmezett https://haszno.com): ')
      apiKey = await askInput('API kulcs: ')
    }

    const updated: HasznoConfig & Record<string, unknown> = { ...readConfigFile(configPath), ...readConfigObject(configPath) }
    if (apiUrl) updated.apiUrl = apiUrl
    if (apiKey) updated.apiKey = apiKey

    writeConfigFile(updated, configPath)
    process.stdout.write(`Konfigurációs fájl elmentve: ${configPath}\n`)
    process.stdout.write(
      'Az HASZNO_API_URL / HASZNO_API_KEY környezeti változók és a\n' +
      '--api-url / --api-key jelzők prioritást élveznek a fájllal szemben.\n' +
      '\nMegjegyzés: az MCP szerver (haszno-mcp) is ebből a fájlból olvas,\n' +
      'ezért elegendő egyszer futtatni a `haszno configure` parancsot.\n',
    )
  }

  program
    .command('configure')
    .description('API kulcs közvetlen mentése (haszno configure --api-key <kulcs>)')
    .option('--api-url <url>', 'Haszno API alap URL-je')
    .option('--api-key <key>', 'Haszno API kulcs')
    .action(configureAction)

  // ── account sub-group ─────────────────────────────────────────────────────
  const account = program
    .command('account')
    .description('Fiók állapot, beállítások és egészség / account health & settings')

  // ping ─────────────────────────────────────────────────────────────────────
  account
    .command('ping')
    .description('API elérhetőség ellenőrzése (exit 0 = ok, 1 = hiba)')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const result = await client.health.check()
        if (getJsonFlag(cmd)) {
          printJson(result)
        } else {
          process.stdout.write(result.ok ? 'API: OK elérhető\n' : 'API: nem válaszol\n')
        }
        if (!result.ok) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  // whoami ───────────────────────────────────────────────────────────────────
  account
    .command('whoami')
    .description('Azonosítás és beállítások összefoglalója / identity + settings summary')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const [health, settings] = await Promise.all([
          client.health.check(),
          client.settings.get(),
        ])
        if (getJsonFlag(cmd)) {
          printJson({ health, settings })
        } else {
          process.stdout.write('Kapcsolat:\n')
          printKv([['API:', health.ok ? 'OK' : 'HIBA']])
          process.stdout.write('\nArazasi beallitasok:\n')
          printKv([
            ['Alacınzas (undercutPct):', `${settings.undercutPct}%`],
            ['Min. haszon (minMarginPct):', `${settings.minMarginPct}%`],
            ['AFA (vatPct):', `${settings.vatPct}%`],
            ['Automatizmus:', settings.automationPaused ? 'szunet' : 'aktiv'],
          ])
        }
      } catch (err) {
        handleError(err)
      }
    })

  // stats ────────────────────────────────────────────────────────────────────
  account
    .command('stats')
    .description('Iranyitopult osszefoglalo / dashboard product & order counts')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const stats = await client.stats.get()
        if (getJsonFlag(cmd)) {
          printJson(stats)
        } else {
          process.stdout.write('Irányítópult:\n')
          printKv([
            ['Termékek:', stats.products],
            ['Veszteséges:', stats.losing],
            ['Piaci max.:', stats.overMarket],
            ['Javítandó:', stats.toFix],
            ['Rendelések:', stats.orders],
          ])
        }
      } catch (err) {
        handleError(err)
      }
    })

  // impact ───────────────────────────────────────────────────────────────────
  account
    .command('impact')
    .description('Haszon-mero / profit impact metrics')
    .option('--days <n>', 'Visszatekintesi napok szama', '30')
    .action(async (opts: { days: string }, cmd: Command) => {
      const days = parseInt(opts.days, 10)
      if (isNaN(days) || days < 1) {
        process.stderr.write('Ervenytelen --days ertek; pozitiv egesz szamot adj meg.\n')
        process.exit(2)
        return
      }
      try {
        const impact = await client.stats.getImpact({ days })
        if (getJsonFlag(cmd)) {
          printJson(impact)
        } else {
          process.stdout.write(`Haszon-mérő (utolsó ${impact.days} nap):\n`)
          printKv([
            ['Extra profit:', `${impact.extraProfit.toLocaleString('hu-HU')} Ft`],
            ['Alap profit:', `${impact.baseline.toLocaleString('hu-HU')} Ft`],
            ['Növekedés:', `+${impact.pctGain.toFixed(1)}%`],
            ['Rendelések:', impact.orders],
            ['Auto-forwarded:', impact.autoForwardedOrders],
          ])
        }
      } catch (err) {
        handleError(err)
      }
    })

  // suppliers ────────────────────────────────────────────────────────────────
  account
    .command('suppliers')
    .description('Sajat beszallitok listaja / list your suppliers')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const suppliers = await client.suppliers.list()
        if (getJsonFlag(cmd)) {
          printJson(suppliers)
        } else {
          if (suppliers.length === 0) {
            process.stdout.write('Nincs hozzaadott beszallito.\n')
            return
          }
          process.stdout.write(`Beszallitok (${suppliers.length}):\n`)
          for (const s of suppliers) {
            const mode = s.orderMode === 'email' ? 'e-mail' : 'szimulalt'
            const net = s.network ? ' [halozat]' : ''
            process.stdout.write(
              `  #${String(s.id).padStart(3)}  ${s.name.padEnd(32)}  ${mode}${net}\n`,
            )
          }
        }
      } catch (err) {
        handleError(err)
      }
    })

  // settings (view; also parent for update) ─────────────────────────────────
  const settingsCmd = account
    .command('settings')
    .description('Arazasi beallitasok megtekintese / show current pricing settings')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const s = await client.settings.get()
        if (getJsonFlag(cmd)) {
          printJson(s)
        } else {
          process.stdout.write('Arazasi beallitasok:\n')
          printKv([
            ['Alacınzas (undercutPct):', `${s.undercutPct}%`],
            ['Min. haszon (minMarginPct):', `${s.minMarginPct}%`],
            ['AFA (vatPct):', `${s.vatPct}%`],
            ['Automatizmus:', s.automationPaused ? 'szunet' : 'aktiv'],
          ])
        }
      } catch (err) {
        handleError(err)
      }
    })

  settingsCmd
    .command('update')
    .description('Arazasi beallitasok frissitese (irasi muvelet)')
    .option('--undercut-pct <n>', 'Alacınzasi szazalek (pl. 2 = 2%-kal ar ala)')
    .option('--min-margin-pct <n>', 'Minimalis haszon % (pl. 10)')
    .option('--vat-pct <n>', 'AFA % (pl. 27)')
    .option('--yes', 'Megerosites keres nelkul / skip confirmation')
    .action(async (
      opts: { undercutPct?: string; minMarginPct?: string; vatPct?: string; yes?: boolean },
      cmd: Command,
    ) => {
      if (!opts.undercutPct && !opts.minMarginPct && !opts.vatPct) {
        process.stderr.write(
          'Legalabb egy opciót adj meg: --undercut-pct, --min-margin-pct, --vat-pct\n',
        )
        process.exit(2)
        return
      }

      const undercutPct =
        opts.undercutPct !== undefined ? parseFloat(opts.undercutPct) : undefined
      const minMarginPct =
        opts.minMarginPct !== undefined ? parseFloat(opts.minMarginPct) : undefined
      const vatPct =
        opts.vatPct !== undefined ? parseFloat(opts.vatPct) : undefined

      if (
        (undercutPct !== undefined && (isNaN(undercutPct) || undercutPct < 0)) ||
        (minMarginPct !== undefined && (isNaN(minMarginPct) || minMarginPct < 0)) ||
        (vatPct !== undefined && (isNaN(vatPct) || vatPct < 0))
      ) {
        process.stderr.write(
          'Ervenytelen szam; az ertekeknek nem negativ szamoknak kell lenniuk.\n',
        )
        process.exit(2)
        return
      }

      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          process.stderr.write('Irasi muvelethez --yes szukseges nem-interaktiv modban.\n')
          process.exit(2)
          return
        }
        const ok = await askConfirm('Biztosan frissited az arazasi beallitasokat?')
        if (!ok) {
          process.stdout.write('Megszakitva.\n')
          process.exit(0)
          return
        }
      }

      try {
        const current = await client.settings.get()
        const body = {
          undercutPct: undercutPct ?? current.undercutPct,
          minMarginPct: minMarginPct ?? current.minMarginPct,
          vatPct: vatPct ?? current.vatPct,
        }
        const updated = await client.settings.update(body)
        if (getJsonFlag(cmd)) {
          printJson(updated)
        } else {
          process.stdout.write('Beállítások frissítve:\n')
          printKv([
            ['Alácínzás:', `${updated.undercutPct}%`],
            ['Min. haszon:', `${updated.minMarginPct}%`],
            ['ÁFA:', `${updated.vatPct}%`],
          ])
        }
      } catch (err) {
        handleError(err)
      }
    })

  // version ──────────────────────────────────────────────────────────────────
  account
    .command('version')
    .description('CLI verzio es API kapcsolat ellenorzese / CLI version + connectivity check')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      let cliVersion = '0.1.0'
      try {
        let root: Command = cmd
        while (root.parent) root = root.parent
        cliVersion = root.version() ?? cliVersion
      } catch { /* keep default */ }

      let apiStatus = 'unreachable'
      try {
        const health = await client.health.check()
        apiStatus = health.ok ? 'ok' : 'error'
      } catch { /* ignore */ }

      const data = { version: cliVersion, api: apiStatus }
      if (getJsonFlag(cmd)) {
        printJson(data)
      } else {
        process.stdout.write(`haszno ${cliVersion}\n`)
        process.stdout.write(`API: ${apiStatus === 'ok' ? 'OK elérhető' : 'nem elérhető'}\n`)
      }
    })
}
