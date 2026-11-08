/**
 * CLI commands — feeds (import/export).
 *
 * Domain: feeds
 * Subcommands:
 *   haszno feeds import-supplier --supplier <id> --format <csv|xml> [--file <path>] [--yes]
 *     Import a partner/supplier catalogue feed from CSV or XML.
 *   haszno feeds import-market [--file <path>] [--yes]
 *     Import market price comparison data from CSV.
 *   haszno feeds urls [--fetch]
 *     Show outbound Árukereső and Google Shopping feed URLs; with --fetch also print the XML.
 */
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { InvalidArgumentError, type Command } from 'commander'
import type { HasznoClient, FeedImportResult, MarketImportResult } from '../client/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getJson(cmd: Command): boolean {
  return Boolean((cmd.optsWithGlobals() as { json?: boolean }).json)
}

/** Resolve the base URL respecting the --api-url override and HASZNO_API_URL env. */
function getBaseUrl(cmd: Command): string {
  const opts = cmd.optsWithGlobals() as { apiUrl?: string }
  const raw =
    opts.apiUrl ??
    process.env['HASZNO_API_URL'] ??
    process.env['ARFUTAR_API_URL'] ?? // silent fallback
    'https://api.haszno.hu'
  return raw.replace(/\/$/, '')
}

/** Read UTF-8 text from a file path or from stdin (non-TTY only). */
export async function readContent(filePath: string | undefined): Promise<string> {
  if (filePath) {
    return readFile(filePath, 'utf-8')
  }
  if (process.stdin.isTTY) {
    throw new Error(
      'Adj meg --file paramétert, vagy adj meg adatot a standard bemeneten (stdin-en).',
    )
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf-8')
}

/** Interactive yes/no prompt; resolves to true on "y". */
async function askConfirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close()
      resolve(ans.trim().toLowerCase() === 'y')
    })
  })
}

/**
 * Ensure the user confirmed a write operation.
 *
 * Returns:
 *  - true  → confirmed (--yes flag given, or user typed "y")
 *  - false → declined (interactive "n" / enter) or non-TTY without --yes
 *
 * When the environment is not a TTY and --yes was not given, calls
 * process.exit(2) before returning false.  Casting to (code)=>void lets
 * callers place a 'return' after this call; in production the exit fires first.
 */
export async function requireConfirm(yes: boolean, message: string): Promise<boolean> {
  if (yes) return true
  if (!process.stdin.isTTY) {
    console.error(
      'Hiba: írási művelethez add meg a --yes kapcsolót nem-interaktív módban.',
    )
    // Cast to void so a 'return false' below is reachable (TS sees process.exit as never).
    // At runtime in production the process exits here; in tests with a mocked exit it falls
    // through to the return false, preventing the readline prompt from blocking.
    ;(process.exit as (code?: number) => void)(2)
    return false
  }
  const ok = await askConfirm(message)
  if (!ok) console.log('Megszakítva.')
  return ok
}

/**
 * Log an error message and call process.exit(1).
 * Typed as void (not never) so callers can follow with 'return' for test isolation.
 */
function exitWithError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`Hiba: ${msg}`)
  ;(process.exit as (code?: number) => void)(1)
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function printFeedImportResult(result: FeedImportResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result))
    return
  }
  const rows: [string, string][] = [
    ['Létrehozva', String(result.created)],
    ['Frissítve', String(result.updated)],
    ['Összesen', String(result.total)],
  ]
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(12)} ${value}`)
  }
}

function printMarketImportResult(result: MarketImportResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result))
    return
  }
  const rows: [string, string][] = [
    ['Egyeztetett', String(result.matched)],
    ['Összesen', String(result.total)],
  ]
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(12)} ${value}`)
  }
}

// ---------------------------------------------------------------------------
// Feed URL table
// ---------------------------------------------------------------------------

interface FeedUrl {
  name: string
  url: string
}

function buildFeedUrls(base: string): FeedUrl[] {
  return [
    { name: 'Árukereső', url: `${base}/feed/arukereso.xml` },
    { name: 'Google Shopping', url: `${base}/feed/google.xml` },
  ]
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerFeedsCommands(program: Command, client: HasznoClient): void {
  const feeds = program
    .command('feeds')
    .description('Feed kezelés — termékfeed import/export, kimenő feed URL-ek')

  // ── import-supplier ──────────────────────────────────────────────────────
  feeds
    .command('import-supplier')
    .description('Partner/szállító termékfeedet importál (CSV vagy XML)')
    .requiredOption(
      '--supplier <id>',
      'Szállító azonosítója (egész szám)',
      (v: string) => {
        const n = parseInt(v, 10)
        if (isNaN(n) || n <= 0)
          throw new InvalidArgumentError(
            `Érvénytelen szállító azonosító: "${v}". Pozitív egész szám szükséges.`,
          )
        return n
      },
    )
    .requiredOption(
      '--format <format>',
      'Feed formátum: csv vagy xml',
      (v: string) => {
        if (v !== 'csv' && v !== 'xml')
          throw new InvalidArgumentError(
            `Érvénytelen formátum: "${v}". Elfogadott értékek: csv, xml`,
          )
        return v as 'csv' | 'xml'
      },
    )
    .option('--file <path>', 'Feed fájl elérési útja (alapértelmezett: stdin)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(
      async (
        opts: { supplier: number; format: 'csv' | 'xml'; file?: string; yes?: boolean },
        cmd: Command,
      ) => {
        const confirmed = await requireConfirm(
          Boolean(opts.yes),
          `Importálja a(z) ${opts.supplier} azonosítójú szállító feedjét (${opts.format})?`,
        )
        if (!confirmed) return

        let content: string | undefined
        try {
          content = await readContent(opts.file)
        } catch (err) {
          exitWithError(err)
          return
        }
        if (content === undefined) return

        let result: FeedImportResult | undefined
        try {
          result = await client.feeds.importFeed({
            supplierId: opts.supplier,
            format: opts.format,
            content,
          })
        } catch (err) {
          exitWithError(err)
          return
        }
        if (result === undefined) return

        printFeedImportResult(result, getJson(cmd))
      },
    )

  // ── import-market ─────────────────────────────────────────────────────────
  feeds
    .command('import-market')
    .description('Piaci összehasonlító árakat importál CSV-ből')
    .option('--file <path>', 'CSV fájl elérési útja (alapértelmezett: stdin)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { file?: string; yes?: boolean }, cmd: Command) => {
      const confirmed = await requireConfirm(
        Boolean(opts.yes),
        'Importálja a piaci árakat?',
      )
      if (!confirmed) return

      let content: string | undefined
      try {
        content = await readContent(opts.file)
      } catch (err) {
        exitWithError(err)
        return
      }
      if (content === undefined) return

      let result: MarketImportResult | undefined
      try {
        result = await client.feeds.importMarketPrices({ content })
      } catch (err) {
        exitWithError(err)
        return
      }
      if (result === undefined) return

      printMarketImportResult(result, getJson(cmd))
    })

  // ── urls ──────────────────────────────────────────────────────────────────
  feeds
    .command('urls')
    .description(
      'Kimenő feed URL-ek megjelenítése (Árukereső, Google Shopping); --fetch esetén letölti a tartalmat',
    )
    .option('--fetch', 'Feedek letöltése és megjelenítése a URL-ek után')
    .action(async (opts: { fetch?: boolean }, cmd: Command) => {
      const base = getBaseUrl(cmd)
      const feedUrls = buildFeedUrls(base)
      const json = getJson(cmd)

      if (opts.fetch) {
        const results: Array<FeedUrl & { content?: string; error?: string }> = []
        for (const f of feedUrls) {
          try {
            const res = await fetch(f.url)
            const content = await res.text()
            results.push({ ...f, content })
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            results.push({ ...f, error })
          }
        }
        if (json) {
          console.log(JSON.stringify(results))
        } else {
          for (const r of results) {
            console.log(`\n── ${r.name} ──`)
            console.log(`URL: ${r.url}`)
            if (r.error) {
              console.error(`Letöltési hiba: ${r.error}`)
            } else {
              console.log(r.content ?? '')
            }
          }
        }
        return
      }

      if (json) {
        console.log(JSON.stringify(feedUrls))
        return
      }

      const nameWidth = Math.max(...feedUrls.map((f) => f.name.length)) + 2
      for (const f of feedUrls) {
        console.log(`${f.name.padEnd(nameWidth)} ${f.url}`)
      }
    })
}
