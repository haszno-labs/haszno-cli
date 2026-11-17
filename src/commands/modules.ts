/**
 * CLI commands — Modulok (workspace module subscriptions).
 *
 * Domain: modules
 * Subcommands:
 *   haszno modules list              list module prices (public, no auth required)
 *   haszno modules status            list active/pending modules for this shop
 *   haszno modules enable <moduleId> start activation (billable: returns checkout URL)
 *   haszno modules cancel <moduleId> cancel an active subscription
 *   haszno modules resume <moduleId> resume a cancelled subscription
 *
 * Valid moduleId values:
 *   webshop, dropshipping_supplier, fitness, booking_salon,
 *   booking_clinic, booking_other, restaurant
 */
import type { Command } from 'commander'
import type { HasznoClient, ModulePrice, ModuleSubscription } from '../client/index.js'

const MODULE_IDS = [
  'webshop',
  'dropshipping_supplier',
  'fitness',
  'booking_salon',
  'booking_clinic',
  'booking_other',
  'restaurant',
] as const

function isJsonMode(cmd: Command): boolean {
  let p: Command | null = cmd
  while (p) {
    const opts = p.opts<{ json?: boolean }>()
    if (opts.json) return true
    p = p.parent
  }
  return false
}

function printPricesTable(modules: ModulePrice[]): void {
  const headers = ['Modul', 'Havi ár (HUF)', 'Számlázott']
  const rows = modules.map((m) => [
    m.moduleId,
    m.priceHuf === 0 ? 'ingyenes' : m.priceHuf.toLocaleString('hu-HU'),
    m.billable ? 'igen' : 'nem',
  ])
  const all = [headers, ...rows]
  const widths = headers.map((_, ci) => Math.max(...all.map((r) => (r[ci] ?? '').length)))
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-')
  const fmtRow = (r: string[]) => r.map((c, i) => (c ?? '').padEnd(widths[i])).join(' | ')
  console.log(fmtRow(headers))
  console.log(sep)
  for (const row of rows) console.log(fmtRow(row))
}

function printSubscriptionsTable(subs: ModuleSubscription[]): void {
  if (subs.length === 0) {
    console.log('Nincs aktív modul.')
    return
  }
  const headers = ['Modul', 'Állapot', 'Aktiválva', 'Lejár']
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('hu-HU', { timeZone: 'Europe/Budapest' }) : '-'
  const rows = subs.map((s) => [s.moduleId, s.status, fmt(s.activatedAt), fmt(s.expiresAt)])
  const all = [headers, ...rows]
  const widths = headers.map((_, ci) => Math.max(...all.map((r) => (r[ci] ?? '').length)))
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-')
  const fmtRow = (r: string[]) => r.map((c, i) => (c ?? '').padEnd(widths[i])).join(' | ')
  console.log(fmtRow(headers))
  console.log(sep)
  for (const row of rows) console.log(fmtRow(row))
}

export function registerModulesCommands(program: Command, client: HasznoClient): void {
  const modules = program
    .command('modules')
    .description('Workspace modulok kezelése')

  // ── haszno modules list ─────────────────────────────────────────────────────

  modules
    .command('list')
    .description('Modulok ára és elérhetősége (nyilvános)')
    .action(async (_opts, cmd) => {
      try {
        const result = await client.modules.listPrices()
        if (isJsonMode(cmd)) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        } else {
          console.log(`Számlázási időszak: ${result.periodDays} nap | Pénznem: ${result.currency}\n`)
          printPricesTable(result.modules)
        }
      } catch (err) {
        console.error(`Hiba: ${err instanceof Error ? err.message : String(err)}`)
        process.exitCode = 1
      }
    })

  // ── haszno modules status ───────────────────────────────────────────────────

  modules
    .command('status')
    .description('Az aktuális bolt moduljainak listája (bejelentkezés szükséges)')
    .action(async (_opts, cmd) => {
      try {
        const result = await client.modules.listMy()
        if (isJsonMode(cmd)) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        } else {
          console.log(`Tulajdonos: ${result.isOwner ? 'igen' : 'nem'}\n`)
          printSubscriptionsTable(result.modules)
        }
      } catch (err) {
        console.error(`Hiba: ${err instanceof Error ? err.message : String(err)}`)
        process.exitCode = 1
      }
    })

  // ── haszno modules enable <moduleId> ───────────────────────────────────────

  modules
    .command('enable <moduleId>')
    .description('Modul aktiválása (számlázott modul esetén SimplePay fizetési linket ad vissza)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (moduleId: string, opts: { yes?: boolean }, cmd) => {
      if (!MODULE_IDS.includes(moduleId as (typeof MODULE_IDS)[number])) {
        console.error(`Ismeretlen modul: "${moduleId}". Érvényes értékek: ${MODULE_IDS.join(', ')}`)
        process.exitCode = 1
        return
      }
      if (!opts.yes) {
        console.log(`Modul aktiválása: ${moduleId}`)
        console.log('Add meg a --yes kapcsolót a megerősítéshez.')
        process.exitCode = 1
        return
      }
      try {
        const result = await client.modules.activate(moduleId)
        if (isJsonMode(cmd)) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        } else if (result.checkoutUrl) {
          console.log(`Modul: ${moduleId}`)
          console.log(`Állapot: ${result.status}`)
          console.log(`\nFizetési link:\n  ${result.checkoutUrl}`)
          console.log('\nNyisd meg a linket a böngészőben a fizetés befejezéséhez.')
          console.log('A modul csak a sikeres fizetés után aktív.')
        } else {
          console.log(`Modul aktiválva: ${moduleId} (állapot: ${result.status})`)
        }
      } catch (err) {
        console.error(`Hiba: ${err instanceof Error ? err.message : String(err)}`)
        process.exitCode = 1
      }
    })

  // ── haszno modules cancel <moduleId> ───────────────────────────────────────

  modules
    .command('cancel <moduleId>')
    .description('Modul előfizetés lemondása (az időszak végéig aktív marad)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (moduleId: string, opts: { yes?: boolean }, cmd) => {
      if (!MODULE_IDS.includes(moduleId as (typeof MODULE_IDS)[number])) {
        console.error(`Ismeretlen modul: "${moduleId}". Érvényes értékek: ${MODULE_IDS.join(', ')}`)
        process.exitCode = 1
        return
      }
      if (!opts.yes) {
        console.log(`Modul lemondása: ${moduleId}. Add meg a --yes kapcsolót a megerősítéshez.`)
        process.exitCode = 1
        return
      }
      try {
        const result = await client.modules.cancel(moduleId)
        if (isJsonMode(cmd)) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        } else {
          console.log(`Modul lemondva: ${result.moduleId} (állapot: ${result.status})`)
          console.log('A modul az előfizetési időszak végéig aktív marad.')
        }
      } catch (err) {
        console.error(`Hiba: ${err instanceof Error ? err.message : String(err)}`)
        process.exitCode = 1
      }
    })

  // ── haszno modules resume <moduleId> ───────────────────────────────────────

  modules
    .command('resume <moduleId>')
    .description('Lemondott modul újraindítása (csak akkor, ha az időszak még nem járt le)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (moduleId: string, opts: { yes?: boolean }, cmd) => {
      if (!MODULE_IDS.includes(moduleId as (typeof MODULE_IDS)[number])) {
        console.error(`Ismeretlen modul: "${moduleId}". Érvényes értékek: ${MODULE_IDS.join(', ')}`)
        process.exitCode = 1
        return
      }
      if (!opts.yes) {
        console.log(`Modul újraindítása: ${moduleId}. Add meg a --yes kapcsolót a megerősítéshez.`)
        process.exitCode = 1
        return
      }
      try {
        const result = await client.modules.resume(moduleId)
        if (isJsonMode(cmd)) {
          process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        } else {
          console.log(`Modul újraindítva: ${result.moduleId} (állapot: ${result.status})`)
        }
      } catch (err) {
        console.error(`Hiba: ${err instanceof Error ? err.message : String(err)}`)
        process.exitCode = 1
      }
    })
}
