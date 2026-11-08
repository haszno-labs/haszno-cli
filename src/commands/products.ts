/**
 * CLI commands — products (own shop products & pricing).
 *
 * Subcommands:
 *   haszno products list [--all] [--losing] [--over-market] [--cats <nevek>]
 *   haszno products show <id>
 *   haszno products update <id> [--market-min <ft>] [--market-shop <nev>] [--price <ft>] [--yes]
 *   haszno products listing <id> --on|--off [--yes]
 *   haszno products apply-prices [--ids <ids>] [--yes]
 *   haszno products describe <id> [--yes]
 *   haszno products stats
 *   haszno products impact [--days <n>]
 *
 * Exit codes: 0 OK, 1 runtime error, 2 usage/validation error.
 */
import readline from 'node:readline'
import type { Command } from 'commander'
import type { HasznoClient, Product } from '../client/index.js'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtFt(n: number): string {
  return n.toLocaleString('hu-HU') + ' Ft'
}

function fmtPct(n: number): string {
  return n.toFixed(1) + '%'
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function printTable(headers: string[], rows: string[][], widths: number[]): void {
  const headerLine = headers.map((h, i) => padEnd(h, widths[i] ?? 8)).join(' │ ')
  const divider = widths.map(w => '─'.repeat(w)).join('─┼─')
  console.log(headerLine)
  console.log(divider)
  for (const row of rows) {
    console.log(row.map((cell, i) => padEnd(cell, widths[i] ?? 8)).join(' │ '))
  }
}

/** Human-readable price status for a product. */
function statusLabel(p: Product): string {
  if (p.current.marginPct < 0) return 'VESZTESÉGES'
  if (p.marketMinGross !== null && p.priceGross > p.marketMinGross) return 'PIAC FELETT'
  if (!p.listed) return 'nincs listán'
  return 'OK'
}

// ── Interactive confirm ───────────────────────────────────────────────────────

/** Prompt the user on stderr; resolve true only on "y". */
export async function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise<boolean>((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === 'y')
    })
  })
}

// ── Handlers (exported for unit testing) ─────────────────────────────────────

export interface ListOpts {
  /** Include all products, not just listed ones. */
  all?: boolean
  /** Filter to products with negative current margin. */
  losing?: boolean
  /** Filter to products priced above the market minimum. */
  overMarket?: boolean
  /**
   * Comma-separated supplier name fragments to match (case-insensitive).
   * Example: --cats "auto,kert" shows products from suppliers whose name
   * contains "auto" or "kert".
   */
  cats?: string
  json?: boolean
}

export async function cmdList(client: HasznoClient, opts: ListOpts): Promise<void> {
  let rows = await client.products.list({ all: opts.all })

  if (opts.losing) rows = rows.filter(p => p.current.marginPct < 0)
  if (opts.overMarket) rows = rows.filter(p => p.marketMinGross !== null && p.priceGross > p.marketMinGross)
  if (opts.cats) {
    const cats = opts.cats.toLowerCase().split(',').map(c => c.trim()).filter(Boolean)
    rows = rows.filter(p => cats.some(c => p.supplierName.toLowerCase().includes(c)))
  }

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }

  if (rows.length === 0) {
    console.log('Nincs találat.')
    return
  }

  printTable(
    ['ID', 'SKU', 'Termék', 'Beszer.', 'Ár (Ft)', 'Piac min', 'Ajánlott', 'Marzs', 'Státusz'],
    rows.map(p => [
      String(p.id),
      p.sku.slice(0, 18),
      p.name.slice(0, 30),
      fmtFt(p.costNet),
      fmtFt(p.priceGross),
      p.marketMinGross !== null ? fmtFt(p.marketMinGross) : '–',
      fmtFt(p.recommended.priceGross),
      fmtPct(p.current.marginPct),
      statusLabel(p),
    ]),
    [5, 18, 30, 11, 11, 11, 11, 7, 12],
  )
  console.log(`\n${rows.length} termék`)
}

export interface ShowOpts {
  json?: boolean
}

export async function cmdShow(client: HasznoClient, id: number, opts: ShowOpts): Promise<void> {
  const products = await client.products.list({ all: true })
  const p = products.find(x => x.id === id)
  if (!p) {
    console.error(`Nem található termék: ${id}`)
    process.exitCode = 1
    return
  }

  if (opts.json) {
    console.log(JSON.stringify(p, null, 2))
    return
  }

  console.log(`ID:            ${p.id}`)
  console.log(`SKU:           ${p.sku}`)
  console.log(`Neve:          ${p.name}`)
  console.log(`Beszállító:    ${p.supplierName}`)
  console.log(`Beszerzési ár: ${fmtFt(p.costNet)} (nettó)`)
  console.log(`Eladási ár:    ${fmtFt(p.priceGross)} (bruttó)`)
  console.log(`Piaci min:     ${p.marketMinGross !== null ? fmtFt(p.marketMinGross) : '–'}${p.marketShop ? ` (${p.marketShop})` : ''}`)
  console.log(`Ajánlott ár:   ${fmtFt(p.recommended.priceGross)}`)
  console.log(`Marzs (aktu):  ${fmtPct(p.current.marginPct)} (${fmtFt(p.current.marginNet)} nettó)`)
  console.log(`Marzs (ajánl): ${fmtPct(p.recommended.marginPct)} (${fmtFt(p.recommended.marginNet)} nettó)`)
  console.log(`Készlet:       ${p.stock}`)
  console.log(`Listán:        ${p.listed ? 'igen' : 'nem'}`)
  console.log(`Frissítve:     ${fmtDate(p.updatedAt)}`)
}

export interface UpdateOpts {
  /** New market minimum gross price in HUF, or "null" to clear. */
  marketMin?: string
  /** Market source shop name, or "null" to clear. */
  marketShop?: string
  /** New own listing gross price in HUF. */
  price?: string
  yes?: boolean
  json?: boolean
  /** Injectable confirm function for testing. */
  confirm?: () => Promise<boolean>
}

export async function cmdUpdate(client: HasznoClient, id: number, opts: UpdateOpts): Promise<void> {
  const body: { marketMinGross?: number | null; marketShop?: string | null; priceGross?: number } = {}
  if (opts.marketMin !== undefined) body.marketMinGross = opts.marketMin === 'null' ? null : Number(opts.marketMin)
  if (opts.marketShop !== undefined) body.marketShop = opts.marketShop === 'null' ? null : opts.marketShop
  if (opts.price !== undefined) body.priceGross = Number(opts.price)

  if (Object.keys(body).length === 0) {
    console.error('Legalább egy mezőt meg kell adni: --market-min, --market-shop vagy --price')
    process.exitCode = 2
    return
  }

  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`Frissíti a termék #${id} adatait?`))
    const ok = await confirmFn()
    if (!ok) { console.log('Megszakítva.'); return }
  }

  const updated = await client.products.update(id, body)
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2))
  } else {
    console.log(`Termék #${updated.id} frissítve.`)
    if (body.priceGross !== undefined) console.log(`  Eladási ár:   ${fmtFt(updated.priceGross)}`)
    if (body.marketMinGross !== undefined) console.log(`  Piaci min:    ${updated.marketMinGross !== null ? fmtFt(updated.marketMinGross) : '–'}`)
    if (body.marketShop !== undefined) console.log(`  Piaci forrás: ${updated.marketShop ?? '–'}`)
  }
}

export interface ListingOpts {
  /** Set the product to listed. */
  on?: boolean
  /** Set the product to unlisted. */
  off?: boolean
  yes?: boolean
  json?: boolean
  /** Injectable confirm function for testing. */
  confirm?: () => Promise<boolean>
}

export async function cmdListing(client: HasznoClient, id: number, opts: ListingOpts): Promise<void> {
  if (!opts.on && !opts.off) {
    console.error('Add meg: --on (listáz) vagy --off (levesz a listáról)')
    process.exitCode = 2
    return
  }

  const listed = Boolean(opts.on)
  const action = listed ? 'listára tegyem' : 'levegyem a listáról'

  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`Termék #${id}: ${action}?`))
    const ok = await confirmFn()
    if (!ok) { console.log('Megszakítva.'); return }
  }

  const updated = await client.products.setListing(id, { listed })
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2))
  } else {
    console.log(`Termék #${updated.id}: ${updated.listed ? 'listán van ✓' : 'nincs listán ✗'}.`)
  }
}

export interface ApplyPricesOpts {
  /** Comma-separated product IDs to update; omit for all products. */
  ids?: string
  yes?: boolean
  json?: boolean
  /** Injectable confirm function for testing. */
  confirm?: () => Promise<boolean>
}

export async function cmdApplyPrices(client: HasznoClient, opts: ApplyPricesOpts): Promise<void> {
  const ids = opts.ids
    ? opts.ids.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0)
    : undefined
  const scope = ids ? `${ids.length} db kiválasztott termék` : 'összes termék'

  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`Alkalmazza az ajánlott árakat (${scope})?`))
    const ok = await confirmFn()
    if (!ok) { console.log('Megszakítva.'); return }
  }

  const result = await client.products.applyPrices(ids ? { ids } : undefined)
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Kész: ${result.changed}/${result.total} termék ára frissítve.`)
  }
}

export interface DescribeOpts {
  yes?: boolean
  json?: boolean
  /** Injectable confirm function for testing. */
  confirm?: () => Promise<boolean>
}

export async function cmdDescribe(client: HasznoClient, id: number, opts: DescribeOpts): Promise<void> {
  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`AI termékleírás generálása (termék #${id})?`))
    const ok = await confirmFn()
    if (!ok) { console.log('Megszakítva.'); return }
  }

  const result = await client.products.generateAiDescription(id)
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(result.text)
  }
}

export interface StatsOpts {
  json?: boolean
}

export async function cmdStats(client: HasznoClient, opts: StatsOpts): Promise<void> {
  const stats = await client.stats.get()
  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2))
    return
  }
  console.log('Termékek összesen:   ' + stats.products)
  console.log('Veszteséges:         ' + stats.losing)
  console.log('Piac felett árazott: ' + stats.overMarket)
  console.log('Javításra szorul:    ' + stats.toFix)
  console.log('Rendelések:          ' + stats.orders)
}

export interface ImpactOpts {
  /** Number of days to look back (passed to the API). */
  days?: string
  json?: boolean
}

export async function cmdImpact(client: HasznoClient, opts: ImpactOpts): Promise<void> {
  const days = opts.days !== undefined ? Number(opts.days) : undefined
  const impact = await client.stats.getImpact(days !== undefined ? { days } : undefined)

  if (opts.json) {
    console.log(JSON.stringify(impact, null, 2))
    return
  }

  console.log(`Haszon-mérő (${impact.days} nap)`)
  console.log('─'.repeat(40))
  console.log(`Alap profit:          ${fmtFt(impact.baseline)}`)
  console.log(`Extra profit:         ${fmtFt(impact.extraProfit)}`)
  console.log(`Profit növekedés:     +${fmtPct(impact.pctGain)}`)
  console.log(`Rendelések:           ${impact.orders}`)
  console.log(`Auto-továbbított:     ${impact.autoForwardedOrders}`)
}

// ── Commander registration ────────────────────────────────────────────────────

function handleError(err: unknown): never {
  if (err instanceof Error) {
    console.error('Hiba:', err.message)
  } else {
    console.error('Ismeretlen hiba:', String(err))
  }
  process.exit(1)
}

export function registerProductsCommands(program: Command, client: HasznoClient): void {
  const products = program
    .command('products')
    .description('Saját bolt termékei és árazás')

  // ── list ──────────────────────────────────────────────────────────────────
  products
    .command('list')
    .description('Termékek listája marginnal és árállapottal')
    .option('--all', 'Minden termék, ne csak a listázottak')
    .option('--losing', 'Csak veszteséges termékek (marzs < 0)')
    .option('--over-market', 'Csak a piaci minimum fölé árázott termékek')
    .option('--cats <nevek>', 'Szűrés beszállítónévre — vesszővel elválasztott részsztringek, pl. "auto,kert"')
    .action(async (opts: { all?: boolean; losing?: boolean; overMarket?: boolean; cats?: string }) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdList(client, { ...opts, json: root.json }).catch(handleError)
    })

  // ── show ──────────────────────────────────────────────────────────────────
  products
    .command('show <id>')
    .description('Termék részletes adatlapja')
    .action(async (id: string) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdShow(client, Number(id), { json: root.json }).catch(handleError)
    })

  // ── update ────────────────────────────────────────────────────────────────
  products
    .command('update <id>')
    .description('Piaci ár / bolt neve / eladási ár frissítése [ÍRÁS]')
    .option('--market-min <ft>', 'Piaci minimum ár (Ft bruttó; "null" = törlés)')
    .option('--market-shop <nev>', 'Piaci forrás neve ("null" = törlés)')
    .option('--price <ft>', 'Saját eladási ár (Ft bruttó)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (id: string, opts: { marketMin?: string; marketShop?: string; price?: string; yes?: boolean }) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdUpdate(client, Number(id), { ...opts, json: root.json }).catch(handleError)
    })

  // ── listing ───────────────────────────────────────────────────────────────
  products
    .command('listing <id>')
    .description('Termék listázása vagy levétele [ÍRÁS]')
    .option('--on', 'Tegye listára')
    .option('--off', 'Vegye le a listáról')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (id: string, opts: { on?: boolean; off?: boolean; yes?: boolean }) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdListing(client, Number(id), { ...opts, json: root.json }).catch(handleError)
    })

  // ── apply-prices ──────────────────────────────────────────────────────────
  products
    .command('apply-prices')
    .description('Alkalmazza az AI által javasolt árakat [ÍRÁS]')
    .option('--ids <ids>', 'Csak ezekre a termék-ID-kra (vesszővel elválasztva), pl. "12,34,56"')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { ids?: string; yes?: boolean }) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdApplyPrices(client, { ...opts, json: root.json }).catch(handleError)
    })

  // ── describe ──────────────────────────────────────────────────────────────
  products
    .command('describe <id>')
    .description('AI termékleírás generálása [ÍRÁS]')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdDescribe(client, Number(id), { ...opts, json: root.json }).catch(handleError)
    })

  // ── stats ─────────────────────────────────────────────────────────────────
  products
    .command('stats')
    .description('Termék dashboard összesítő')
    .action(async () => {
      const root = program.opts<{ json?: boolean }>()
      await cmdStats(client, { json: root.json }).catch(handleError)
    })

  // ── impact ────────────────────────────────────────────────────────────────
  products
    .command('impact')
    .description('Haszon-mérő: becsült extra profit az ajánlott árakból')
    .option('--days <n>', 'Visszatekintési ablak napokban (alapértelmezés: 30)')
    .action(async (opts: { days?: string }) => {
      const root = program.opts<{ json?: boolean }>()
      await cmdImpact(client, { ...opts, json: root.json }).catch(handleError)
    })
}
