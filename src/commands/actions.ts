/**
 * CLI commands — agent actions.
 *
 * Subcommands:
 *   haszno actions list [--status <s>] [--limit <n>]
 *       List agent actions (newest first).
 *
 *   haszno actions propose --type <felvetel|levetel|ar|import>
 *       [--product-id <id>]           required for felvetel, levetel, ar
 *       [--network-product-id <id>]   required for import
 *       [--price <gross>]             required for ar
 *       --reason <text>               5–500 characters
 *       [--report-item <id>]          optional: link to a report item
 *
 * Note: approve and undo are intentionally NOT available in the CLI.
 * These are human-only operations and must be done in the web UI at /app.
 *
 * Exit codes: 0 OK, 1 runtime error, 2 usage/validation error.
 */
import type { Command } from 'commander'
import type {
  HasznoClient,
  AgentAction,
  ActionStatus,
  ActionInput,
} from '../client/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function isJsonMode(cmd: Command): boolean {
  let c: Command = cmd
  while (c.parent) c = c.parent
  return !!(c.opts<{ json?: boolean }>().json)
}

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function fmtFt(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('hu-HU') + ' Ft'
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })
}

function statusLabel(s: ActionStatus): string {
  switch (s) {
    case 'javasolt':     return 'javasolt'
    case 'vegrehajtva':  return 'végrehajtva'
    case 'elutasitva':   return 'elutasítva'
    case 'hiba':         return 'hiba'
    case 'visszavonva':  return 'visszavonva'
    default:             return s
  }
}

function actionDesc(a: ActionInput): string {
  switch (a.type) {
    case 'felvetel': return `felvétel (termék #${a.productId})`
    case 'levetel':  return `levétel (termék #${a.productId})`
    case 'ar':       return `átárazás → ${fmtFt(a.priceGross)} (termék #${a.productId})`
    case 'import':   return `import (hálózati termék #${a.networkProductId})`
    default:         return JSON.stringify(a)
  }
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function printActionsTable(rows: AgentAction[]): void {
  if (rows.length === 0) {
    process.stdout.write('Nincs találat.\n')
    return
  }

  const idW = 6
  const typeW = 10
  const targetW = 24
  const statusW = 13
  const autoW = 5
  const dateW = 16

  const header =
    'ID'.padStart(idW) + '  ' +
    padEnd('Típus', typeW) + '  ' +
    padEnd('Cél', targetW) + '  ' +
    padEnd('Állapot', statusW) + '  ' +
    padEnd('Auto', autoW) + '  ' +
    padEnd('Létrehozva', dateW)

  process.stdout.write(header + '\n' + '─'.repeat(header.length) + '\n')

  for (const r of rows) {
    const targetName = r.target?.name ?? actionDesc(r.action)
    const autoStr = r.autoApproved ? '  ✓' : ''
    const line =
      String(r.id).padStart(idW) + '  ' +
      padEnd(r.action.type, typeW) + '  ' +
      padEnd(targetName, targetW) + '  ' +
      padEnd(statusLabel(r.status), statusW) + '  ' +
      padEnd(autoStr, autoW) + '  ' +
      padEnd(fmtDate(r.createdAt), dateW)
    process.stdout.write(line + '\n')
  }

  process.stdout.write(`\nÖsszesen: ${rows.length} művelet\n`)
}

function printActionDetail(action: AgentAction): void {
  process.stdout.write('\nÚj agent-javaslat létrehozva:\n')
  process.stdout.write(`  ID:          ${action.id}\n`)
  process.stdout.write(`  Típus:       ${action.action.type}\n`)
  process.stdout.write(`  Leírás:      ${actionDesc(action.action)}\n`)
  process.stdout.write(`  Ok:          ${action.reason}\n`)
  process.stdout.write(`  Állapot:     ${statusLabel(action.status)}\n`)
  if (action.autoApproved) {
    process.stdout.write(`  Autopilot:   automatikusan végrehajtva\n`)
  }
  if (action.target) {
    process.stdout.write(`  Cél termék:  ${action.target.name}${action.target.sku ? ` (${action.target.sku})` : ''}\n`)
  }
  if (action.preview) {
    const p = action.preview
    if (p.oldPriceGross != null) process.stdout.write(`  Régi ár:     ${fmtFt(p.oldPriceGross)}\n`)
    if (p.newPriceGross != null) process.stdout.write(`  Új ár:       ${fmtFt(p.newPriceGross)}\n`)
    if (p.floorGross != null)    process.stdout.write(`  Árpadló:     ${fmtFt(p.floorGross)}\n`)
    if (p.marginPct != null)     process.stdout.write(`  Haszon:      ${p.marginPct.toFixed(1)}%\n`)
  }
  if (!action.autoApproved && action.status === 'javasolt') {
    process.stdout.write('\n  A jóváhagyás a webes felületen végezhető el: /app\n')
  }
}

function die(msg: string, code = 1): never {
  process.stderr.write(`Hiba: ${msg}\n`)
  process.exit(code)
}

const ALLOWED_STATUSES: ActionStatus[] = ['javasolt', 'vegrehajtva', 'elutasitva', 'hiba', 'visszavonva']

// ── Registration ──────────────────────────────────────────────────────────────

export function registerActionsCommands(program: Command, client: HasznoClient): void {
  const actions = program
    .command('actions')
    .description('Agent-műveletek kezelése (javaslatok és végrehajtott műveletek)')

  // ── actions list ──────────────────────────────────────────────────────────
  actions
    .command('list')
    .description('Agent-műveletek listázása (legújabb először, alapértelmezett: mind)')
    .option('-s, --status <állapot>', `Szűrés állapotra: ${ALLOWED_STATUSES.join(' | ')}`)
    .option('-l, --limit <n>', 'Maximum visszaadott elemek száma (1–200, alapért. 50)', '50')
    .action(async (opts: { status?: string; limit: string }, cmd: Command) => {
      if (opts.status && !ALLOWED_STATUSES.includes(opts.status as ActionStatus)) {
        die(
          `Érvénytelen állapot: "${opts.status}". Lehetséges értékek: ${ALLOWED_STATUSES.join(', ')}`,
          2,
        )
      }

      const limit = parseInt(opts.limit, 10)
      if (isNaN(limit) || limit < 1 || limit > 200) {
        die('A --limit értéknek 1 és 200 közé kell esnie', 2)
      }

      let rows: AgentAction[]
      try {
        rows = await client.manager.listActions({
          status: opts.status as ActionStatus | undefined,
          limit,
        })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rows)
      } else {
        printActionsTable(rows)
      }
    })

  // ── actions propose ───────────────────────────────────────────────────────
  actions
    .command('propose')
    .description(
      'Új agent-javaslat létrehozása. Jóváhagyás a webes felületen (/app) szükséges.\n' +
      'Típusok: felvetel, levetel, ar, import',
    )
    .requiredOption('--type <típus>', 'Művelet típusa: felvetel | levetel | ar | import')
    .option('--product-id <id>', 'Termék ID-ja (felvetel, levetel, ar esetén kötelező)')
    .option('--network-product-id <id>', 'Hálózati termék ID-ja (import esetén kötelező)')
    .option('--price <gross>', 'Bruttó ár forintban (ar esetén kötelező)')
    .requiredOption('--reason <szöveg>', 'Ok/indoklás (5–500 karakter)')
    .option('--report-item <id>', 'Kapcsolódó jelentés-elem ID-ja (opcionális)')
    .action(async (
      opts: {
        type: string
        productId?: string
        networkProductId?: string
        price?: string
        reason: string
        reportItem?: string
      },
      cmd: Command,
    ) => {
      const { type, reason, productId, networkProductId, price, reportItem } = opts

      // Validate type
      const validTypes = ['felvetel', 'levetel', 'ar', 'import']
      if (!validTypes.includes(type)) {
        die(`Érvénytelen típus: "${type}". Lehetséges értékek: ${validTypes.join(', ')}`, 2)
      }

      // Validate reason
      if (reason.length < 5 || reason.length > 500) {
        die('Az indoklás (--reason) 5–500 karakter hosszú kell legyen', 2)
      }

      // Build ActionInput
      let actionInput: ActionInput

      if (type === 'felvetel' || type === 'levetel') {
        if (!productId) {
          die(`A --product-id kötelező a "${type}" típushoz`, 2)
        }
        const pid = parseInt(productId, 10)
        if (isNaN(pid) || pid <= 0) die('Érvénytelen --product-id', 2)
        actionInput = { type: type as 'felvetel' | 'levetel', productId: pid }
      } else if (type === 'ar') {
        if (!productId) die('A --product-id kötelező az "ar" típushoz', 2)
        if (!price) die('A --price kötelező az "ar" típushoz', 2)
        const pid = parseInt(productId, 10)
        const priceGross = parseFloat(price)
        if (isNaN(pid) || pid <= 0) die('Érvénytelen --product-id', 2)
        if (isNaN(priceGross) || priceGross <= 0) die('Érvénytelen --price — pozitív számnak kell lennie', 2)
        actionInput = { type: 'ar', productId: pid, priceGross }
      } else {
        // import
        if (!networkProductId) die('A --network-product-id kötelező az "import" típushoz', 2)
        const nid = parseInt(networkProductId, 10)
        if (isNaN(nid) || nid <= 0) die('Érvénytelen --network-product-id', 2)
        actionInput = { type: 'import', networkProductId: nid }
      }

      const reportItemId = reportItem ? parseInt(reportItem, 10) : undefined
      if (reportItemId !== undefined && (isNaN(reportItemId) || reportItemId <= 0)) {
        die('Érvénytelen --report-item — pozitív egész szám szükséges', 2)
      }

      let action: AgentAction
      try {
        action = await client.manager.proposeAction({
          ...actionInput,
          reason,
          ...(reportItemId !== undefined ? { reportItemId } : {}),
        })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(action)
      } else {
        printActionDetail(action)
      }
    })
}
