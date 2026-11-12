/**
 * CLI commands — proposals (price proposals).
 *
 * Domain: proposals
 * Subcommands:
 *   haszno proposals list [--status <s>]        list proposals (default: pending)
 *   haszno proposals show <id>                  show one proposal
 *   haszno proposals approve [--ids <ids>]      approve proposals (--yes required)
 *   haszno proposals reject --ids <ids>         reject proposals (--yes required)
 *   haszno proposals rollback --batch <batchId> roll back a batch (--yes required)
 *
 * Writes need --yes; without it the command explains what would happen and exits 0.
 * Exit codes: 0 = ok, 1 = API/runtime error, 2 = usage error.
 */
import { randomUUID } from 'node:crypto'
import { Command } from 'commander'
import type { HasznoClient, Proposal, ProposalStatus, ApproveResult, RollbackResult, AgentProposalResult } from '../client/index.js'
import { ShopTokenNotSupportedError } from '../client/index.js'

// ── helpers ──────────────────────────────────────────────────────────────────

function isJsonMode(cmd: Command): boolean {
  // Walk up to root to find the --json flag.
  let c: Command = cmd
  while (c.parent) c = c.parent
  return !!(c.opts<{ json?: boolean }>().json)
}

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function fmtPrice(n: number): string {
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Ft'
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('hu-HU')
}

function statusLabel(s: ProposalStatus): string {
  switch (s) {
    case 'pending': return 'pending'
    case 'approved': return 'approved'
    case 'rejected': return 'rejected'
    case 'rolled_back': return 'rolled_back'
    default: return s
  }
}

function printProposalTable(rows: Proposal[]): void {
  if (rows.length === 0) {
    process.stdout.write('Nincs találat.\n')
    return
  }
  const idW = 6
  const skuW = Math.min(20, Math.max(4, ...rows.map(r => (r.productSku ?? '—').length)))
  const nameW = Math.min(28, Math.max(6, ...rows.map(r => (r.productName ?? '—').length)))
  const oldW = 12
  const newW = 12
  const srcW = 10
  const statusW = 11
  const dateW = 12

  function padR(s: string, w: number): string {
    const t = s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length)
    return t
  }
  function padL(s: string, w: number): string {
    return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s
  }

  const header =
    padL('ID', idW) + '  ' +
    padR('SKU', skuW) + '  ' +
    padR('Termék', nameW) + '  ' +
    padL('Régi ár', oldW) + '  ' +
    padL('Új ár', newW) + '  ' +
    padR('Forrás', srcW) + '  ' +
    padR('Állapot', statusW) + '  ' +
    padR('Dátum', dateW)

  process.stdout.write(header + '\n' + '-'.repeat(header.length) + '\n')

  for (const r of rows) {
    const line =
      padL(String(r.id), idW) + '  ' +
      padR(r.productSku ?? '—', skuW) + '  ' +
      padR(r.productName ?? '—', nameW) + '  ' +
      padL(fmtPrice(r.oldPriceGross), oldW) + '  ' +
      padL(fmtPrice(r.proposedPriceGross), newW) + '  ' +
      padR(r.source, srcW) + '  ' +
      padR(statusLabel(r.status), statusW) + '  ' +
      padR(fmtDate(r.createdAt), dateW)
    process.stdout.write(line + '\n')
  }
}

function parseIds(raw: string): number[] {
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const n = Number(s)
      if (!Number.isInteger(n) || n <= 0) throw new Error(`Érvénytelen ID: "${s}"`)
      return n
    })
}

function die(msg: string, code = 1): never {
  process.stderr.write(`Hiba: ${msg}\n`)
  process.exit(code)
}

// ── register ─────────────────────────────────────────────────────────────────

export function registerProposalsCommands(program: Command, client: HasznoClient): void {
  const proposals = program
    .command('proposals')
    .description('Árazási javaslatok kezelése (price proposals)')

  // ── proposals list ──────────────────────────────────────────────────────
  proposals
    .command('list')
    .description('Javaslatok listázása állapot szerint (alapértelmezett: pending)')
    .option(
      '-s, --status <status>',
      'Szűrés állapotra: pending | approved | rejected | rolled_back',
      'pending',
    )
    .action(async (opts: { status: string }, cmd: Command) => {
      const allowedStatuses: ProposalStatus[] = ['pending', 'approved', 'rejected', 'rolled_back']
      if (!allowedStatuses.includes(opts.status as ProposalStatus)) {
        die(
          `Érvénytelen állapot: "${opts.status}". Lehetséges értékek: ${allowedStatuses.join(', ')}`,
          2,
        )
      }

      let rows: Proposal[]
      try {
        rows = await client.proposals.list({ status: opts.status as ProposalStatus })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rows)
      } else {
        printProposalTable(rows)
        process.stdout.write(`\nÖsszesen: ${rows.length} javaslat\n`)
      }
    })

  // ── proposals show ──────────────────────────────────────────────────────
  proposals
    .command('show <id>')
    .description('Egy javaslat részletei ID alapján')
    .action(async (idStr: string, _opts: unknown, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) die(`Érvénytelen ID: "${idStr}"`, 2)

      let row: Proposal | undefined
      try {
        // API has no single-proposal endpoint; search across all statuses.
        const all = await Promise.all([
          client.proposals.list({ status: 'pending' }),
          client.proposals.list({ status: 'approved' }),
          client.proposals.list({ status: 'rejected' }),
          client.proposals.list({ status: 'rolled_back' }),
        ])
        row = all.flat().find(r => r.id === id)
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (!row) die(`Nem található javaslat ID=${id}`, 1)

      if (isJsonMode(cmd)) {
        printJson(row)
      } else {
        process.stdout.write(
          `ID:          ${row.id}\n` +
          `Termék:      ${row.productName ?? '—'} (ID: ${row.productId})\n` +
          `SKU:         ${row.productSku ?? '—'}\n` +
          `Régi ár:     ${fmtPrice(row.oldPriceGross)}\n` +
          `Javasolt ár: ${fmtPrice(row.proposedPriceGross)}\n` +
          `Ok:          ${row.reason}\n` +
          `Forrás:      ${row.source}\n` +
          `Állapot:     ${statusLabel(row.status)}\n` +
          `Batch ID:    ${row.batchId ?? '—'}\n` +
          `Létrehozva:  ${fmtDate(row.createdAt)}\n` +
          `Eldöntve:    ${fmtDate(row.decidedAt)}\n`,
        )
      }
    })

  // ── proposals approve ───────────────────────────────────────────────────
  proposals
    .command('approve')
    .description(
      'Javaslatok jóváhagyása. --ids nélkül az összes pending javaslat jóváhagyódik.',
    )
    .option('--ids <ids>', 'Vesszővel elválasztott ID-k (pl. 1,2,3); ha nincs: az összes pending')
    .option('--yes', 'Megerősítés kihagyása (kötelező automatizáláshoz)')
    .action(async (opts: { ids?: string; yes?: boolean }, cmd: Command) => {
      let ids: number[] | undefined
      if (opts.ids) {
        try {
          ids = parseIds(opts.ids)
        } catch (err) {
          die(err instanceof Error ? err.message : String(err), 2)
        }
      }

      if (!opts.yes) {
        const target = ids ? `ID: ${ids.join(', ')}` : 'az összes függő javaslat'
        process.stdout.write(
          `[DRY-RUN] Jóváhagyásra kerülne: ${target}.\n` +
            `Futtatás végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: ApproveResult
      try {
        result = await client.proposals.approve(ids ? { ids } : {})
      } catch (err) {
        if (err instanceof ShopTokenNotSupportedError) die(err.message, 1)
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(
          `Jóváhagyva: ${result.applied} javaslat` +
            (result.batchId ? ` (batch: ${result.batchId})` : '') +
            '\n',
        )
      }
    })

  // ── proposals reject ────────────────────────────────────────────────────
  proposals
    .command('reject')
    .description('Javaslatok elutasítása (kötelező: --ids)')
    .requiredOption('--ids <ids>', 'Vesszővel elválasztott ID-k (pl. 1,2,3)')
    .option('--yes', 'Megerősítés kihagyása (kötelező automatizáláshoz)')
    .action(async (opts: { ids: string; yes?: boolean }, cmd: Command) => {
      let ids: number[]
      try {
        ids = parseIds(opts.ids)
      } catch (err) {
        die(err instanceof Error ? err.message : String(err), 2)
      }

      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Elutasításra kerülne: ID ${ids.join(', ')}.\n` +
            `Futtatás végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: { rejected: number }
      try {
        result = await client.proposals.reject({ ids })
      } catch (err) {
        if (err instanceof ShopTokenNotSupportedError) die(err.message, 1)
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(`Elutasítva: ${result.rejected} javaslat\n`)
      }
    })

  // ── proposals rollback ──────────────────────────────────────────────────
  proposals
    .command('rollback')
    .description('Egy jóváhagyott batch visszagörgetése')
    .requiredOption('--batch <batchId>', 'A visszagörgetendő batch ID (approve adja vissza)')
    .option('--yes', 'Megerősítés kihagyása (kötelező automatizáláshoz)')
    .action(async (opts: { batch: string; yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Visszagörgetésre kerülne: batch "${opts.batch}".\n` +
            `Futtatás végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: RollbackResult
      try {
        result = await client.proposals.rollback({ batchId: opts.batch })
      } catch (err) {
        if (err instanceof ShopTokenNotSupportedError) die(err.message, 1)
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(`Visszagörgetett javaslatok: ${result.rolledBack}\n`)
      }
    })

  // ── proposals propose ───────────────────────────────────────────────────
  proposals
    .command('propose')
    .description(
      'Árjavaslat beküldése bolt API-tokennel (shop token) — emberi jóváhagyást igényel.\n' +
        'Csak "haszno_" előtagú tokennel (HASZNO_API_TOKEN vagy --api-key) működik.',
    )
    .requiredOption('--product-id <id>', 'A termék azonosítója (integer)')
    .requiredOption('--price <gross>', 'Javasolt bruttó ár egész forintban')
    .requiredOption('--reason <text>', 'Szöveges indoklás (1–500 karakter) a bolt tulajdonosának')
    .action(async (opts: { productId: string; price: string; reason: string }, cmd: Command) => {
      const productId = Number(opts.productId)
      if (!Number.isInteger(productId) || productId <= 0) die(`Érvénytelen termék ID: "${opts.productId}"`, 2)

      const price = Number(opts.price)
      if (!Number.isInteger(price) || price <= 0) die(`Érvénytelen ár: "${opts.price}"`, 2)

      if (!opts.reason.trim() || opts.reason.length > 500) die('Az indoklás 1–500 karakter lehet.', 2)

      // Generate nonce once; reused on transport retries.
      const nonce = randomUUID()

      let result: AgentProposalResult
      try {
        result = await client.proposals.propose({
          productId,
          proposedPriceGross: price,
          reason: opts.reason.trim(),
          nonce,
        })
      } catch (err) {
        if (err instanceof ShopTokenNotSupportedError) die(err.message, 1)
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(
          `Javaslat beküldve (ID: ${result.id}, állapot: ${result.status}).\n` +
            'Az ár nem változott — a bolt tulajdonosának jóvá kell hagynia a Haszno webalkalmazásban.\n',
        )
      }
    })
}
