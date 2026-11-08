/**
 * CLI commands — P2P partner meghívók (peer invites).
 *
 * Domain: peers
 * Subcommands:
 *   haszno peers invite --supplier <id> --expires <datetime>   create invite
 *   haszno peers list                                          list own invites
 *   haszno peers accept <code> --acceptor <shopId> [--yes]    accept an invite
 */
import { Command } from 'commander'
import type { HasznoClient, PeerInvite } from '../client/index.js'

function isJsonMode(cmd: Command): boolean {
  let p: Command | null = cmd
  while (p) {
    const opts = p.opts<{ json?: boolean }>()
    if (opts.json) return true
    p = p.parent
  }
  return false
}

function printInvitesTable(invites: PeerInvite[]): void {
  if (invites.length === 0) {
    console.log('Nincs meghívó.')
    return
  }
  const headers = ['Kód', 'Szállító ID', 'Lejár', 'Elfogadta', 'Visszavonva']
  const rows = invites.map((inv) => [
    inv.code,
    String(inv.supplierId),
    new Date(inv.expiresAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' }),
    inv.acceptedBy ?? '-',
    inv.revokedAt ? 'igen' : '-',
  ])
  const all = [headers, ...rows]
  const widths = headers.map((_, ci) => Math.max(...all.map((r) => r[ci].length)))
  const sep = widths.map((w) => '-'.repeat(w)).join('-+-')
  const fmtRow = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join(' | ')
  console.log(fmtRow(headers))
  console.log(sep)
  for (const row of rows) console.log(fmtRow(row))
}

export function registerPeersCommands(program: Command, client: HasznoClient): void {
  const peers = program
    .command('peers')
    .description('P2P partner meghívók kezelése')

  peers
    .command('invite')
    .description('Meghívó kód létrehozása egy szállítóhoz')
    .requiredOption('--supplier <id>', 'Szállító azonosítója', (v) => parseInt(v, 10))
    .requiredOption('--expires <datetime>', 'Lejárati idő ISO-8601-ben, pl. "2026-12-31T23:59:00Z"')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts, cmd) => {
      try {
        if (!opts.yes) {
          console.log(`Meghívó létrehozása: szállító #${opts.supplier}, lejár: ${opts.expires}.`)
          console.log('Add meg a --yes kapcsolót a megerősítéshez.')
          process.exit(1)
          return
        }

        const invite = await client.peers.createInvite({
          supplierId: opts.supplier,
          expiresAt: opts.expires,
        })
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(invite))
        } else {
          console.log(`\nMeghívó létrehozva:`)
          console.log(`  Kód:       ${invite.code}`)
          console.log(`  Szállító:  #${invite.supplierId}`)
          console.log(`  Lejár:     ${new Date(invite.expiresAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}`)
          console.log(`\nAdd át a kódot a partnernek: haszno peers accept ${invite.code} --acceptor <bolt_azonosito> --yes`)
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })

  peers
    .command('list')
    .description('Saját meghívók listázása')
    .action(async (_opts, cmd) => {
      try {
        const invites = await client.peers.listInvites()
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(invites))
        } else {
          console.log(`\nMeghívók: ${invites.length}\n`)
          printInvitesTable(invites)
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })

  peers
    .command('accept <code>')
    .description('Partner meghívó elfogadása')
    .requiredOption('--acceptor <shop>', 'Az elfogadó bolt/tenant azonosítója')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (code: string, opts, cmd: Command) => {
      try {
        if (!opts.yes) {
          console.log(`Elfogadás: "${code}" kód, "${opts.acceptor}" nevében.`)
          console.log('Add meg a --yes kapcsolót a megerősítéshez.')
          process.exit(0)
          return
        }

        const link = await client.peers.acceptInvite(code, { acceptorId: opts.acceptor })
        if (isJsonMode(cmd)) {
          console.log(JSON.stringify(link))
        } else {
          console.log(`\nSikeres partnerkapcsolat!`)
          console.log(`  Link ID:   ${link.id}`)
          console.log(`  Szállító:  #${link.supplierId}`)
          console.log(`  Partner:   ${link.partner}`)
        }
      } catch (e) {
        console.error('Hiba:', e instanceof Error ? e.message : String(e))
        process.exit(1)
      }
    })
}
