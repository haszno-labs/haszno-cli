/**
 * CLI commands — orders (via agent endpoint).
 *
 * Domain: orders
 * Subcommands:
 *   haszno orders list [--status <s>]   list last 20 orders via agent endpoint (read-only)
 *   haszno orders show <id>             show one order with items via agent endpoint (read-only)
 *   haszno orders ship <id>             NOT AVAILABLE with shop token
 *   haszno orders demo                  NOT AVAILABLE with shop token
 *
 * Uses GET /api/agent/orders (AgentOrder[]).
 * Fields available: id, externalId, customerName, status, totalGross, createdAt,
 *   items: [{orderId, qty, priceGross, name, sku}]
 * Fields NOT available via shop token: address, supplierOrderId, trackingNumber, event log.
 *
 * Exit codes:
 *   0  success
 *   1  runtime error (API error, order not found, …)
 *   2  usage error (missing required argument, bad flag value, …)
 */
import { Command } from 'commander'
import type { HasznoClient, AgentOrder } from '../client/index.js'

const NOT_AVAILABLE_MSG =
  'Nem elérhető bolt API-kulccsal. Ez a művelet session tokent (webes bejelentkezést) igényel.\n' +
  'Használd a Haszno webes felületet a végrehajtáshoz.'

// ---- helpers ----------------------------------------------------------------

function isJsonMode(cmd: Command): boolean {
  // --json is on the root program; walk up the parent chain.
  let p: Command | null = cmd
  while (p) {
    const opts = p.opts<{ json?: boolean }>()
    if (opts.json) return true
    p = p.parent
  }
  return false
}

function fmt(n: number): string {
  return `${n.toLocaleString('hu-HU')} Ft`
}

function statusEmoji(status: AgentOrder['status']): string {
  switch (status) {
    case 'received':
      return '[uj]'
    case 'forwarded':
      return '[kuldve]'
    case 'shipped':
      return '[szallitva]'
    case 'error':
      return '[hiba]'
    default:
      return '?'
  }
}

function printOrdersTable(orders: AgentOrder[]): void {
  if (orders.length === 0) {
    console.log('Nincs megjeleníthető rendelés.')
    return
  }
  const header = ['ID', 'Külső ID', 'Vevő', 'Állapot', 'Összeg', 'Dátum']
  const rows = orders.map((o) => [
    String(o.id),
    o.externalId,
    o.customerName,
    `${statusEmoji(o.status)} ${o.status}`,
    fmt(o.totalGross),
    new Date(o.createdAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }),
  ])
  const all = [header, ...rows]
  const widths = header.map((_, ci) => Math.max(...all.map((r) => r[ci].length)))
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-')
  const fmtRow = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join(' | ')
  console.log(fmtRow(header))
  console.log(sep)
  for (const row of rows) console.log(fmtRow(row))
}

function printOrderDetail(o: AgentOrder): void {
  console.log(`\nRendelés #${o.id}`)
  console.log(`  Külső ID:      ${o.externalId}`)
  console.log(`  Vevő:          ${o.customerName}`)
  console.log(`  Állapot:       ${statusEmoji(o.status)} ${o.status}`)
  console.log(`  Összeg:        ${fmt(o.totalGross)}`)
  console.log(`  Létrehozva:    ${new Date(o.createdAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}`)
  // Note: address, supplierOrderId, trackingNumber, event log not available via shop token

  if (o.items.length > 0) {
    console.log('\n  Tételek:')
    for (const item of o.items) {
      console.log(`    - ${item.name} (SKU: ${item.sku})  ${item.qty} db  × ${fmt(item.priceGross)}`)
    }
  }
  console.log()
}

/** Prompt-less interactive confirm used when --yes is absent. */
async function interactiveConfirm(question: string): Promise<boolean> {
  // In non-TTY environments (CI, piped input) default to false.
  if (!process.stdin.isTTY) return false
  const { createInterface } = await import('readline')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${question} [i/n] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'i')
    })
  })
}

// ---- registration -----------------------------------------------------------

type ValidStatus = AgentOrder['status']
const VALID_STATUSES: ValidStatus[] = ['received', 'forwarded', 'shipped', 'error']

export function registerOrdersCommands(program: Command, client: HasznoClient): void {
  const orders = program
    .command('orders')
    .description('Rendelések kezelése')

  // ── orders list ────────────────────────────────────────────────────────────
  orders
    .command('list')
    .description('Az utolsó 20 rendelés listázása (agent endpoint, bolt token)')
    .option(
      '--status <állapot>',
      `Szűrés állapotra (${VALID_STATUSES.join(', ')})`,
    )
    .action(async (opts: { status?: string }, cmd: Command) => {
      if (opts.status && !VALID_STATUSES.includes(opts.status as ValidStatus)) {
        console.error(`Hiba: érvénytelen állapot "${opts.status}". Lehetséges értékek: ${VALID_STATUSES.join(', ')}`)
        process.exit(2)
      }
      let list: AgentOrder[]
      try {
        list = await client.agent.orders()
      } catch (err) {
        console.error('API hiba:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
      if (opts.status) {
        list = list.filter((o) => o.status === opts.status)
      }
      if (isJsonMode(cmd)) {
        process.stdout.write(JSON.stringify(list, null, 2) + '\n')
      } else {
        printOrdersTable(list)
      }
    })

  // ── orders show ────────────────────────────────────────────────────────────
  orders
    .command('show <id>')
    .description('Egy rendelés tételei (agent endpoint, bolt token; cím/tracking nem elérhető)')
    .action(async (idStr: string, _opts: unknown, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id) || id <= 0) {
        console.error('Hiba: az <id> egész szám kell legyen.')
        process.exit(2)
      }
      let list: AgentOrder[]
      try {
        list = await client.agent.orders()
      } catch (err) {
        console.error('API hiba:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
      const order = list.find((o) => o.id === id)
      if (!order) {
        console.error(`Hiba: a #${id} rendelés nem található az utolsó 20 között.`)
        process.exit(1)
      }
      if (isJsonMode(cmd)) {
        process.stdout.write(JSON.stringify(order, null, 2) + '\n')
      } else {
        printOrderDetail(order)
      }
    })

  // ── orders ship ────────────────────────────────────────────────────────────
  orders
    .command('ship <id>')
    .description('Rendelés megjelölése szállítottként — NEM ELÉRHETŐ bolt API-kulccsal')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (_idStr: string) => {
      console.error(NOT_AVAILABLE_MSG)
      process.exit(1)
    })

  // ── orders demo ────────────────────────────────────────────────────────────
  orders
    .command('demo')
    .description('Demo rendelés létrehozása — NEM ELÉRHETŐ bolt API-kulccsal')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async () => {
      console.error(NOT_AVAILABLE_MSG)
      process.exit(1)
    })
}
