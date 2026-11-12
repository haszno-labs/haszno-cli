/**
 * CLI commands — proposals (price proposals via agent endpoint).
 *
 * Domain: proposals
 * Subcommands:
 *   haszno proposals list              list pending proposals (agent endpoint, read-only)
 *   haszno proposals show <id>         show one pending proposal (agent endpoint)
 *   haszno proposals create            create a pending proposal (agent endpoint, write)
 *   haszno proposals approve           NOT AVAILABLE with shop token
 *   haszno proposals reject            NOT AVAILABLE with shop token
 *   haszno proposals rollback          NOT AVAILABLE with shop token
 *
 * Uses GET /api/agent/proposals (AgentProposal[] — pending only).
 * Fields available: id, productId, productName, productSku, oldPriceGross,
 *   proposedPriceGross, reason, status, createdAt
 * Fields NOT available via shop token: source, batchId, decidedAt
 *
 * Create uses POST /api/agent/proposals with an auto-generated nonce (crypto.randomUUID()).
 * Approve/reject/rollback: human-only, return clear "not available" message.
 *
 * Exit codes: 0 = ok, 1 = API/runtime error, 2 = usage error.
 */
import { randomUUID } from 'node:crypto'
import { Command } from 'commander'
import type { HasznoClient, AgentProposal, CreateProposalResult } from '../client/index.js'
import { HasznoApiError } from '../client/index.js'

// ── constants ─────────────────────────────────────────────────────────────────

const NOT_AVAILABLE_MSG =
  'Nem elérhető bolt API-kulccsal. A jóváhagyás/elutasítás/visszagörgetés ' +
  'emberi döntést igényel — használd a Haszno webes felületet (Árazás → Javaslatok).\n' +
  'Ez szándékos: a bolt token csak PENDING javaslatot tud létrehozni.'

// ── helpers ──────────────────────────────────────────────────────────────────

function isJsonMode(cmd: Command): boolean {
  let c: Command = cmd
  while (c.parent) c = c.parent
  return !!(c.opts<{ json?: boolean }>().json)
}

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function fmtPrice(n: number): string {
  // Replace non-breaking space ( ) used as thousands separator in hu-HU locale
  // with a regular space for consistent output across environments.
  return n.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .replace(/ /g, ' ') + ' Ft'
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('hu-HU')
}

function printProposalTable(rows: AgentProposal[]): void {
  if (rows.length === 0) {
    process.stdout.write('Nincs találat.\n')
    return
  }
  const idW = 6
  const skuW = Math.min(20, Math.max(4, ...rows.map(r => (r.productSku ?? '—').length)))
  const nameW = Math.min(28, Math.max(6, ...rows.map(r => (r.productName ?? '—').length)))
  const oldW = 12
  const newW = 12
  const dateW = 12

  function padR(s: string, w: number): string {
    return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length)
  }
  function padL(s: string, w: number): string {
    return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s
  }

  const header =
    padL('ID', idW) + '  ' +
    padR('SKU', skuW) + '  ' +
    padR('Termék', nameW) + '  ' +
    padL('Régi ár', oldW) + '  ' +
    padL('Javasolt', newW) + '  ' +
    padR('Dátum', dateW)

  process.stdout.write(header + '\n' + '-'.repeat(header.length) + '\n')

  for (const r of rows) {
    const line =
      padL(String(r.id), idW) + '  ' +
      padR(r.productSku ?? '—', skuW) + '  ' +
      padR(r.productName ?? '—', nameW) + '  ' +
      padL(fmtPrice(r.oldPriceGross), oldW) + '  ' +
      padL(fmtPrice(r.proposedPriceGross), newW) + '  ' +
      padR(fmtDate(r.createdAt), dateW)
    process.stdout.write(line + '\n')
  }
}

function handleApiError(err: unknown): void {
  if (err instanceof HasznoApiError) {
    switch (err.status) {
      case 401:
        console.error('Hiba: Érvénytelen, lejárt vagy visszavont API-kulcs. Hozz létre újat: Haszno → Integráció → API-kulcsok.')
        break
      case 403:
        console.error('Hiba: A bolt token nem jogosult erre a műveletre. Ellenőrizd a token hatáskörét.')
        break
      case 404:
        console.error('Hiba: A termék nem található a boltban. Csak saját termékazonosítóra lehet javaslatot tenni.')
        break
      case 409:
        console.error('Hiba: Duplikált nonce — ez a javaslat már létezik. Az újra-futtatás automatikusan új nonce-t generál.')
        break
      case 429:
        console.error('Hiba: Túl sok sikertelen kísérlet. Várj néhány percet.')
        break
      default:
        console.error(`API hiba (${err.status}): ${err.message}`)
    }
  } else {
    console.error('Váratlan hiba:', err instanceof Error ? err.message : String(err))
  }
  process.exit(1)
}

function die(msg: string, code = 1): void {
  process.stderr.write(`Hiba: ${msg}\n`)
  process.exit(code)
}

// ── register ─────────────────────────────────────────────────────────────────

export function registerProposalsCommands(program: Command, client: HasznoClient): void {
  const proposals = program
    .command('proposals')
    .description('Árazási javaslatok kezelése (agent endpoint, bolt token)')

  // ── proposals list ──────────────────────────────────────────────────────
  proposals
    .command('list')
    .description('Függő (pending) javaslatok listázása')
    .action(async (_opts: unknown, cmd: Command) => {
      let rows: AgentProposal[]
      try {
        rows = await client.agent.proposals()
      } catch (err) {
        handleApiError(err)
        return
      }

      if (isJsonMode(cmd)) {
        printJson(rows)
      } else {
        printProposalTable(rows)
        process.stdout.write(`\nÖsszesen: ${rows.length} függő javaslat\n`)
        if (rows.length > 0) {
          process.stdout.write('(Jóváhagyáshoz: Haszno webes felület → Árazás → Javaslatok)\n')
        }
      }
    })

  // ── proposals show ──────────────────────────────────────────────────────
  proposals
    .command('show <id>')
    .description('Egy függő javaslat részletei ID alapján')
    .action(async (idStr: string, _opts: unknown, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) { die(`Érvénytelen ID: "${idStr}"`, 2); return }

      let rows: AgentProposal[]
      try {
        rows = await client.agent.proposals()
      } catch (err) {
        handleApiError(err)
        return
      }

      const row = rows.find(r => r.id === id)
      if (!row) { die(`Nem található függő javaslat ID=${id}. Csak pending javaslatok elérhetők bolt tokennel.`, 1); return }

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
          `Állapot:     ${row.status}\n` +
          `Létrehozva:  ${fmtDate(row.createdAt)}\n`,
        )
      }
    })

  // ── proposals create ────────────────────────────────────────────────────
  proposals
    .command('create')
    .description('Új árazási javaslat létrehozása (pending — jóváhagyás a webes felületen)')
    .requiredOption('--product-id <id>', 'Termék ID (egész szám)')
    .requiredOption('--price <ft>', 'Javasolt bruttó ár (egész Ft)')
    .requiredOption('--reason <szoveg>', 'Az árazás indoklása (1–500 karakter)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { productId: string; price: string; reason: string; yes?: boolean }, cmd: Command) => {
      const productId = Number(opts.productId)
      if (!Number.isInteger(productId) || productId <= 0) { die(`Érvénytelen termék ID: "${opts.productId}"`, 2); return }

      const proposedPriceGross = Number(opts.price)
      if (!Number.isInteger(proposedPriceGross) || proposedPriceGross <= 0) { die(`Az ár egész pozitív szám kell legyen: "${opts.price}"`, 2); return }

      const reason = opts.reason.trim()
      if (reason.length < 1 || reason.length > 500) { die('Az indoklás 1–500 karakter lehet.', 2); return }

      if (!opts.yes && process.stdin.isTTY) {
        const { createInterface } = await import('readline')
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const answer = await new Promise<string>((resolve) => {
          rl.question(
            `Javaslatot adsz be: termék #${productId}, ár: ${fmtPrice(proposedPriceGross)}, ok: "${reason}".\nFolytatod? [i/n] `,
            (a) => { rl.close(); resolve(a.trim().toLowerCase()) },
          )
        })
        if (answer !== 'i') {
          console.log('Megszakítva.')
          process.exit(0)
        }
      }

      const nonce = randomUUID()
      let result: CreateProposalResult
      try {
        result = await client.agent.createProposal({ productId, proposedPriceGross, reason, nonce })
      } catch (err) {
        handleApiError(err)
        return
      }

      if (isJsonMode(cmd)) {
        printJson({ ...result, nonce })
      } else {
        process.stdout.write(
          `Javaslat létrehozva (ID: ${result.id})\n` +
          `Állapot:     ${result.status}\n` +
          `Létrehozva:  ${fmtDate(result.createdAt)}\n` +
          `(Jóváhagyáshoz: Haszno webes felület → Árazás → Javaslatok)\n`,
        )
      }
    })

  // ── proposals approve ───────────────────────────────────────────────────
  proposals
    .command('approve')
    .description('Javaslatok jóváhagyása — NEM ELÉRHETŐ bolt API-kulccsal')
    .option('--ids <ids>', 'ID-k')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async () => {
      console.error(NOT_AVAILABLE_MSG)
      process.exit(1)
    })

  // ── proposals reject ────────────────────────────────────────────────────
  proposals
    .command('reject')
    .description('Javaslatok elutasítása — NEM ELÉRHETŐ bolt API-kulccsal')
    .option('--ids <ids>', 'ID-k')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async () => {
      console.error(NOT_AVAILABLE_MSG)
      process.exit(1)
    })

  // ── proposals rollback ──────────────────────────────────────────────────
  proposals
    .command('rollback')
    .description('Batch visszagörgetése — NEM ELÉRHETŐ bolt API-kulccsal')
    .option('--batch <batchId>', 'Batch ID')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async () => {
      console.error(NOT_AVAILABLE_MSG)
      process.exit(1)
    })
}
