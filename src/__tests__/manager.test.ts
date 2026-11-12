/**
 * Unit tests for manager commands:
 *   src/commands/report.ts
 *   src/commands/research.ts
 *   src/commands/actions.ts
 *
 * Uses a fully mocked HasznoClient — no network calls.
 * process.exit is mocked so tests do not terminate the runner.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  HasznoClient,
  DailyReport,
  ResearchBrief,
  AgentAction,
  FindingsInput,
} from '../client/index.js'
import { registerReportCommands } from '../commands/report.js'
import { registerResearchCommands } from '../commands/research.js'
import { registerActionsCommands } from '../commands/actions.js'

// ── Mock data ─────────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    id: 1,
    day: '2026-11-12',
    headline: 'Napi piaci összefoglaló',
    summary: 'Aktív mozgások a konzol-szegmensben.',
    items: [
      {
        id: 10,
        origin: 'rendszer',
        kind: 'ar_emelkedes',
        title: 'PS5 ár emelkedett',
        body: 'A PS5 átlagára 5%-kal emelkedett az elmúlt 24 órában.',
        changePct: 5.0,
        keyword: 'PS5',
        productId: 42,
        productName: 'Sony PlayStation 5',
        sourceName: null,
        sourceUrl: null,
        suggestedAction: { type: 'ar', productId: 42, priceGross: 180000 },
        action: null,
      },
      {
        id: 11,
        origin: 'agent',
        kind: 'hir',
        title: 'GTA VI megjelenési dátum megerősítve',
        body: 'A Rockstar Games megerősítette a GTA VI megjelenési dátumát.',
        changePct: null,
        keyword: null,
        productId: null,
        productName: null,
        sourceName: 'IGN',
        sourceUrl: 'https://ign.com/articles/gta6',
        suggestedAction: null,
        action: null,
      },
    ],
    createdAt: '2026-11-12T06:00:00Z',
    updatedAt: '2026-11-12T06:00:00Z',
    ...overrides,
  }
}

function makeBrief(overrides: Partial<ResearchBrief> = {}): ResearchBrief {
  return {
    day: '2026-11-12',
    shopFocus: [
      {
        keyword: 'PS5',
        productId: 42,
        name: 'Sony PlayStation 5',
        priceGross: 175000,
        marketMinGross: 165000,
        trend: 'emelkedo',
      },
    ],
    questions: [
      'Milyen hatással lesz a GTA VI megjelenése a konzol-eladásokra?',
      'Várható-e PS5 Pro árcsökkentés az ünnepek előtt?',
    ],
    postTo: '/api/daily-reports/2026-11-12/findings',
    ...overrides,
  }
}

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    id: 1,
    action: { type: 'ar', productId: 42, priceGross: 180000 },
    reason: 'Piaci áremelkedés miatt szükséges korrekció',
    status: 'javasolt',
    origin: 'agent',
    autoApproved: false,
    reportItemId: null,
    target: { name: 'Sony PlayStation 5', sku: 'PS5-CFI-1', imageUrl: null },
    preview: { oldPriceGross: 175000, newPriceGross: 180000, floorGross: 150000, marginPct: 18.5 },
    error: null,
    canUndo: false,
    createdAt: '2026-11-12T10:00:00Z',
    decidedAt: null,
    executedAt: null,
    ...overrides,
  }
}

// ── Mock client builder ───────────────────────────────────────────────────────

type MockClient = {
  [K in keyof HasznoClient]: { [M in keyof HasznoClient[K]]: ReturnType<typeof vi.fn> }
}

function buildMockClient(): MockClient {
  const stub = () => vi.fn()
  return {
    health: { check: stub() },
    settings: { get: stub(), update: stub() },
    products: { list: stub(), update: stub(), setListing: stub(), generateAiDescription: stub(), applyPrices: stub() },
    stats: { get: stub(), getImpact: stub() },
    suppliers: { list: stub() },
    feeds: { importFeed: stub(), importMarketPrices: stub() },
    orders: { list: stub(), receiveOrder: stub(), ship: stub(), createDemo: stub() },
    recommendations: { get: stub(), getAiShortlist: stub(), fillTrendKeywords: stub() },
    rules: {
      listTemplates: stub(), list: stub(), create: stub(), update: stub(), delete: stub(),
      run: stub(), runAll: stub(), trigger: stub(), listRuns: stub(), undoUnlists: stub(),
    },
    proposals: { list: stub(), approve: stub(), reject: stub(), rollback: stub() },
    automation: { get: stub(), set: stub() },
    network: {
      listSuppliers: stub(), getSupplierProducts: stub(), connect: stub(),
      disconnect: stub(), sync: stub(), getSupplierView: stub(),
    },
    catalogue: { search: stub() },
    importList: { list: stub(), add: stub(), push: stub() },
    connections: { list: stub(), get: stub() },
    peers: {
      createInvite: stub(), listInvites: stub(), revokeInvite: stub(),
      acceptInvite: stub(), listLinks: stub(), removeLink: stub(), setVisibility: stub(),
    },
    blog: { list: stub(), get: stub() },
    manager: {
      listReports: vi.fn(),
      getLatestReport: vi.fn(),
      getReport: vi.fn(),
      getResearchBrief: vi.fn(),
      postFindings: vi.fn(),
      listActions: vi.fn(),
      proposeAction: vi.fn(),
      getAutopilot: vi.fn(),
    },
  } as unknown as MockClient
}

// ── Test runner helper ────────────────────────────────────────────────────────

interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | undefined
}

async function run(
  client: MockClient,
  args: string[],
  jsonMode = false,
): Promise<RunResult> {
  let stdout = ''
  let stderr = ''
  let exitCode: number | undefined

  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk)
    return true
  })
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk)
    return true
  })
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
    (code?: number | string | null) => {
      exitCode = typeof code === 'number' ? code : 0
      throw new Error(`process.exit(${code})`)
    },
  )

  const program = new Command()
    .name('haszno')
    .exitOverride()
    .allowUnknownOption(false)
    .option('--json', 'JSON output')
    .option('--api-url <url>', 'API URL')
    .option('--api-key <key>', 'API key')

  registerReportCommands(program, client as unknown as HasznoClient)
  registerResearchCommands(program, client as unknown as HasznoClient)
  registerActionsCommands(program, client as unknown as HasznoClient)

  const argv = ['node', 'haszno', ...(jsonMode ? ['--json'] : []), ...args]

  try {
    await program.parseAsync(argv)
  } catch {
    // Commander throws on exitOverride; process.exit mock throws too — both expected.
  } finally {
    writeSpy.mockRestore()
    errSpy.mockRestore()
    exitSpy.mockRestore()
  }

  return { stdout, stderr, exitCode }
}

// ── Tests: haszno report ──────────────────────────────────────────────────────

describe('haszno report', () => {
  let client: MockClient

  beforeEach(() => { client = buildMockClient() })
  afterEach(() => { vi.restoreAllMocks() })

  it('calls getLatestReport when no --day given', async () => {
    client.manager.getLatestReport.mockResolvedValue(makeReport())
    const { stdout } = await run(client, ['report'])
    expect(client.manager.getLatestReport).toHaveBeenCalledOnce()
    expect(stdout).toContain('2026-11-12')
    expect(stdout).toContain('Napi piaci összefoglaló')
  })

  it('calls getReport with specific day when --day given', async () => {
    client.manager.getReport.mockResolvedValue(makeReport({ day: '2026-11-10' }))
    const { stdout } = await run(client, ['report', '--day', '2026-11-10'])
    expect(client.manager.getReport).toHaveBeenCalledWith('2026-11-10')
    expect(stdout).toContain('2026-11-10')
  })

  it('prints "Még nem érhető el" when latest is null', async () => {
    client.manager.getLatestReport.mockResolvedValue(null)
    const { stdout, exitCode } = await run(client, ['report'])
    expect(stdout).toContain('Még nem érhető el')
    expect(exitCode).toBe(0)
  })

  it('outputs JSON when --json flag is set', async () => {
    const report = makeReport()
    client.manager.getLatestReport.mockResolvedValue(report)
    const { stdout } = await run(client, ['report'], true)
    const parsed = JSON.parse(stdout)
    expect(parsed.day).toBe('2026-11-12')
    expect(parsed.items).toHaveLength(2)
  })

  it('exits 2 on invalid --day format', async () => {
    const { stderr, exitCode } = await run(client, ['report', '--day', 'morgen'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('YYYY-MM-DD')
  })

  it('shows grouped items with origin badges', async () => {
    client.manager.getLatestReport.mockResolvedValue(makeReport())
    const { stdout } = await run(client, ['report'])
    expect(stdout).toContain('Haszno-adat')
    expect(stdout).toContain('Agent-kutatás')
    expect(stdout).toContain('PS5 ár emelkedett')
    expect(stdout).toContain('GTA VI')
  })

  it('shows suggested action hint when present', async () => {
    client.manager.getLatestReport.mockResolvedValue(makeReport())
    const { stdout } = await run(client, ['report'])
    expect(stdout).toContain('Javaslat:')
  })
})

// ── Tests: haszno research ────────────────────────────────────────────────────

describe('haszno research brief', () => {
  let client: MockClient

  beforeEach(() => { client = buildMockClient() })
  afterEach(() => { vi.restoreAllMocks() })

  it('calls getResearchBrief and prints it', async () => {
    client.manager.getResearchBrief.mockResolvedValue(makeBrief())
    const { stdout } = await run(client, ['research', 'brief'])
    expect(client.manager.getResearchBrief).toHaveBeenCalledOnce()
    expect(stdout).toContain('2026-11-12')
    expect(stdout).toContain('PS5')
    expect(stdout).toContain('GTA VI megjelenése')
  })

  it('outputs JSON when --json flag is set', async () => {
    client.manager.getResearchBrief.mockResolvedValue(makeBrief())
    const { stdout } = await run(client, ['research', 'brief'], true)
    const parsed = JSON.parse(stdout)
    expect(parsed.day).toBe('2026-11-12')
    expect(parsed.shopFocus).toHaveLength(1)
  })
})

describe('haszno research post', () => {
  let client: MockClient
  let tmpFile: string

  beforeEach(() => {
    client = buildMockClient()
    tmpFile = join(tmpdir(), `manager-test-${Date.now()}.json`)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
  })

  it('reads a JSON file and posts findings', async () => {
    const findings: FindingsInput = {
      headline: 'GTA VI hatás',
      items: [{
        kind: 'hir',
        title: 'GTA VI megjelent',
        body: 'A GTA VI megjelenése várhatóan növeli a konzol-keresletet.',
        sourceName: 'IGN',
        sourceUrl: 'https://ign.com/articles/gta6',
      }],
    }
    writeFileSync(tmpFile, JSON.stringify(findings))
    client.manager.postFindings.mockResolvedValue(makeReport())

    const { stdout } = await run(client, ['research', 'post', tmpFile])
    expect(client.manager.postFindings).toHaveBeenCalledOnce()
    const [day, body] = client.manager.postFindings.mock.calls[0] as [string, FindingsInput]
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.items).toHaveLength(1)
    expect(stdout).toContain('feltöltve')
  })

  it('uses --day flag when provided', async () => {
    const findings: FindingsInput = {
      items: [{ kind: 'hir', title: 'Teszt hír', body: 'Ez egy teszt esemény.' }],
    }
    writeFileSync(tmpFile, JSON.stringify(findings))
    client.manager.postFindings.mockResolvedValue(makeReport({ day: '2026-11-11' }))

    await run(client, ['research', 'post', tmpFile, '--day', '2026-11-11'])
    const [day] = client.manager.postFindings.mock.calls[0] as [string, FindingsInput]
    expect(day).toBe('2026-11-11')
  })

  it('exits 2 on invalid JSON', async () => {
    writeFileSync(tmpFile, 'not json at all {{')
    const { exitCode, stderr } = await run(client, ['research', 'post', tmpFile])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Érvénytelen JSON')
  })

  it('exits 2 when items array is missing', async () => {
    writeFileSync(tmpFile, JSON.stringify({ headline: 'x' }))
    const { exitCode, stderr } = await run(client, ['research', 'post', tmpFile])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('items')
  })

  it('exits 2 on invalid --day format', async () => {
    writeFileSync(tmpFile, JSON.stringify({ items: [{ kind: 'hir', title: 'x', body: 'y' }] }))
    const { exitCode, stderr } = await run(client, ['research', 'post', tmpFile, '--day', 'invalid'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('YYYY-MM-DD')
  })
})

// ── Tests: haszno actions ─────────────────────────────────────────────────────

describe('haszno actions list', () => {
  let client: MockClient

  beforeEach(() => { client = buildMockClient() })
  afterEach(() => { vi.restoreAllMocks() })

  it('calls listActions with default limit 50', async () => {
    client.manager.listActions.mockResolvedValue([makeAction()])
    await run(client, ['actions', 'list'])
    expect(client.manager.listActions).toHaveBeenCalledWith({ limit: 50 })
  })

  it('passes --status filter', async () => {
    client.manager.listActions.mockResolvedValue([makeAction()])
    await run(client, ['actions', 'list', '--status', 'javasolt'])
    expect(client.manager.listActions).toHaveBeenCalledWith({ status: 'javasolt', limit: 50 })
  })

  it('passes --limit', async () => {
    client.manager.listActions.mockResolvedValue([])
    await run(client, ['actions', 'list', '--limit', '10'])
    expect(client.manager.listActions).toHaveBeenCalledWith({ limit: 10 })
  })

  it('exits 2 on invalid status', async () => {
    const { exitCode, stderr } = await run(client, ['actions', 'list', '--status', 'ismeretlen'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Érvénytelen állapot')
  })

  it('prints "Nincs találat" for empty list', async () => {
    client.manager.listActions.mockResolvedValue([])
    const { stdout } = await run(client, ['actions', 'list'])
    expect(stdout).toContain('Nincs találat')
  })

  it('outputs JSON when --json flag is set', async () => {
    client.manager.listActions.mockResolvedValue([makeAction()])
    const { stdout } = await run(client, ['actions', 'list'], true)
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].id).toBe(1)
  })
})

describe('haszno actions propose', () => {
  let client: MockClient

  beforeEach(() => { client = buildMockClient() })
  afterEach(() => { vi.restoreAllMocks() })

  it('proposes an ar action', async () => {
    client.manager.proposeAction.mockResolvedValue(makeAction())
    await run(client, [
      'actions', 'propose',
      '--type', 'ar',
      '--product-id', '42',
      '--price', '180000',
      '--reason', 'Piaci áremelkedés',
    ])
    expect(client.manager.proposeAction).toHaveBeenCalledOnce()
    const [body] = client.manager.proposeAction.mock.calls[0] as [{ type: string; productId: number; priceGross: number; reason: string }]
    expect(body.type).toBe('ar')
    expect(body.productId).toBe(42)
    expect(body.priceGross).toBe(180000)
    expect(body.reason).toBe('Piaci áremelkedés')
  })

  it('proposes a felvetel action', async () => {
    client.manager.proposeAction.mockResolvedValue(makeAction({ action: { type: 'felvetel', productId: 42 } }))
    await run(client, [
      'actions', 'propose',
      '--type', 'felvetel',
      '--product-id', '42',
      '--reason', 'Jó árú termék felvétele',
    ])
    const [body] = client.manager.proposeAction.mock.calls[0] as [{ type: string }]
    expect(body.type).toBe('felvetel')
  })

  it('proposes an import action', async () => {
    client.manager.proposeAction.mockResolvedValue(makeAction({ action: { type: 'import', networkProductId: 99 } }))
    await run(client, [
      'actions', 'propose',
      '--type', 'import',
      '--network-product-id', '99',
      '--reason', 'Trending termék importja',
    ])
    const [body] = client.manager.proposeAction.mock.calls[0] as [{ type: string; networkProductId: number }]
    expect(body.type).toBe('import')
    expect(body.networkProductId).toBe(99)
  })

  it('exits 2 on invalid type', async () => {
    const { exitCode, stderr } = await run(client, [
      'actions', 'propose', '--type', 'torol', '--product-id', '1', '--reason', 'x'.repeat(10),
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Érvénytelen típus')
  })

  it('exits 2 when --product-id is missing for ar type', async () => {
    const { exitCode, stderr } = await run(client, [
      'actions', 'propose', '--type', 'ar', '--price', '10000', '--reason', 'teszt indoklás itt',
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('--product-id')
  })

  it('exits 2 when --price is missing for ar type', async () => {
    const { exitCode, stderr } = await run(client, [
      'actions', 'propose', '--type', 'ar', '--product-id', '1', '--reason', 'teszt indoklás itt',
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('--price')
  })

  it('exits 2 when --network-product-id is missing for import type', async () => {
    const { exitCode, stderr } = await run(client, [
      'actions', 'propose', '--type', 'import', '--reason', 'importálni kellene',
    ])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('--network-product-id')
  })

  it('prints approval hint when status is javasolt', async () => {
    client.manager.proposeAction.mockResolvedValue(makeAction())
    const { stdout } = await run(client, [
      'actions', 'propose',
      '--type', 'ar',
      '--product-id', '42',
      '--price', '180000',
      '--reason', 'Piaci áremelkedés miatt szükséges',
    ])
    expect(stdout).toContain('/app')
  })

  it('outputs JSON when --json flag is set', async () => {
    client.manager.proposeAction.mockResolvedValue(makeAction())
    const { stdout } = await run(client, [
      'actions', 'propose',
      '--type', 'ar',
      '--product-id', '42',
      '--price', '180000',
      '--reason', 'Piaci áremelkedés miatt szükséges',
    ], true)
    const parsed = JSON.parse(stdout)
    expect(parsed.id).toBe(1)
    expect(parsed.action.type).toBe('ar')
  })
})
