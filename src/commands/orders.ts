/**
 * CLI commands — orders.
 *
 * Domain: orders
 * Subcommands:
 *   haszno orders list [--status <s>]   list last 50 orders (optionally filtered by status)
 *   haszno orders show <id>             show one order with items and event log
 *   haszno orders ship <id>             mark an order as shipped (write, requires --yes)
 *   haszno orders demo                  create a demo order (demo mode only, requires --yes)
 *
 * Exit codes:
 *   0  success
 *   1  runtime error (API error, order not found, …)
 *   2  usage error (missing required argument, bad flag value, …)
 */
import { Command } from 'commander'
import type { HasznoClient, Order } from '../client/index.js'

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
  return `${(n / 100).toFixed(0)} Ft`
}

function statusEmoji(status: Order['status']): string {
  switch (status) {
    case 'received':
      return '📥'
    case 'forwarded':
      return '📤'
    case 'shipped':
      return '🚚'
    case 'error':
      return '❌'
    default:
      return '?'
  }
}

function printOrdersTable(orders: Order[]): void {
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

function printOrderDetail(o: Order): void {
  console.log(`\nRendelés #${o.id}`)
  console.log(`  Külső ID:      ${o.externalId}`)
  console.log(`  Vevő:          ${o.customerName}`)
  console.log(`  Cím:           ${o.address}`)
  console.log(`  Állapot:       ${statusEmoji(o.status)} ${o.status}`)
  if (o.supplierOrderId) console.log(`  Szállítói ID:  ${o.supplierOrderId}`)
  if (o.trackingNumber) console.log(`  Tracking:      ${o.trackingNumber}`)
  console.log(`  Összeg:        ${fmt(o.totalGross)}`)
  console.log(`  Létrehozva:    ${new Date(o.createdAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}`)

  if (o.items.length > 0) {
    console.log('\n  Tételek:')
    for (const item of o.items) {
      console.log(`    - ${item.name} (SKU: ${item.sku})  ${item.qty} db  × ${fmt(item.priceGross)}`)
    }
  }

  if (o.events.length > 0) {
    console.log('\n  Eseménynapló:')
    for (const ev of o.events) {
      const ts = new Date(ev.at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })
      console.log(`    [${ts}] ${ev.text}`)
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

type ValidStatus = Order['status']
const VALID_STATUSES: ValidStatus[] = ['received', 'forwarded', 'shipped', 'error']

export function registerOrdersCommands(program: Command, client: HasznoClient): void {
  const orders = program
    .command('orders')
    .description('Rendelések kezelése')

  // ── orders list ────────────────────────────────────────────────────────────
  orders
    .command('list')
    .description('Az utolsó 50 rendelés listázása')
    .option(
      '--status <állapot>',
      `Szűrés állapotra (${VALID_STATUSES.join(', ')})`,
    )
    .action(async (opts: { status?: string }, cmd: Command) => {
      if (opts.status && !VALID_STATUSES.includes(opts.status as ValidStatus)) {
        console.error(`Hiba: érvénytelen állapot "${opts.status}". Lehetséges értékek: ${VALID_STATUSES.join(', ')}`)
        process.exit(2)
      }
      let list: Order[]
      try {
        list = await client.orders.list()
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
    .description('Egy rendelés részletes adatai tételekkel és eseménynaplóval')
    .action(async (idStr: string, _opts: unknown, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id) || id <= 0) {
        console.error('Hiba: az <id> egész szám kell legyen.')
        process.exit(2)
      }
      let list: Order[]
      try {
        list = await client.orders.list()
      } catch (err) {
        console.error('API hiba:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
      const order = list.find((o) => o.id === id)
      if (!order) {
        console.error(`Hiba: a #${id} rendelés nem található.`)
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
    .description('Rendelés megjelölése szállítottként (írás — szükséges: --yes)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (idStr: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id) || id <= 0) {
        console.error('Hiba: az <id> egész szám kell legyen.')
        process.exit(2)
      }
      if (!opts.yes) {
        const ok = await interactiveConfirm(`Biztosan szállítottként jelöled a #${id} rendelést?`)
        if (!ok) {
          console.log('Megszakítva.')
          process.exit(0)
        }
      }
      let updated: Order
      try {
        updated = await client.orders.ship(id)
      } catch (err) {
        console.error('API hiba:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
      if (isJsonMode(cmd)) {
        process.stdout.write(JSON.stringify(updated, null, 2) + '\n')
      } else {
        console.log(`✓ #${id} rendelés állapota: ${updated.status}`)
      }
    })

  // ── orders demo ────────────────────────────────────────────────────────────
  orders
    .command('demo')
    .description('Demo rendelés létrehozása (csak demo módban — szükséges: --yes)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        const ok = await interactiveConfirm('Demo rendelést hozol létre. Folytatod?')
        if (!ok) {
          console.log('Megszakítva.')
          process.exit(0)
        }
      }
      let result: { id: number }
      try {
        result = await client.orders.createDemo()
      } catch (err) {
        console.error('API hiba:', err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
      if (isJsonMode(cmd)) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
      } else {
        console.log(`✓ Demo rendelés létrehozva: #${result.id}`)
      }
    })
}
