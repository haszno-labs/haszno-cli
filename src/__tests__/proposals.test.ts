/**
 * Unit tests for packages/cli/src/commands/proposals.ts
 *
 * Tests use a fully mocked HasznoClient — no network calls.
 * process.exit is mocked so tests do not terminate the runner.
 * process.stdout.write and process.stderr.write are captured per-test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { HasznoClient, Proposal, ProposalStatus } from '../client/index.js'
import { registerProposalsCommands } from '../commands/proposals.js'

// ── mock data ────────────────────────────────────────────────────────────────

function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 1,
    productId: 10,
    productName: 'Teszt termék',
    productSku: 'SKU-001',
    oldPriceGross: 10000,
    proposedPriceGross: 9500,
    reason: 'market undercut',
    source: 'rule',
    status: 'pending',
    batchId: null,
    createdAt: '2024-01-15T10:00:00Z',
    decidedAt: null,
    ...overrides,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

type MockClient = {
  [K in keyof HasznoClient]: {
    [M in keyof HasznoClient[K]]: ReturnType<typeof vi.fn>
  }
}

function buildMockClient(): MockClient {
  return {
    health: { check: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    products: {
      list: vi.fn(),
      update: vi.fn(),
      setListing: vi.fn(),
      generateAiDescription: vi.fn(),
      applyPrices: vi.fn(),
    },
    stats: { get: vi.fn(), getImpact: vi.fn() },
    suppliers: { list: vi.fn() },
    feeds: { importFeed: vi.fn(), importMarketPrices: vi.fn() },
    orders: { list: vi.fn(), receiveOrder: vi.fn(), ship: vi.fn(), createDemo: vi.fn() },
    recommendations: { get: vi.fn(), fillTrendKeywords: vi.fn() },
    rules: {
      listTemplates: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      run: vi.fn(),
      runAll: vi.fn(),
      trigger: vi.fn(),
      listRuns: vi.fn(),
    },
    proposals: {
      list: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      rollback: vi.fn(),
    },
    automation: { get: vi.fn(), set: vi.fn() },
    network: {
      listSuppliers: vi.fn(),
      getSupplierProducts: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      sync: vi.fn(),
      getSupplierView: vi.fn(),
    },
  } as MockClient
}

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

  if (jsonMode) {
    // Pre-set the json flag before registering commands
    // We'll pass --json in the args instead
  }

  registerProposalsCommands(program, client as unknown as HasznoClient)

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

// ── tests ────────────────────────────────────────────────────────────────────

describe('proposals list', () => {
  let client: MockClient

  beforeEach(() => {
    client = buildMockClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls client.proposals.list with status=pending by default', async () => {
    client.proposals.list.mockResolvedValue([makeProposal()])
    await run(client, ['proposals', 'list'])
    expect(client.proposals.list).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('passes --status to client', async () => {
    client.proposals.list.mockResolvedValue([makeProposal({ status: 'approved' })])
    await run(client, ['proposals', 'list', '--status', 'approved'])
    expect(client.proposals.list).toHaveBeenCalledWith({ status: 'approved' })
  })

  it('prints a table row for each proposal in human mode', async () => {
    client.proposals.list.mockResolvedValue([makeProposal()])
    const { stdout } = await run(client, ['proposals', 'list'])
    expect(stdout).toContain('SKU-001')
    expect(stdout).toContain('Teszt termék')
    expect(stdout).toContain('1 javaslat')
  })

  it('prints JSON array in --json mode', async () => {
    const p = makeProposal()
    client.proposals.list.mockResolvedValue([p])
    const { stdout } = await run(client, ['proposals', 'list'], true)
    const parsed = JSON.parse(stdout)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].id).toBe(p.id)
  })

  it('prints "Nincs találat" for empty list', async () => {
    client.proposals.list.mockResolvedValue([])
    const { stdout } = await run(client, ['proposals', 'list'])
    expect(stdout).toContain('Nincs találat')
  })

  it('exits with code 2 for invalid --status value', async () => {
    client.proposals.list.mockResolvedValue([])
    const { stderr, exitCode } = await run(client, ['proposals', 'list', '--status', 'bogus'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Érvénytelen állapot')
  })

  it('exits with code 1 on API error', async () => {
    client.proposals.list.mockRejectedValue(new Error('API hiba'))
    const { stderr, exitCode } = await run(client, ['proposals', 'list'])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('API hiba')
  })
})

describe('proposals show', () => {
  let client: MockClient

  beforeEach(() => {
    client = buildMockClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches all statuses and shows the matching proposal', async () => {
    const p = makeProposal({ id: 5, status: 'approved' })
    client.proposals.list.mockImplementation(async (params?: { status?: ProposalStatus }) => {
      if (params?.status === 'approved') return [p]
      return []
    })
    const { stdout } = await run(client, ['proposals', 'show', '5'])
    expect(stdout).toContain('ID:')
    expect(stdout).toContain('5')
    expect(stdout).toContain('Teszt termék')
  })

  it('prints JSON for --json mode', async () => {
    const p = makeProposal({ id: 7 })
    client.proposals.list.mockImplementation(async (params?: { status?: ProposalStatus }) => {
      if (params?.status === 'pending') return [p]
      return []
    })
    const { stdout } = await run(client, ['proposals', 'show', '7'], true)
    const parsed = JSON.parse(stdout)
    expect(parsed.id).toBe(7)
  })

  it('exits with code 1 when ID not found', async () => {
    client.proposals.list.mockResolvedValue([])
    const { exitCode, stderr } = await run(client, ['proposals', 'show', '999'])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('999')
  })

  it('exits with code 2 for non-numeric ID', async () => {
    const { exitCode } = await run(client, ['proposals', 'show', 'abc'])
    expect(exitCode).toBe(2)
  })
})

describe('proposals approve', () => {
  let client: MockClient

  beforeEach(() => {
    client = buildMockClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints DRY-RUN message when --yes is omitted', async () => {
    const { stdout, exitCode } = await run(client, ['proposals', 'approve'])
    expect(stdout).toContain('DRY-RUN')
    expect(exitCode).toBe(0)
    expect(client.proposals.approve).not.toHaveBeenCalled()
  })

  it('approves all pending when --yes and no --ids', async () => {
    client.proposals.approve.mockResolvedValue({ batchId: 'b-1', applied: 3 })
    const { stdout } = await run(client, ['proposals', 'approve', '--yes'])
    expect(client.proposals.approve).toHaveBeenCalledWith({})
    expect(stdout).toContain('3 javaslat')
    expect(stdout).toContain('b-1')
  })

  it('approves specific IDs when --ids provided', async () => {
    client.proposals.approve.mockResolvedValue({ batchId: 'b-2', applied: 2 })
    await run(client, ['proposals', 'approve', '--ids', '1,2', '--yes'])
    expect(client.proposals.approve).toHaveBeenCalledWith({ ids: [1, 2] })
  })

  it('prints JSON result in --json mode', async () => {
    client.proposals.approve.mockResolvedValue({ batchId: 'b-3', applied: 1 })
    const { stdout } = await run(client, ['proposals', 'approve', '--yes'], true)
    const parsed = JSON.parse(stdout)
    expect(parsed.batchId).toBe('b-3')
  })

  it('DRY-RUN lists target IDs when --ids given without --yes', async () => {
    const { stdout } = await run(client, ['proposals', 'approve', '--ids', '4,5'])
    expect(stdout).toContain('DRY-RUN')
    expect(stdout).toContain('4')
    expect(stdout).toContain('5')
  })

  it('exits with code 2 for invalid ID in --ids', async () => {
    const { exitCode, stderr } = await run(client, ['proposals', 'approve', '--ids', 'x', '--yes'])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('Érvénytelen ID')
  })

  it('exits with code 1 on API error', async () => {
    client.proposals.approve.mockRejectedValue(new Error('500'))
    const { exitCode } = await run(client, ['proposals', 'approve', '--yes'])
    expect(exitCode).toBe(1)
  })
})

describe('proposals reject', () => {
  let client: MockClient

  beforeEach(() => {
    client = buildMockClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints DRY-RUN message when --yes is omitted', async () => {
    const { stdout } = await run(client, ['proposals', 'reject', '--ids', '1'])
    expect(stdout).toContain('DRY-RUN')
    expect(client.proposals.reject).not.toHaveBeenCalled()
  })

  it('rejects specified IDs with --yes', async () => {
    client.proposals.reject.mockResolvedValue({ rejected: 2 })
    const { stdout } = await run(client, ['proposals', 'reject', '--ids', '3,4', '--yes'])
    expect(client.proposals.reject).toHaveBeenCalledWith({ ids: [3, 4] })
    expect(stdout).toContain('2 javaslat')
  })

  it('prints JSON in --json mode', async () => {
    client.proposals.reject.mockResolvedValue({ rejected: 1 })
    const { stdout } = await run(client, ['proposals', 'reject', '--ids', '5', '--yes'], true)
    const parsed = JSON.parse(stdout)
    expect(parsed.rejected).toBe(1)
  })

  it('exits with code 2 for invalid ID in --ids', async () => {
    const { exitCode } = await run(client, ['proposals', 'reject', '--ids', 'bad', '--yes'])
    expect(exitCode).toBe(2)
  })

  it('exits with code 1 on API error', async () => {
    client.proposals.reject.mockRejectedValue(new Error('server error'))
    const { exitCode } = await run(client, ['proposals', 'reject', '--ids', '1', '--yes'])
    expect(exitCode).toBe(1)
  })
})

describe('proposals rollback', () => {
  let client: MockClient

  beforeEach(() => {
    client = buildMockClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints DRY-RUN message when --yes is omitted', async () => {
    const { stdout } = await run(client, ['proposals', 'rollback', '--batch', 'b-10'])
    expect(stdout).toContain('DRY-RUN')
    expect(stdout).toContain('b-10')
    expect(client.proposals.rollback).not.toHaveBeenCalled()
  })

  it('calls rollback with correct batchId', async () => {
    client.proposals.rollback.mockResolvedValue({ rolledBack: 3 })
    const { stdout } = await run(client, ['proposals', 'rollback', '--batch', 'b-20', '--yes'])
    expect(client.proposals.rollback).toHaveBeenCalledWith({ batchId: 'b-20' })
    expect(stdout).toContain('3')
  })

  it('prints JSON in --json mode', async () => {
    client.proposals.rollback.mockResolvedValue({ rolledBack: 5 })
    const { stdout } = await run(
      client,
      ['proposals', 'rollback', '--batch', 'b-30', '--yes'],
      true,
    )
    const parsed = JSON.parse(stdout)
    expect(parsed.rolledBack).toBe(5)
  })

  it('exits with code 1 on API error', async () => {
    client.proposals.rollback.mockRejectedValue(new Error('rollback failed'))
    const { exitCode } = await run(client, ['proposals', 'rollback', '--batch', 'b-X', '--yes'])
    expect(exitCode).toBe(1)
  })
})
