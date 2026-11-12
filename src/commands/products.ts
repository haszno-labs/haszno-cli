/**
 * CLI commands — products (own shop products via agent endpoint).
 *
 * Subcommands:
 *   haszno products list [--losing] [--cats <nevek>]       (agent endpoint, read-only)
 *   haszno products show <id>                              (agent endpoint, read-only)
 *   haszno products update <id> ...                        NOT AVAILABLE with shop token
 *   haszno products listing <id> --on|--off                NOT AVAILABLE with shop token
 *   haszno products apply-prices ...                       NOT AVAILABLE with shop token
 *   haszno products describe <id>                          NOT AVAILABLE with shop token
 *   haszno products stats                                  NOT AVAILABLE with shop token
 *   haszno products impact [--days <n>]                    NOT AVAILABLE with shop token
 *
 * Uses GET /api/agent/products (AgentProduct[]).
 * Fields available: id, sku, name, listed, priceGross, stock, supplierName,
 *   current: {priceGross, marginNet, marginPct}, recommended: {priceGross, marginNet, marginPct}
 * Fields NOT available via shop token: costNet, marketMinGross, marketShop, updatedAt, rrpGross.
 *
 * Exit codes: 0 OK, 1 runtime error, 2 usage/validation error.
 */
import readline from 'node:readline'
import type { Command } from 'commander'
import type { HasznoClient, AgentProduct } from '../client/index.js'

const NOT_AVAILABLE_MSG =
  'Nem elérhető bolt API-kulccsal. Ez a művelet session tokent (webes bejelentkezést) igényel.\n' +
  'Használd a Haszno webes felületet a végrehajtáshoz.'

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

/** Human-readable price status for an agent product (no costNet, no marketMinGross). */
function statusLabel(p: AgentProduct): string {
  if (p.current.marginPct < 0) return 'VESZTESÉGES'
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
  /** Filter to products with negative current margin. */
  losing?: boolean
  /**
   * Comma-separated supplier name fragments to match (case-insensitive).
   * Example: --cats "auto,kert" shows products from suppliers whose name
   * contains "auto" or "kert".
   */
  cats?: string
  json?: boolean
}

export async function cmdList(client: HasznoClient, opts: ListOpts): Promise<void> {
  let rows = await client.agent.products()

  if (opts.losing) rows = rows.filter(p => p.current.marginPct < 0)
  // Note: --over-market is not supported (marketMinGross not returned by shop token endpoint)
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
    ['ID', 'SKU', 'Termék', 'Ár (Ft)', 'Ajánlott', 'Marzs', 'Készlet', 'Státusz'],
    rows.map(p => [
      String(p.id),
      p.sku.slice(0, 18),
      p.name.slice(0, 30),
      fmtFt(p.priceGross),
      fmtFt(p.recommended.priceGross),
      fmtPct(p.current.marginPct),
      String(p.stock),
      statusLabel(p),
    ]),
    [5, 18, 30, 11, 11, 7, 7, 12],
  )
  console.log(`\n${rows.length} termék`)
}

export interface ShowOpts {
  json?: boolean
}

export async function cmdShow(client: HasznoClient, id: number, opts: ShowOpts): Promise<void> {
  const products = await client.agent.products()
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
  console.log(`Eladási ár:    ${fmtFt(p.priceGross)} (bruttó)`)
  console.log(`Ajánlott ár:   ${fmtFt(p.recommended.priceGross)}`)
  console.log(`Marzs (aktu):  ${fmtPct(p.current.marginPct)} (${fmtFt(p.current.marginNet)} nettó)`)
  console.log(`Marzs (ajánl): ${fmtPct(p.recommended.marginPct)} (${fmtFt(p.recommended.marginNet)} nettó)`)
  console.log(`Készlet:       ${p.stock}`)
  console.log(`Listán:        ${p.listed ? 'igen' : 'nem'}`)
  // Note: costNet, marketMinGross, marketShop, updatedAt are not available via shop token
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

export async function cmdUpdate(_client: HasznoClient, _id: number, _opts: UpdateOpts): Promise<void> {
  console.error(NOT_AVAILABLE_MSG)
  process.exitCode = 1
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

export async function cmdListing(_client: HasznoClient, _id: number, _opts: ListingOpts): Promise<void> {
  console.error(NOT_AVAILABLE_MSG)
  process.exitCode = 1
}

export interface ApplyPricesOpts {
  /** Comma-separated product IDs to update; omit for all products. */
  ids?: string
  yes?: boolean
  json?: boolean
  /** Injectable confirm function for testing. */
  confirm?: () => Promise<boolean>
}

export async function cmdApplyPrices(_client: HasznoClient, _opts: ApplyPricesOpts): Promise<void> {
  console.error(NOT_AVAILABLE_MSG)
  process.exitCode = 1
}

export interface DescribeOpts {
  yes?: boolean
  json?: boolean
  /** Injectable confirm function for testing. */
  confirm?: () => Promise<boolean>
}

export async function cmdDescribe(_client: HasznoClient, _id: number, _opts: DescribeOpts): Promise<void> {
  console.error(NOT_AVAILABLE_MSG)
  process.exitCode = 1
}

export interface StatsOpts {
  json?: boolean
}

export async function cmdStats(_client: HasznoClient, _opts: StatsOpts): Promise<void> {
  console.error(NOT_AVAILABLE_MSG)
  process.exitCode = 1
}

export interface ImpactOpts {
  /** Number of days to look back (passed to the API). */
  days?: string
  json?: boolean
}

export async function cmdImpact(_client: HasznoClient, _opts: ImpactOpts): Promise<void> {
  console.error(NOT_AVAILABLE_MSG)
  process.exitCode = 1
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
    .description('Termékek listája marginnal és árállapottal (agent endpoint, bolt token)')
    .option('--losing', 'Csak veszteséges termékek (marzs < 0)')
    .option('--cats <nevek>', 'Szűrés beszállítónévre — vesszővel elválasztott részsztringek, pl. "auto,kert"')
    .action(async (opts: { losing?: boolean; cats?: string }) => {
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
