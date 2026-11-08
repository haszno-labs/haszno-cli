/**
 * Unit tests for packages/cli/src/commands/rules.ts
 *
 * Strategy:
 *  - Mock the HasznoClient so no network calls happen.
 *  - Mock process.exit so "dry-run" paths don't terminate the test runner.
 *  - Spy on process.stdout.write / process.stderr.write to assert output.
 *  - Call program.parseAsync(['node', 'haszno', ...argv]) for each scenario.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { registerRulesCommands } from '../commands/rules.js'
import type { HasznoClient, Rule, RuleTemplate, RuleRun } from '../client/index.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const RULE: Rule = {
  id: 1,
  name: 'Veszteséges ár szüneteltetés',
  enabled: true,
  trigger: 'price_changed',
  conditions: [{ field: 'marginPct', op: 'lt', value: 0 }],
  actions: [{ type: 'pause_listing' }],
  template: 'loss-pause',
  createdAt: '2024-01-15T10:00:00Z',
}

const TEMPLATE: RuleTemplate = {
  key: 'loss-pause',
  name: 'Veszteséges termék szüneteltetése',
  description: 'Ha a haszon negatív, automatikusan szünetelteti a hirdetést.',
  trigger: 'price_changed',
  conditions: [{ field: 'marginPct', op: 'lt', value: 0 }],
  actions: [{ type: 'pause_listing' }],
}

const RUN_LOG: RuleRun = {
  id: 10,
  ruleId: 1,
  ruleName: 'Veszteséges ár szüneteltetés',
  trigger: 'price_changed',
  productId: 42,
  summary: '3 termék szüneteltetve',
  at: '2024-01-15T10:05:00Z',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeClient(overrides: Partial<HasznoClient> = {}): HasznoClient {
  return {
    rules: {
      list: vi.fn().mockResolvedValue([RULE]),
      listTemplates: vi.fn().mockResolvedValue([TEMPLATE]),
      create: vi.fn().mockResolvedValue(RULE),
      update: vi.fn().mockResolvedValue(RULE),
      delete: vi.fn().mockResolvedValue({ deleted: true }),
      run: vi.fn().mockResolvedValue({ applied: 3, skipped: 1, errors: 0 }),
      runAll: vi.fn().mockResolvedValue({ applied: 5, skipped: 2, errors: 0 }),
      trigger: vi.fn().mockResolvedValue({ applied: 2, skipped: 0, errors: 0 }),
      listRuns: vi.fn().mockResolvedValue([RUN_LOG]),
    },
    automation: {
      get: vi.fn().mockResolvedValue({ paused: false }),
      set: vi.fn().mockResolvedValue({ paused: true }),
    },
    ...overrides,
  } as unknown as HasznoClient
}

/** Build a fresh root Commander program for each test to avoid state leakage. */
function makeProgram(client: HasznoClient): Command {
  const program = new Command()
    .name('haszno')
    .option('--json', 'JSON kimenet')
    .exitOverride() // throw instead of process.exit inside Commander's own error paths
  registerRulesCommands(program, client)
  return program
}

type ExitErr = Error & { code?: number }

// ── setup ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stdoutSpy: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stderrSpy: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let exitSpy: any

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
    const err: ExitErr = new Error(`process.exit(${code})`)
    err.code = typeof code === 'number' ? code : undefined
    throw err
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Collect everything written to stdout during parseAsync. */
async function run(program: Command, argv: string[]): Promise<{ stdout: string; stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  stdoutSpy.mockImplementation((chunk: unknown) => { out.push(String(chunk)); return true })
  stderrSpy.mockImplementation((chunk: unknown) => { err.push(String(chunk)); return true })
  await program.parseAsync(['node', 'haszno', ...argv])
  return { stdout: out.join(''), stderr: err.join('') }
}

/** Run and expect a process.exit call; returns the exit code. */
async function runExpectExit(program: Command, argv: string[]): Promise<{ code: number | undefined; stdout: string; stderr: string }> {
  const out: string[] = []
  const err: string[] = []
  stdoutSpy.mockImplementation((chunk: unknown) => { out.push(String(chunk)); return true })
  stderrSpy.mockImplementation((chunk: unknown) => { err.push(String(chunk)); return true })
  let exitCode: number | undefined
  try {
    await program.parseAsync(['node', 'haszno', ...argv])
  } catch (e) {
    const ex = e as ExitErr
    if (ex.message?.startsWith('process.exit')) {
      exitCode = ex.code
    } else {
      throw e
    }
  }
  return { code: exitCode, stdout: out.join(''), stderr: err.join('') }
}

// ── tests: rules list ─────────────────────────────────────────────────────────

describe('rules list', () => {
  it('calls client.rules.list() and renders a table', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'list'])
    expect(client.rules.list).toHaveBeenCalledOnce()
    expect(stdout).toContain('Veszteséges ár szüneteltetés')
    expect(stdout).toContain('price_changed')
    expect(stdout).toContain('Összesen: 1 szabály')
  })

  it('--json emits a JSON array', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['--json', 'rules', 'list'])
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].id).toBe(1)
  })

  it('--enabled filters to only active rules', async () => {
    const disabled: Rule = { ...RULE, id: 2, enabled: false }
    const client = makeClient()
    ;(client.rules.list as ReturnType<typeof vi.fn>).mockResolvedValue([RULE, disabled])
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'list', '--enabled'])
    expect(stdout).toContain('Összesen: 1 szabály')
  })

  it('--disabled filters to only inactive rules', async () => {
    const disabled: Rule = { ...RULE, id: 2, name: 'Inaktív', enabled: false }
    const client = makeClient()
    ;(client.rules.list as ReturnType<typeof vi.fn>).mockResolvedValue([RULE, disabled])
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'list', '--disabled'])
    expect(stdout).toContain('Összesen: 1 szabály')
    expect(stdout).toContain('Inaktív')
  })

  it('shows empty message when list is empty', async () => {
    const client = makeClient()
    ;(client.rules.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'list'])
    expect(stdout).toContain('Nincs szabály')
  })

  it('exits 1 on API error', async () => {
    const client = makeClient()
    ;(client.rules.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'))
    const program = makeProgram(client)
    const { code, stderr } = await runExpectExit(program, ['rules', 'list'])
    expect(code).toBe(1)
    expect(stderr).toContain('timeout')
  })
})

// ── tests: rules templates ────────────────────────────────────────────────────

describe('rules templates', () => {
  it('calls client.rules.listTemplates() and renders a table', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'templates'])
    expect(client.rules.listTemplates).toHaveBeenCalledOnce()
    expect(stdout).toContain('loss-pause')
    expect(stdout).toContain('Összesen: 1 sablon')
  })

  it('--json emits JSON array', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['--json', 'rules', 'templates'])
    const parsed = JSON.parse(stdout)
    expect(parsed[0].key).toBe('loss-pause')
  })
})

// ── tests: rules create ───────────────────────────────────────────────────────

describe('rules create', () => {
  it('dry-run prints message and exits 0 without calling create', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stdout } = await runExpectExit(program, [
      'rules', 'create', '--template', 'loss-pause', '--name', 'Teszt',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('[DRY-RUN]')
    expect(client.rules.create).not.toHaveBeenCalled()
  })

  it('--yes creates the rule using template data', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, [
      'rules', 'create', '--template', 'loss-pause', '--name', 'Teszt', '--yes',
    ])
    expect(client.rules.create).toHaveBeenCalledOnce()
    const call = (client.rules.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.template).toBe('loss-pause')
    expect(call.name).toBe('Teszt')
    expect(call.enabled).toBe(true)
    expect(call.trigger).toBe('price_changed')
    expect(stdout).toContain('Szabály létrehozva')
  })

  it('--yes --disabled creates rule with enabled=false', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    await run(program, [
      'rules', 'create', '--template', 'loss-pause', '--name', 'Teszt', '--yes', '--disabled',
    ])
    const call = (client.rules.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.enabled).toBe(false)
  })

  it('exits 2 on unknown template key', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stderr } = await runExpectExit(program, [
      'rules', 'create', '--template', 'does-not-exist', '--name', 'X', '--yes',
    ])
    expect(code).toBe(2)
    expect(stderr).toContain('does-not-exist')
    expect(client.rules.create).not.toHaveBeenCalled()
  })
})

// ── tests: rules enable / disable ────────────────────────────────────────────

describe('rules enable', () => {
  it('dry-run exits 0 without calling update', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stdout } = await runExpectExit(program, ['rules', 'enable', '1'])
    expect(code).toBe(0)
    expect(stdout).toContain('[DRY-RUN]')
    expect(client.rules.update).not.toHaveBeenCalled()
  })

  it('--yes calls client.rules.update(id, { enabled: true })', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'enable', '1', '--yes'])
    expect(client.rules.update).toHaveBeenCalledWith(1, { enabled: true })
    expect(stdout).toContain('aktiválva')
  })

  it('exits 2 on non-numeric ID', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'enable', 'abc', '--yes'])
    expect(code).toBe(2)
  })
})

describe('rules disable', () => {
  it('--yes calls client.rules.update(id, { enabled: false })', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'disable', '1', '--yes'])
    expect(client.rules.update).toHaveBeenCalledWith(1, { enabled: false })
    expect(stdout).toContain('kikapcsolva')
  })
})

// ── tests: rules update ───────────────────────────────────────────────────────

describe('rules update', () => {
  it('dry-run exits 0 and shows changes', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stdout } = await runExpectExit(program, [
      'rules', 'update', '1', '--name', 'Új név',
    ])
    expect(code).toBe(0)
    expect(stdout).toContain('[DRY-RUN]')
    expect(stdout).toContain('Új név')
  })

  it('--yes --name calls update with new name', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    await run(program, ['rules', 'update', '1', '--name', 'Frissített', '--yes'])
    expect(client.rules.update).toHaveBeenCalledWith(1, { name: 'Frissített' })
  })

  it('--yes --enable calls update with enabled=true', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    await run(program, ['rules', 'update', '1', '--enable', '--yes'])
    expect(client.rules.update).toHaveBeenCalledWith(1, { enabled: true })
  })

  it('exits 2 when no patch options provided', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'update', '1', '--yes'])
    expect(code).toBe(2)
  })

  it('exits 2 when both --enable and --disable are given', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'update', '1', '--enable', '--disable', '--yes'])
    expect(code).toBe(2)
  })
})

// ── tests: rules delete ───────────────────────────────────────────────────────

describe('rules delete', () => {
  it('dry-run exits 0 without calling delete', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stdout } = await runExpectExit(program, ['rules', 'delete', '1'])
    expect(code).toBe(0)
    expect(stdout).toContain('[DRY-RUN]')
    expect(client.rules.delete).not.toHaveBeenCalled()
  })

  it('--yes calls client.rules.delete(id)', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'delete', '1', '--yes'])
    expect(client.rules.delete).toHaveBeenCalledWith(1)
    expect(stdout).toContain('törölve')
  })
})

// ── tests: rules run ──────────────────────────────────────────────────────────

describe('rules run', () => {
  it('dry-run exits 0', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'run', '1'])
    expect(code).toBe(0)
    expect(client.rules.run).not.toHaveBeenCalled()
  })

  it('--yes calls client.rules.run(id) and prints result', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'run', '1', '--yes'])
    expect(client.rules.run).toHaveBeenCalledWith(1)
    expect(stdout).toContain('alkalmazva=3')
  })

  it('--json emits JSON', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['--json', 'rules', 'run', '1', '--yes'])
    const parsed = JSON.parse(stdout)
    expect(parsed.applied).toBe(3)
  })
})

// ── tests: rules run-all ──────────────────────────────────────────────────────

describe('rules run-all', () => {
  it('dry-run exits 0', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'run-all'])
    expect(code).toBe(0)
  })

  it('--yes calls client.rules.runAll()', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'run-all', '--yes'])
    expect(client.rules.runAll).toHaveBeenCalledOnce()
    expect(stdout).toContain('alkalmazva=5')
  })
})

// ── tests: rules trigger ──────────────────────────────────────────────────────

describe('rules trigger', () => {
  it('dry-run exits 0 and shows trigger name', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stdout } = await runExpectExit(program, ['rules', 'trigger', 'stock_changed'])
    expect(code).toBe(0)
    expect(stdout).toContain('stock_changed')
  })

  it('--yes without --ids calls trigger with no productIds', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    await run(program, ['rules', 'trigger', 'stock_changed', '--yes'])
    expect(client.rules.trigger).toHaveBeenCalledWith({ trigger: 'stock_changed', productIds: undefined })
  })

  it('--yes --ids parses product IDs', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    await run(program, ['rules', 'trigger', 'price_changed', '--ids', '1,2,3', '--yes'])
    expect(client.rules.trigger).toHaveBeenCalledWith({
      trigger: 'price_changed',
      productIds: [1, 2, 3],
    })
  })

  it('exits 2 on invalid product ID in --ids', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, [
      'rules', 'trigger', 'price_changed', '--ids', '1,abc', '--yes',
    ])
    expect(code).toBe(2)
    expect(client.rules.trigger).not.toHaveBeenCalled()
  })
})

// ── tests: rules runs ─────────────────────────────────────────────────────────

describe('rules runs', () => {
  it('calls listRuns with default limit 50', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'runs'])
    expect(client.rules.listRuns).toHaveBeenCalledWith({ limit: 50 })
    // Table truncates long names; check for a prefix that fits in the column width.
    expect(stdout).toContain('Veszteséges')
    expect(stdout).toContain('price_changed')
    expect(stdout).toContain('Összesen: 1 bejegyzés')
  })

  it('--limit passes custom limit', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    await run(program, ['rules', 'runs', '--limit', '10'])
    expect(client.rules.listRuns).toHaveBeenCalledWith({ limit: 10 })
  })

  it('--json emits JSON array', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['--json', 'rules', 'runs'])
    const parsed = JSON.parse(stdout)
    expect(parsed[0].id).toBe(10)
  })

  it('exits 2 on invalid --limit', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'runs', '--limit', '0'])
    expect(code).toBe(2)
  })
})

// ── tests: rules automation ───────────────────────────────────────────────────

describe('rules automation', () => {
  it('shows running state when paused=false', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'automation'])
    expect(client.automation.get).toHaveBeenCalledOnce()
    expect(stdout).toContain('FUTÓ')
  })

  it('shows paused state when paused=true', async () => {
    const client = makeClient()
    ;(client.automation.get as ReturnType<typeof vi.fn>).mockResolvedValue({ paused: true })
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'automation'])
    expect(stdout).toContain('SZÜNETELTETETT')
  })

  it('--json emits { paused: false }', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['--json', 'rules', 'automation'])
    const parsed = JSON.parse(stdout)
    expect(parsed.paused).toBe(false)
  })
})

describe('rules automation pause', () => {
  it('dry-run exits 0 without calling automation.set', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code, stdout } = await runExpectExit(program, ['rules', 'automation', 'pause'])
    expect(code).toBe(0)
    expect(stdout).toContain('[DRY-RUN]')
    expect(client.automation.set).not.toHaveBeenCalled()
  })

  it('--yes calls automation.set({ paused: true })', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'automation', 'pause', '--yes'])
    expect(client.automation.set).toHaveBeenCalledWith({ paused: true })
    expect(stdout).toContain('szüneteltetve')
  })
})

describe('rules automation resume', () => {
  it('dry-run exits 0', async () => {
    const client = makeClient()
    const program = makeProgram(client)
    const { code } = await runExpectExit(program, ['rules', 'automation', 'resume'])
    expect(code).toBe(0)
    expect(client.automation.set).not.toHaveBeenCalled()
  })

  it('--yes calls automation.set({ paused: false })', async () => {
    const client = makeClient()
    ;(client.automation.set as ReturnType<typeof vi.fn>).mockResolvedValue({ paused: false })
    const program = makeProgram(client)
    const { stdout } = await run(program, ['rules', 'automation', 'resume', '--yes'])
    expect(client.automation.set).toHaveBeenCalledWith({ paused: false })
    expect(stdout).toContain('folytatva')
  })
})
