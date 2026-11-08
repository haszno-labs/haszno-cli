/**
 * CLI commands — rules (automation rule engine).
 *
 * Domain: rules
 * Subcommands:
 *   haszno rules list                                       list rules
 *   haszno rules templates                                  list built-in rule templates
 *   haszno rules create --template <key> --name <name>      create a rule from template (write, --yes)
 *   haszno rules enable <id>                                enable a rule (write, --yes)
 *   haszno rules disable <id>                               disable a rule (write, --yes)
 *   haszno rules update <id> [opts]                         update rule fields (write, --yes)
 *   haszno rules delete <id>                                delete a rule (write, --yes)
 *   haszno rules run <id>                                   manually run a single rule (write, --yes)
 *   haszno rules run-all                                    run all manual-trigger rules (write, --yes)
 *   haszno rules trigger <name> [--ids <ids>]               fire a named trigger (write, --yes)
 *   haszno rules runs [--limit <n>]                         show rule execution log
 *   haszno rules automation                                 show automation kill switch status
 *   haszno rules automation pause                           pause automation (write, --yes)
 *   haszno rules automation resume                          resume automation (write, --yes)
 *
 * Write operations require --yes; without it the command explains what would happen and exits 0.
 * Exit codes: 0 = ok, 1 = API/runtime error, 2 = usage error.
 */
import { Command } from 'commander'
import type { HasznoClient, Rule, RuleTemplate, RuleRun, RunResult } from '../client/index.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function isJsonMode(cmd: Command): boolean {
  // Walk up to root to find the --json flag.
  let c: Command = cmd
  while (c.parent) c = c.parent
  return !!(c.opts<{ json?: boolean }>().json)
}

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('hu-HU')
}

function fmtBool(v: boolean): string {
  return v ? 'igen' : 'nem'
}

function die(msg: string, code = 1): never {
  process.stderr.write(`Hiba: ${msg}\n`)
  process.exit(code)
}

function padR(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length)
}

function padL(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s
}

// ── table printers ────────────────────────────────────────────────────────────

function printRuleTable(rows: Rule[]): void {
  if (rows.length === 0) {
    process.stdout.write('Nincs szabály.\n')
    return
  }
  const idW = 4
  const nameW = Math.min(32, Math.max(4, ...rows.map(r => r.name.length)))
  const trigW = Math.min(20, Math.max(7, ...rows.map(r => r.trigger.length)))
  const tplW = Math.min(20, Math.max(8, ...rows.map(r => (r.template ?? '—').length)))
  const condW = 6
  const enW = 6
  const dateW = 12

  const header =
    padL('ID', idW) + '  ' +
    padR('Név', nameW) + '  ' +
    padR('Trigger', trigW) + '  ' +
    padR('Sablon', tplW) + '  ' +
    padL('Felt.', condW) + '  ' +
    padR('Aktív', enW) + '  ' +
    padR('Létrehozva', dateW)
  process.stdout.write(header + '\n' + '-'.repeat(header.length) + '\n')

  for (const r of rows) {
    const line =
      padL(String(r.id), idW) + '  ' +
      padR(r.name, nameW) + '  ' +
      padR(r.trigger, trigW) + '  ' +
      padR(r.template ?? '—', tplW) + '  ' +
      padL(String(r.conditions.length), condW) + '  ' +
      padR(fmtBool(r.enabled), enW) + '  ' +
      padR(fmtDate(r.createdAt), dateW)
    process.stdout.write(line + '\n')
  }
}

function printTemplateTable(rows: RuleTemplate[]): void {
  if (rows.length === 0) {
    process.stdout.write('Nincs sablon.\n')
    return
  }
  const keyW = Math.min(24, Math.max(5, ...rows.map(r => r.key.length)))
  const nameW = Math.min(28, Math.max(4, ...rows.map(r => r.name.length)))
  const trigW = Math.min(20, Math.max(7, ...rows.map(r => r.trigger.length)))
  const descW = Math.min(40, Math.max(5, ...rows.map(r => r.description.length)))

  const header =
    padR('Kulcs', keyW) + '  ' +
    padR('Név', nameW) + '  ' +
    padR('Trigger', trigW) + '  ' +
    padR('Leírás', descW)
  process.stdout.write(header + '\n' + '-'.repeat(header.length) + '\n')

  for (const r of rows) {
    const line =
      padR(r.key, keyW) + '  ' +
      padR(r.name, nameW) + '  ' +
      padR(r.trigger, trigW) + '  ' +
      padR(r.description, descW)
    process.stdout.write(line + '\n')
  }
}

function printRunTable(rows: RuleRun[]): void {
  if (rows.length === 0) {
    process.stdout.write('Nincs futásnapló-bejegyzés.\n')
    return
  }
  const idW = 6
  const ruleW = Math.min(24, Math.max(7, ...rows.map(r => (r.ruleName ?? '—').length)))
  const trigW = Math.min(20, Math.max(7, ...rows.map(r => r.trigger.length)))
  const pidW = 8
  const sumW = Math.min(40, Math.max(8, ...rows.map(r => r.summary.length)))
  const dateW = 20

  const header =
    padL('ID', idW) + '  ' +
    padR('Szabály', ruleW) + '  ' +
    padR('Trigger', trigW) + '  ' +
    padL('TerID', pidW) + '  ' +
    padR('Összefoglaló', sumW) + '  ' +
    padR('Időpont', dateW)
  process.stdout.write(header + '\n' + '-'.repeat(header.length) + '\n')

  for (const r of rows) {
    const line =
      padL(String(r.id), idW) + '  ' +
      padR(r.ruleName ?? '—', ruleW) + '  ' +
      padR(r.trigger, trigW) + '  ' +
      padL(r.productId != null ? String(r.productId) : '—', pidW) + '  ' +
      padR(r.summary, sumW) + '  ' +
      padR(new Date(r.at).toLocaleString('hu-HU'), dateW)
    process.stdout.write(line + '\n')
  }
}

function printRunResult(result: RunResult, label: string): void {
  const applied = result.applied ?? 0
  const skipped = result.skipped ?? 0
  const errors = result.errors ?? 0
  process.stdout.write(
    `${label}: alkalmazva=${applied}, kihagyva=${skipped}, hiba=${errors}\n`,
  )
}

// ── register ──────────────────────────────────────────────────────────────────

export function registerRulesCommands(program: Command, client: HasznoClient): void {
  const rules = program
    .command('rules')
    .description('Automatizálási szabályok és kill switch kezelése (rule engine)')

  // ── rules list ────────────────────────────────────────────────────────────
  rules
    .command('list')
    .description('Szabályok listázása')
    .option('--enabled', 'Csak az aktív szabályokat mutatja')
    .option('--disabled', 'Csak az inaktív szabályokat mutatja')
    .action(async (opts: { enabled?: boolean; disabled?: boolean }, cmd: Command) => {
      if (opts.enabled && opts.disabled) {
        die('Az --enabled és --disabled kapcsolók kizárják egymást.', 2)
      }

      let rows: Rule[]
      try {
        rows = await client.rules.list()
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (opts.enabled) rows = rows.filter(r => r.enabled)
      if (opts.disabled) rows = rows.filter(r => !r.enabled)

      if (isJsonMode(cmd)) {
        printJson(rows)
      } else {
        printRuleTable(rows)
        process.stdout.write(`\nÖsszesen: ${rows.length} szabály\n`)
      }
    })

  // ── rules templates ───────────────────────────────────────────────────────
  rules
    .command('templates')
    .description('Beépített sablonok listázása')
    .action(async (_opts: unknown, cmd: Command) => {
      let rows: RuleTemplate[]
      try {
        rows = await client.rules.listTemplates()
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rows)
      } else {
        printTemplateTable(rows)
        process.stdout.write(`\nÖsszesen: ${rows.length} sablon\n`)
      }
    })

  // ── rules create ──────────────────────────────────────────────────────────
  rules
    .command('create')
    .description('Új szabály létrehozása sablon alapján (write)')
    .requiredOption('--template <key>', 'Sablon kulcsa (ld. haszno rules templates)')
    .requiredOption('--name <name>', 'Az új szabály neve')
    .option('--disabled', 'Inaktív állapotban hozza létre (alapértelmezett: aktív)')
    .option('--yes', 'Megerősítés kihagyása (kötelező automatizáláshoz)')
    .action(async (opts: { template: string; name: string; disabled?: boolean; yes?: boolean }, cmd: Command) => {
      // Load template to validate key and get conditions/actions.
      let templates: RuleTemplate[]
      try {
        templates = await client.rules.listTemplates()
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      const tpl = templates.find(t => t.key === opts.template)
      if (!tpl) {
        const keys = templates.map(t => t.key).join(', ')
        die(`Ismeretlen sablon: "${opts.template}". Érvényes kulcsok: ${keys || '(nincs sablon)'}`, 2)
      }

      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Létrehoznánk: "${opts.name}" a "${tpl.name}" sablonból` +
          ` (trigger: ${tpl.trigger}, enabled: ${!opts.disabled}).\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let rule: Rule
      try {
        rule = await client.rules.create({
          name: opts.name,
          enabled: !opts.disabled,
          trigger: tpl.trigger,
          conditions: tpl.conditions,
          actions: tpl.actions,
          template: tpl.key,
        })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rule)
      } else {
        process.stdout.write(`Szabály létrehozva: ID=${rule.id} "${rule.name}"\n`)
      }
    })

  // ── rules enable ──────────────────────────────────────────────────────────
  rules
    .command('enable <id>')
    .description('Szabály aktiválása (write)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (idStr: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) die(`Érvénytelen ID: "${idStr}"`, 2)

      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Aktiválnánk: szabály ID=${id}.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let rule: Rule
      try {
        rule = await client.rules.update(id, { enabled: true })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rule)
      } else {
        process.stdout.write(`Szabály aktiválva: ID=${rule.id} "${rule.name}"\n`)
      }
    })

  // ── rules disable ─────────────────────────────────────────────────────────
  rules
    .command('disable <id>')
    .description('Szabály kikapcsolása (write)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (idStr: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) die(`Érvénytelen ID: "${idStr}"`, 2)

      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Kikapcsolnánk: szabály ID=${id}.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let rule: Rule
      try {
        rule = await client.rules.update(id, { enabled: false })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rule)
      } else {
        process.stdout.write(`Szabály kikapcsolva: ID=${rule.id} "${rule.name}"\n`)
      }
    })

  // ── rules update ──────────────────────────────────────────────────────────
  rules
    .command('update <id>')
    .description('Szabály módosítása (write)')
    .option('--name <name>', 'Új szabálynév')
    .option('--trigger <trigger>', 'Új trigger')
    .option('--enable', 'Aktiválás')
    .option('--disable', 'Kikapcsolás')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (idStr: string, opts: { name?: string; trigger?: string; enable?: boolean; disable?: boolean; yes?: boolean }, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) die(`Érvénytelen ID: "${idStr}"`, 2)

      if (opts.enable && opts.disable) {
        die('Az --enable és --disable kapcsolók kizárják egymást.', 2)
      }

      const patch: { name?: string; trigger?: string; enabled?: boolean } = {}
      if (opts.name) patch.name = opts.name
      if (opts.trigger) patch.trigger = opts.trigger
      if (opts.enable) patch.enabled = true
      if (opts.disable) patch.enabled = false

      if (Object.keys(patch).length === 0) {
        die('Legalább egy módosítási kapcsolót meg kell adni (--name, --trigger, --enable, --disable).', 2)
      }

      if (!opts.yes) {
        const changes = Object.entries(patch)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(', ')
        process.stdout.write(
          `[DRY-RUN] Módosítanánk: szabály ID=${id} → ${changes}.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let rule: Rule
      try {
        rule = await client.rules.update(id, patch)
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rule)
      } else {
        process.stdout.write(`Szabály frissítve: ID=${rule.id} "${rule.name}"\n`)
      }
    })

  // ── rules delete ──────────────────────────────────────────────────────────
  rules
    .command('delete <id>')
    .description('Szabály törlése (write, visszafordíthatatlan!)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (idStr: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) die(`Érvénytelen ID: "${idStr}"`, 2)

      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Törölnénk: szabály ID=${id}. Ez a művelet visszafordíthatatlan!\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: { deleted: boolean }
      try {
        result = await client.rules.delete(id)
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(result.deleted ? `Szabály törölve: ID=${id}\n` : `Törlés sikertelen: ID=${id}\n`)
      }
    })

  // ── rules run ─────────────────────────────────────────────────────────────
  rules
    .command('run <id>')
    .description('Egy szabály manuális futtatása (write)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (idStr: string, opts: { yes?: boolean }, cmd: Command) => {
      const id = Number(idStr)
      if (!Number.isInteger(id) || id <= 0) die(`Érvénytelen ID: "${idStr}"`, 2)

      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Lefuttatnánk: szabály ID=${id}.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: RunResult
      try {
        result = await client.rules.run(id)
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        printRunResult(result, `Szabály ID=${id} futott`)
      }
    })

  // ── rules run-all ─────────────────────────────────────────────────────────
  rules
    .command('run-all')
    .description('Az összes manuálisan indítható szabály futtatása (write)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Lefuttatnánk az összes manuális szabályt.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: RunResult
      try {
        result = await client.rules.runAll()
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        printRunResult(result, 'Összes szabály futott')
      }
    })

  // ── rules trigger ─────────────────────────────────────────────────────────
  rules
    .command('trigger <name>')
    .description('Névvel azonosított trigger tüzelése (write)')
    .option('--ids <ids>', 'Vesszővel elválasztott termék ID-k (pl. 1,2,3); ha nincs: az összes termék')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (triggerName: string, opts: { ids?: string; yes?: boolean }, cmd: Command) => {
      let productIds: number[] | undefined
      if (opts.ids) {
        try {
          productIds = opts.ids
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => {
              const n = Number(s)
              if (!Number.isInteger(n) || n <= 0) throw new Error(`Érvénytelen ID: "${s}"`)
              return n
            })
        } catch (err) {
          die(err instanceof Error ? err.message : String(err), 2)
        }
      }

      if (!opts.yes) {
        const target = productIds ? `termékek: ${productIds.join(', ')}` : 'az összes termék'
        process.stdout.write(
          `[DRY-RUN] Triggert tüzelnénk: "${triggerName}" (${target}).\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: RunResult
      try {
        result = await client.rules.trigger({ trigger: triggerName, productIds })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        printRunResult(result, `Trigger "${triggerName}" futott`)
      }
    })

  // ── rules runs ────────────────────────────────────────────────────────────
  rules
    .command('runs')
    .description('Futásnapló megjelenítése')
    .option('--limit <n>', 'Maximálisan visszaadott bejegyzések száma', '50')
    .action(async (opts: { limit: string }, cmd: Command) => {
      const limit = Number(opts.limit)
      if (!Number.isInteger(limit) || limit <= 0) {
        die(`Érvénytelen limit: "${opts.limit}"`, 2)
      }

      let rows: RuleRun[]
      try {
        rows = await client.rules.listRuns({ limit })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(rows)
      } else {
        printRunTable(rows)
        process.stdout.write(`\nÖsszesen: ${rows.length} bejegyzés\n`)
      }
    })

  // ── rules automation ─────────────────────────────────────────────────────
  const autoCmd = rules
    .command('automation')
    .description('Automatizálás kill switch állapota')
    .action(async (_opts: unknown, cmd: Command) => {
      let status: { paused: boolean }
      try {
        status = await client.automation.get()
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(status)
      } else {
        const state = status.paused ? 'SZÜNETELTETETT (paused)' : 'FUTÓ (running)'
        process.stdout.write(`Automatizálás állapota: ${state}\n`)
      }
    })

  // ── rules automation pause ───────────────────────────────────────────────
  autoCmd
    .command('pause')
    .description('Automatizálás szüneteltetése – az összes automatikus szabály leáll (write)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Szüneteltetésre kerülne az automatizálás.\n` +
          `Az összes automatikus szabály leáll végrehajtásig.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: { paused: boolean }
      try {
        result = await client.automation.set({ paused: true })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(`Automatizálás szüneteltetve. Állapot: ${result.paused ? 'paused' : 'running'}\n`)
      }
    })

  // ── rules automation resume ──────────────────────────────────────────────
  autoCmd
    .command('resume')
    .description('Automatizálás folytatása (write)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        process.stdout.write(
          `[DRY-RUN] Folytatnánk az automatizálást.\n` +
          `Végrehajtáshoz add meg a --yes kapcsolót.\n`,
        )
        process.exit(0)
      }

      let result: { paused: boolean }
      try {
        result = await client.automation.set({ paused: false })
      } catch (err) {
        die(err instanceof Error ? err.message : String(err))
      }

      if (isJsonMode(cmd)) {
        printJson(result)
      } else {
        process.stdout.write(`Automatizálás folytatva. Állapot: ${result.paused ? 'paused' : 'running'}\n`)
      }
    })
}
