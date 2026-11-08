/**
 * CLI commands — katalógus böngésző + import lista + bolt-bekötések.
 *
 * Domain: catalogue, import, connections
 * Subcommands:
 *   haszno catalogue search [--q <text>] [--cats <keys>] [--partner <id>]
 *                            [--min-margin <pct>] [--in-stock] [--sort <order>]
 *                            [--page <n>] [--page-size <n>]
 *
 *   haszno import list [--status <s>] [--partner <id>] [--q <text>]
 *   haszno import add <id> [<id>...]
 *   haszno import push --ids <ids> [--target <connectionId>] [--yes]
 *
 *   haszno connections list [--status <s>]
 */
import { Command } from 'commander'
import type {
  HasznoClient,
  CatalogueItem,
  ImportListItem,
  StoreConnection,
  ConnectStorePushResult,
} from '../client/index.js'

// ---- helpers ----------------------------------------------------------------

function isJsonMode(cmd: Command): boolean {
  let p: Command | null = cmd
  while (p) {
    const opts = p.opts<{ json?: boolean }>()
    if (opts.json) return true
    p = p.parent
  }
  return false
}

function fmtFt(n: number | null | undefined): string {
  if (n == null) return 'n/a'
  return `${Math.round(n).toLocaleString('hu-HU')} Ft`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return 'n/a'
  return `${n.toFixed(1)}%`
}

function pushStatusLabel(s: ImportListItem['pushStatus']): string {
  switch (s) {
    case 'varakozik': return 'várakozik'
    case 'kuldve': return 'küldve'
    case 'kesz': return 'kész'
    case 'hiba': return 'hiba'
    default: return s
  }
}

function connStatusLabel(s: StoreConnection['status']): string {
  switch (s) {
    case 'uj': return 'új'
    case 'domain_ok': return 'domain OK'
    case 'kapcsolva': return 'kapcsolva'
    case 'hiba': return 'hiba'
    default: return s
  }
}

function printTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    console.log('Nincs találat.')
    return
  }
  const all = [headers, ...rows]
  const widths = headers.map((_, ci) => Math.max(...all.map((r) => (r[ci] ?? '').length)))
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-')
  const fmtRow = (r: string[]) => r.map((c, i) => (c ?? '').padEnd(widths[i])).join(' | ')
  console.log(fmtRow(headers))
  console.log(sep)
  for (const row of rows) console.log(fmtRow(row))
}

function printCatalogueTable(items: CatalogueItem[]): void {
  printTable(
    ['ID', 'Név', 'Partner', 'Kategória', 'Nagyker', 'RRP', 'Margin%', 'Készlet'],
    items.map((i) => [
      String(i.id),
      i.name.slice(0, 40),
      i.partnerName.slice(0, 20),
      i.category ?? '-',
      fmtFt(i.wholesaleNet),
      fmtFt(i.rrpGross),
      fmtPct(i.marginPct),
      String(i.stock),
    ]),
  )
}

function printImportListTable(items: ImportListItem[]): void {
  printTable(
    ['ID', 'SKU', 'Név', 'Partner', 'RRP', 'Állapot'],
    items.map((i) => [
      String(i.id),
      i.sku,
      i.name.slice(0, 36),
      i.partnerName.slice(0, 18),
      fmtFt(i.rrpGross),
      pushStatusLabel(i.pushStatus),
    ]),
  )
}

function printConnectionsTable(conns: StoreConnection[]): void {
  printTable(
    ['ID', 'Neve', 'Platform', 'Domain', 'Állapot', 'Utolsó szink.'],
    conns.map((c) => [
      String(c.id),
      c.name.slice(0, 24),
      c.platform,
      c.domain ?? '-',
      connStatusLabel(c.status),
      c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }) : '-',
    ]),
  )
}

// ---- catalogue commands -----------------------------------------------------

export function registerCatalogueCommands(program: Command, client: HasznoClient): void {
  const catalogue = program
    .command('catalogue')
    .description('Partnerkatekógus böngésző')

  catalogue
    .command('search')
    .description('Termékek keresése a partnerkatekógusban')
    .option('--q <szöveg>', 'Szabad-szöveges keresés (név vagy kategória)')
    .option('--cats <kulcsok>', 'Kategória-kulcsok vesszővel elválasztva, pl. "elektronika,ruházat"')
    .option('--partner <id>', 'Szállító/partner azonosítója', (v) => parseInt(v, 10))
    .option('--min-margin <pct>', 'Minimum haszonkulcs %-ban, pl. 15', (v) => parseFloat(v))
    .option('--max-price <ft>', 'Maximum RRP bruttó ár forintban', (v) => parseInt(v, 10))
    .option('--min-price <ft>', 'Minimum RRP bruttó ár forintban', (v) => parseInt(v, 10))
    .option('--in-stock', 'Csak készleten lévő termékek')
    .option('--country <kód>', 'Szállító ország kódja, pl. HU, DE')
    .option('--sort <rendezés>', 'Rendezés: margin_desc, price_asc, price_desc, name_asc', 'name_asc')
    .option('--page <n>', 'Oldalszám (1-tól)', (v) => parseInt(v, 10), 1)
    .option('--page-size <n>', 'Oldalméret, max 100 (alapértelmezett 24)', (v) => parseInt(v, 10), 24)
    .action(async (opts, cmd) => {
      try {
        const result = await client.catalogue.search({
          q: opts.q,
          cats: opts.cats,
          partner: opts.partner,
          minMarginPct: opts.minMargin,
          maxPrice: opts.maxPrice,
          minPrice: opts.minPrice,
          inStock: opts.inStock ?? false,
          country: opts.country,
          sort: opts.sort,
          page: opts.page,
          pageSize: opts.pageSize,
        })
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(result))
        } else {
          console.log(`\nTalálatok: ${result.total} termék (${result.items.length} megjelenítve)\n`)
          printCatalogueTable(result.items)
          if (result.total > result.items.length) {
            const pageSize = opts.pageSize ?? 24
            console.log(`\n... tovább: --page ${(opts.page ?? 1) + 1} (összesen ${Math.ceil(result.total / pageSize)} oldal)`)
          }
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })

  // ---- import subcommands ---------------------------------------------------

  const importCmd = program
    .command('import')
    .description('Import lista kezelése')

  importCmd
    .command('list')
    .description('Import lista megjelenítése')
    .option('--status <állapot>', 'Szűrés állapotra: varakozik, kuldve, kesz, hiba')
    .option('--partner <id>', 'Szűrés szállítóra', (v) => parseInt(v, 10))
    .option('--q <szöveg>', 'Szabad-szöveges keresés')
    .action(async (opts, cmd) => {
      try {
        const items = await client.importList.list({
          status: opts.status,
          partner: opts.partner,
          q: opts.q,
        })
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(items))
        } else {
          console.log(`\nImport lista: ${items.length} tétel\n`)
          printImportListTable(items)
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })

  importCmd
    .command('add <ids...>')
    .description('Termékek hozzáadása az import listához katalógus-termék azonosítók alapján')
    .action(async (rawIds: string[], _opts, cmd: Command) => {
      try {
        const networkProductIds = rawIds.map((id) => {
          const n = parseInt(id, 10)
          if (isNaN(n) || n < 1) throw new Error(`Érvénytelen ID: ${id}`)
          return n
        })
        const result = await client.importList.add({ networkProductIds })
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(result))
        } else {
          console.log(`Hozzáadva: ${result.added} termék, kihagyva (már listán): ${result.skipped}`)
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })

  importCmd
    .command('push')
    .description('Import listás termékek kiküldése a bekötött webshopba')
    .requiredOption('--ids <azonosítók>', 'Import lista tétel azonosítói vesszővel, pl. "1,2,3"')
    .option('--target <connectionId>', 'Célbolt kapcsolat azonosítója (haszno connections list)', (v) => parseInt(v, 10))
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts, cmd) => {
      try {
        const ids = (opts.ids as string).split(',').map((s) => {
          const n = parseInt(s.trim(), 10)
          if (isNaN(n)) throw new Error(`Érvénytelen ID: ${s}`)
          return n
        })

        if (!opts.yes) {
          const targetStr = opts.target ? ` → kapcsolat #${opts.target}` : ''
          console.log(`Kiküldés: ${ids.length} termék${targetStr}.`)
          console.log('Add meg a --yes kapcsolót a megerősítéshez.')
          process.exit(0)
          return
        }

        if (opts.target != null) {
          // Connected-store path → POST /api/connect/stores/:id/push → {pushed, failed, errors}
          const result = await client.importList.push({ ids, targetConnectionId: opts.target })
          if (isJsonMode(cmd)) {
            console.log(JSON.stringify(result))
          } else {
            console.log(`Kiküldve: ${result.pushed}, sikertelen: ${result.failed}`)
            if (result.errors && result.errors.length > 0) {
              for (const err of result.errors) console.error(`  - ${err}`)
            }
          }
        } else {
          // Import-list path → POST /api/import-list/push → {pushed} only
          const result = await client.importList.push({ ids })
          if (isJsonMode(cmd)) {
            console.log(JSON.stringify(result))
          } else {
            console.log(`Kiküldve: ${result.pushed}`)
          }
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })

  // ---- connections subcommand -----------------------------------------------

  const connections = program
    .command('connections')
    .description('Bekötött webshop kapcsolatok')

  connections
    .command('list')
    .description('Bekötött webshopok listázása')
    .option('--status <állapot>', 'Szűrés állapotra: uj, domain_ok, kapcsolva, hiba')
    .action(async (opts, cmd) => {
      try {
        let conns = await client.connections.list()
        if (opts.status) {
          conns = conns.filter((c) => c.status === opts.status)
        }
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(conns))
        } else {
          console.log(`\nBekötött boltok: ${conns.length}\n`)
          printConnectionsTable(conns)
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })
}
