/**
 * CLI commands — research (agent-driven findings).
 *
 * Subcommands:
 *   haszno research brief                   Print the research brief for today
 *   haszno research post <file.json>        Post FindingsInput from a file (or stdin if -)
 *
 * Exit codes: 0 OK, 1 runtime error, 2 usage/validation error.
 */
import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import type { HasznoClient, ResearchBrief, FindingsInput, DailyReport } from '../client/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isJsonMode(cmd: Command): boolean {
  let c: Command = cmd
  while (c.parent) c = c.parent
  return !!(c.opts<{ json?: boolean }>().json)
}

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function fmtFt(n: number): string {
  return n.toLocaleString('hu-HU') + ' Ft'
}

function printBrief(brief: ResearchBrief): void {
  process.stdout.write(`\nKutatási összefoglaló — ${brief.day}\n`)
  process.stdout.write('='.repeat(50) + '\n')
  process.stdout.write(`\nEredmények ide küldhetők: POST ${brief.postTo}\n`)

  if (brief.shopFocus.length > 0) {
    process.stdout.write('\nFókusz-termékek:\n')
    for (const f of brief.shopFocus) {
      const price = f.priceGross != null ? fmtFt(f.priceGross) : '—'
      const market = f.marketMinGross != null ? fmtFt(f.marketMinGross) : '—'
      const trend = f.trend ?? 'ismeretlen'
      process.stdout.write(
        `  ${f.keyword.padEnd(20)}  saját ár: ${price.padStart(12)}  piac min: ${market.padStart(12)}  trend: ${trend}\n`,
      )
    }
  }

  if (brief.questions.length > 0) {
    process.stdout.write('\nKutatási kérdések:\n')
    for (let i = 0; i < brief.questions.length; i++) {
      process.stdout.write(`  ${i + 1}. ${brief.questions[i]}\n`)
    }
  }
}

function printPostResult(report: DailyReport): void {
  const agentCount = report.items.filter(i => i.origin === 'agent').length
  process.stdout.write(
    `Eredmények feltöltve: ${report.day} — összesen ${report.items.length} elem, ebből ${agentCount} agent-kutatás\n`,
  )
}

function die(msg: string, code = 1): never {
  process.stderr.write(`Hiba: ${msg}\n`)
  process.exit(code)
}

async function readStdin(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    process.stdin.on('error', reject)
  })
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerResearchCommands(program: Command, client: HasznoClient): void {
  const research = program
    .command('research')
    .description('Agent-kutatás: összefoglaló lekérése és eredmények feltöltése')

  // ── research brief ────────────────────────────────────────────────────────
  research
    .command('brief')
    .description('Mai kutatási összefoglaló lekérése (fókusz-termékek és kérdések)')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      let brief: ResearchBrief
      try {
        brief = await client.manager.getResearchBrief()
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(brief)
      } else {
        printBrief(brief)
      }
    })

  // ── research post ─────────────────────────────────────────────────────────
  research
    .command('post [file]')
    .description(
      'Agent-kutatási eredmények feltöltése (FindingsInput JSON fájlból vagy stdin-ről ha -).\n' +
      'A nap meghatározása: --day kapcsoló, vagy a JSON "day" mezője, vagy a mai nap.',
    )
    .option('--day <YYYY-MM-DD>', 'Célnap (alapértelmezett: mai nap UTC szerint)')
    .action(async (file: string | undefined, opts: { day?: string }, cmd: Command) => {
      if (opts.day && !/^\d{4}-\d{2}-\d{2}$/.test(opts.day)) {
        die('Érvénytelen dátumformátum — YYYY-MM-DD szükséges (pl. 2026-11-12)', 2)
      }

      let raw: string
      if (!file || file === '-') {
        try {
          raw = await readStdin()
        } catch (err) {
          die(`Nem sikerült beolvasni a standard bemenetet: ${err instanceof Error ? err.message : String(err)}`)
        }
      } else {
        try {
          raw = readFileSync(file, 'utf-8')
        } catch (err) {
          die(`Nem sikerült megnyitni a fájlt "${file}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      let body: FindingsInput
      try {
        body = JSON.parse(raw) as FindingsInput
      } catch (err) {
        die(`Érvénytelen JSON: ${err instanceof Error ? err.message : String(err)}`, 2)
      }

      if (!body || typeof body !== 'object') {
        die('A JSON-nak FindingsInput objektumnak kell lennie', 2)
      }
      if (!Array.isArray(body.items) || body.items.length === 0) {
        die('A FindingsInput.items legalább 1 elemet kell tartalmazzon', 2)
      }

      // Determine day: --day flag > today UTC
      const day = opts.day ?? new Date().toISOString().slice(0, 10)

      let report: DailyReport
      try {
        report = await client.manager.postFindings(day, body)
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(report)
      } else {
        printPostResult(report)
      }
    })
}
