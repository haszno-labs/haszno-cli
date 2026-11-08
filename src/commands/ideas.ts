/**
 * CLI commands — ideas (product ideas / AI recommendations).
 *
 * Domain: ideas
 * Subcommands:
 *   haszno ideas list [--min-score <n>] [--supplier <name>] [--limit <n>]
 *       List AI product idea shortlist with score breakdown.
 *       Displays: rank, SKU, name, supplier, stock, suggested price, margin%, trend score.
 *       Reports total token cost from the AI shortlist in human mode.
 *
 *   haszno ideas fill-keywords [--yes]
 *       Fill missing trend keywords via AI (write — requires --yes or interactive confirm).
 *       Reports how many keywords were updated.
 *
 * Exit codes:
 *   0  success
 *   1  runtime error (API failure, etc.)
 *   2  usage error / validation failure
 */
import { Command } from 'commander'
import type { HasznoClient, RecommendationItem, Recommendations } from '../client/index.js'
import * as readline from 'node:readline'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a forint amount: "12 345 Ft" */
function fmt(n: number): string {
  return `${Math.round(n).toLocaleString('hu-HU')} Ft`
}

/** Format a percentage: "12.3%" */
function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

/** Resolve the --json flag from the root program's opts. */
function isJson(rootProgram: Command): boolean {
  return (rootProgram.opts<{ json?: boolean }>()).json === true
}

/**
 * Ask the user a yes/no question on stderr; resolve true if the user types "y" / "Y" / "igen".
 * Never used when --json is set (callers should short-circuit with --yes).
 */
function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'igen')
    })
  })
}

/** Print a simple ASCII table with fixed-width columns. */
function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  )
  const sep = widths.map((w) => '-'.repeat(w)).join('  ')
  const line = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join('  ')
  console.log(line(headers))
  console.log(sep)
  for (const row of rows) {
    console.log(line(row))
  }
}

// ---------------------------------------------------------------------------
// ideas list
// ---------------------------------------------------------------------------

function buildListCommand(rootProgram: Command, client: HasznoClient): Command {
  return new Command('list')
    .description('AI-termékötlet lista pontszám-részletezővel (csak olvasás)')
    .option('--min-score <n>', 'minimális trendpontszám szűrő (0–100)', parseFloat)
    .option('--supplier <name>', 'szűrés beszállítóra (részleges egyezés, kis/nagybetű-érzéketlen)')
    .option('--limit <n>', 'maximálisan megjelenített tételek száma', parseInt)
    .action(async (opts: { minScore?: number; supplier?: string; limit?: number }) => {
      const json = isJson(rootProgram)

      let recs: Recommendations
      try {
        recs = await client.recommendations.get()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (json) {
          console.error(JSON.stringify({ error: msg }))
        } else {
          console.error(`Hiba a javaslatok lekérésekor: ${msg}`)
        }
        process.exit(1)
      }

      let items: RecommendationItem[] = recs.items ?? []

      // Filters
      if (opts.minScore != null) {
        if (isNaN(opts.minScore) || opts.minScore < 0 || opts.minScore > 100) {
          console.error('Hiba: --min-score 0 és 100 közötti szám legyen.')
          process.exit(2)
        }
        items = items.filter((it) => (it.trendScore ?? 0) >= opts.minScore!)
      }

      if (opts.supplier) {
        const q = opts.supplier.toLowerCase()
        items = items.filter((it) => it.supplierName.toLowerCase().includes(q))
      }

      // Sort by trendScore DESC, then marginPct DESC
      items = [...items].sort((a, b) => {
        const tsDiff = (b.trendScore ?? 0) - (a.trendScore ?? 0)
        if (tsDiff !== 0) return tsDiff
        return (b.recommended?.marginPct ?? 0) - (a.recommended?.marginPct ?? 0)
      })

      if (opts.limit != null) {
        if (isNaN(opts.limit) || opts.limit < 1) {
          console.error('Hiba: --limit legalább 1 legyen.')
          process.exit(2)
        }
        items = items.slice(0, opts.limit)
      }

      if (json) {
        console.log(
          JSON.stringify({
            anchor: recs.anchor,
            geo: recs.geo,
            total: (recs.items ?? []).length,
            filtered: items.length,
            items: items.map((it, i) => ({
              rank: i + 1,
              id: it.id,
              sku: it.sku,
              name: it.name,
              supplier: it.supplierName,
              stock: it.stock,
              costNet: it.costNet,
              suggestedPriceGross: it.recommended?.priceGross,
              marginNet: it.recommended?.marginNet,
              marginPct: it.recommended?.marginPct,
              trendScore: it.trendScore ?? null,
            })),
          }),
        )
        return
      }

      console.log(`\nÁrfutár AI termékötlet lista  |  referencia: ${recs.anchor}  |  régió: ${recs.geo}`)
      console.log(`Összesen ${(recs.items ?? []).length} javaslat${items.length < (recs.items ?? []).length ? `, szűrés után: ${items.length}` : ''}\n`)

      if (items.length === 0) {
        console.log('Nincs a feltételeknek megfelelő termékötlet.')
        return
      }

      const rows = items.map((it, i) => [
        String(i + 1),
        it.sku,
        it.name.length > 36 ? it.name.slice(0, 33) + '...' : it.name,
        it.supplierName,
        String(it.stock),
        fmt(it.recommended?.priceGross ?? 0),
        fmtPct(it.recommended?.marginPct ?? 0),
        it.trendScore != null ? String(it.trendScore) : '—',
      ])

      printTable(
        ['#', 'SKU', 'Termék', 'Beszállító', 'Készlet', 'Jav.ár (bruttó)', 'Fedezet%', 'Trend'],
        rows,
      )
      console.log()
    })
}

// ---------------------------------------------------------------------------
// ideas fill-keywords
// ---------------------------------------------------------------------------

function buildFillKeywordsCommand(rootProgram: Command, client: HasznoClient): Command {
  return new Command('fill-keywords')
    .description('Hiányzó trendkulcsszavak AI-os feltöltése (írás — szükséges --yes)')
    .option('--yes', 'megerősítés nélkül fut le')
    .action(async (opts: { yes?: boolean }) => {
      const json = isJson(rootProgram)

      const confirmed = opts.yes
        ? true
        : json
          ? false // --json mode: writes must be explicit → reject
          : await confirm('Kulcsszófrissítés elindítása AI-jal? Ez valódi API-hívást kezdeményez.')

      if (!confirmed) {
        const msg = 'Megszakítva. Használd a --yes kapcsolót a megerősítéshez.'
        if (json) {
          console.error(JSON.stringify({ error: msg, hint: 'pass --yes to confirm' }))
        } else {
          console.log(msg)
        }
        process.exit(0)
      }

      let result: { updated: number }
      try {
        result = await client.recommendations.fillTrendKeywords()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (json) {
          console.error(JSON.stringify({ error: msg }))
        } else {
          console.error(`Hiba a kulcsszófrissítés során: ${msg}`)
        }
        process.exit(1)
      }

      if (json) {
        console.log(JSON.stringify({ updated: result.updated }))
        return
      }

      console.log(`Kulcsszófrissítés kész: ${result.updated} termék frissítve.`)
    })
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerIdeasCommands(program: Command, client: HasznoClient): void {
  const ideas = new Command('ideas')
    .description('AI termékötletek és trendkulcsszavak kezelése')

  ideas.addCommand(buildListCommand(program, client))
  ideas.addCommand(buildFillKeywordsCommand(program, client))

  program.addCommand(ideas)
}
