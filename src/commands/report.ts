/**
 * CLI commands — daily market report.
 *
 * Subcommands:
 *   haszno report [--day YYYY-MM-DD]   Pretty-print the daily report (latest by default)
 *
 * Exit codes: 0 OK, 1 runtime error, 2 usage/validation error.
 */
import type { Command } from 'commander'
import type { HasznoClient, DailyReport, ReportItem, ReportItemKind } from '../client/index.js'

// ── Formatting helpers ────────────────────────────────────────────────────────

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

function fmtPct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function kindLabel(kind: ReportItemKind): string {
  switch (kind) {
    case 'ar_emelkedes': return 'Áremelkedés'
    case 'ar_csokkenes': return 'Árcsökkenés'
    case 'trend':        return 'Trend'
    case 'hir':          return 'Hír'
    case 'keszlet':      return 'Készlet'
    case 'top_eladas':   return 'Top eladás'
    case 'lehetoseg':    return 'Lehetőség'
    default:             return kind
  }
}

function originBadge(origin: 'rendszer' | 'agent'): string {
  return origin === 'agent' ? '[Agent-kutatás]' : '[Haszno-adat]'
}

function printReportItem(item: ReportItem, index: number): void {
  const badge = originBadge(item.origin)
  const changeSuffix = item.changePct != null ? `  (${fmtPct(item.changePct)})` : ''
  const keywordSuffix = item.keyword ? `  Kulcsszó: ${item.keyword}` : ''

  process.stdout.write(`\n  ${index}. ${kindLabel(item.kind)}${changeSuffix}  ${badge}\n`)
  process.stdout.write(`     ${item.title}\n`)
  process.stdout.write(`     ${item.body}\n`)

  if (item.productName) {
    process.stdout.write(`     Termék: ${item.productName} (ID: ${item.productId})${keywordSuffix}\n`)
  }
  if (item.sourceName) {
    const urlPart = item.sourceUrl ? `  ${item.sourceUrl}` : ''
    process.stdout.write(`     Forrás: ${item.sourceName}${urlPart}\n`)
  }
  if (item.suggestedAction) {
    const a = item.suggestedAction
    let actionDesc: string
    switch (a.type) {
      case 'felvetel': actionDesc = `Felvétel (termék #${a.productId})`; break
      case 'levetel':  actionDesc = `Levétel (termék #${a.productId})`; break
      case 'ar':       actionDesc = `Átárazás → ${fmtFt(a.priceGross)} (termék #${a.productId})`; break
      case 'import':   actionDesc = `Import (hálózati termék #${a.networkProductId})`; break
      default:         actionDesc = JSON.stringify(a)
    }
    if (item.action) {
      process.stdout.write(`     Javaslat: ${actionDesc}  → Állapot: ${item.action.status}\n`)
    } else {
      process.stdout.write(`     Javaslat: ${actionDesc}  (Jóváhagyható a webes felületen)\n`)
    }
  }
}

function printReport(report: DailyReport): void {
  process.stdout.write(`\nNapi piaci jelentés — ${report.day}\n`)
  process.stdout.write('='.repeat(50) + '\n')

  if (report.headline) {
    process.stdout.write(`\n${report.headline}\n`)
  }
  if (report.summary) {
    process.stdout.write(`\n${report.summary}\n`)
  }

  if (report.items.length === 0) {
    process.stdout.write('\nNincs elem ebben a jelentésben.\n')
    return
  }

  // Group by kind
  const groups = new Map<ReportItemKind, ReportItem[]>()
  for (const item of report.items) {
    const list = groups.get(item.kind) ?? []
    list.push(item)
    groups.set(item.kind, list)
  }

  const kindOrder: ReportItemKind[] = [
    'ar_emelkedes', 'ar_csokkenes', 'trend', 'keszlet', 'top_eladas', 'lehetoseg', 'hir',
  ]

  let idx = 1
  for (const kind of kindOrder) {
    const items = groups.get(kind)
    if (!items || items.length === 0) continue
    process.stdout.write(`\n── ${kindLabel(kind)} (${items.length}) ──\n`)
    for (const item of items) {
      printReportItem(item, idx++)
    }
    groups.delete(kind)
  }

  // Any remaining kinds not in the order list
  for (const [kind, items] of groups) {
    process.stdout.write(`\n── ${kindLabel(kind)} (${items.length}) ──\n`)
    for (const item of items) {
      printReportItem(item, idx++)
    }
  }

  process.stdout.write(`\nÖsszesen: ${report.items.length} elem\n`)
}

function die(msg: string, code = 1): never {
  process.stderr.write(`Hiba: ${msg}\n`)
  process.exit(code)
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerReportCommands(program: Command, client: HasznoClient): void {
  program
    .command('report')
    .description('Napi piaci jelentés megjelenítése (alapértelmezett: legutóbbi)')
    .option('--day <YYYY-MM-DD>', 'Adott nap jelentése (pl. 2026-11-12)')
    .action(async (opts: { day?: string }, cmd: Command) => {
      if (opts.day && !/^\d{4}-\d{2}-\d{2}$/.test(opts.day)) {
        die('Érvénytelen dátumformátum — YYYY-MM-DD szükséges (pl. 2026-11-12)', 2)
      }

      let report: DailyReport | null
      try {
        if (opts.day) {
          report = await client.manager.getReport(opts.day)
        } else {
          report = await client.manager.getLatestReport()
        }
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (!report) {
        process.stdout.write('Még nem érhető el napi jelentés.\n')
        process.exit(0)
        return
      }

      if (isJsonMode(cmd)) {
        printJson(report)
      } else {
        printReport(report)
      }
    })
}
