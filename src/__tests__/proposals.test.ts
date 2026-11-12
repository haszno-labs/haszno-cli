/**
 * Unit tests for packages/cli/src/commands/proposals.ts
 *
 * Changes from the pre-bearer version:
 *  - Calls client.agent.proposals() (GET /api/agent/proposals, pending only)
 *    instead of client.proposals.list()
 *  - proposals create added (POST /api/agent/proposals with auto nonce)
 *  - approve/reject/rollback return "not available" without calling any API
 *  - Response shapes use AgentProposal (no source, batchId, decidedAt)
 *  - Error messages for 401/403/404/409/429
 *
 * Tests use a fully mocked HasznoClient — no network calls.
 * process.exit is mocked so tests do not terminate the runner.
 * process.stdout.write and process.stderr.write are captured per-test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { HasznoClient, AgentProposal } from '../client/index.js'
import { HasznoApiError } from '../client/index.js'
import { registerProposalsCommands } from '../commands/proposals.js'

// ── mock data ────────────────────────────────────────────────────────────────

function makeAgentProposal(overrides: Partial<AgentProposal> = {}): AgentProposal {
  return {
    id: 1,
    productId: 10,
    productName: 'Teszt termék',
    productSku: 'SKU-001',
    oldPriceGross: 10000,
    proposedPriceGross: 9500,
    reason: 'market undercut',
    status: 'pending',
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildMockClient(): HasznoClient {
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
      undoUnlists: vi.fn(),
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
    catalogue: { search: vi.fn() },
    importList: { list: vi.fn(), add: vi.fn(), push: vi.fn() },
    connections: { list: vi.fn(), get: vi.fn() },
    peers: {
      createInvite: vi.fn(),
      listInvites: vi.fn(),
      revokeInvite: vi.fn(),
      acceptInvite: vi.fn(),
      listLinks: vi.fn(),
      removeLink: vi.fn(),
      setVisibility: vi.fn(),
    },
    blog: { list: vi.fn(), get: vi.fn() },
    agent: {
      products: vi.fn().mockResolvedValue([]),
      orders: vi.fn().mockResolvedValue([]),
      proposals: vi.fn().mockResolvedValue([makeAgentProposal()]),
      createProposal: vi.fn().mockResolvedValue({ id: 42, status: 'pending', createdAt: '2024-01-16T08:00:00Z' }),
    },
  } as unknown as HasznoClient
}

function buildProgram(client: HasznoClient): Command {
  const program = new Command()
  program.option('--json', 'JSON kimenet')
  program.exitOverride()
  registerProposalsCommands(program, client)
  return program
}

// ── capture helpers ───────────────────────────────────────────────────────────

function captureStdio() {
  const stdout: string[] = []
  const stderr: string[] = []
  const mockExit = vi.fn()

  vi.spyOn(process.stdout, 'write').mockImplementation((s) => { stdout.push(String(s)); return true })
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => { stderr.push(String(s)); return true })
  vi.spyOn(process, 'exit').mockImplementation(mockExit as unknown as typeof process.exit)
  // also capture console.error
  vi.spyOn(console, 'error').mockImplementation((...args) => { stderr.push(args.join(' ')); })

  return {
    getStdout: () => stdout.join(''),
    getStderr: () => stderr.join(''),
    getMockExit: () => mockExit,
    restore: () => vi.restoreAllMocks(),
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('proposals commands', () => {
  let client: HasznoClient
  let program: Command
  let io: ReturnType<typeof captureStdio>

  beforeEach(() => {
    client = buildMockClient()
    program = buildProgram(client)
    io = captureStdio()
  })

  afterEach(() => {
    io.restore()
  })

  // ── proposals list ────────────────────────────────────────────────────────

  describe('proposals list', () => {
    it('calls client.agent.proposals() — not client.proposals.list()', async () => {
      await program.parseAsync(['proposals', 'list'], { from: 'user' })
      expect(client.agent.proposals).toHaveBeenCalledOnce()
      expect(client.proposals.list).not.toHaveBeenCalled()
    })

    it('prints proposal table with product name and prices', async () => {
      await program.parseAsync(['proposals', 'list'], { from: 'user' })
      const out = io.getStdout()
      expect(out).toContain('Teszt termék')
      expect(out).toContain('10 000')
      expect(out).toContain('9500')  // 4-digit: no thousands separator in hu-HU
    })

    it('outputs JSON with --json flag', async () => {
      await program.parseAsync(['--json', 'proposals', 'list'], { from: 'user' })
      const out = io.getStdout()
      const parsed = JSON.parse(out)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0].id).toBe(1)
      // should NOT have source, batchId, decidedAt
      expect(parsed[0]).not.toHaveProperty('source')
      expect(parsed[0]).not.toHaveProperty('batchId')
      expect(parsed[0]).not.toHaveProperty('decidedAt')
    })

    it('shows "nincs találat" when no pending proposals', async () => {
      vi.mocked(client.agent.proposals).mockResolvedValue([])
      await program.parseAsync(['proposals', 'list'], { from: 'user' })
      expect(io.getStdout()).toContain('Nincs találat')
    })

    it('prints exit code 1 and 401 message on auth error', async () => {
      vi.mocked(client.agent.proposals).mockRejectedValue(new HasznoApiError(401, 'Unauthorized'))
      await program.parseAsync(['proposals', 'list'], { from: 'user' })
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
      expect(io.getStderr()).toMatch(/lejárt|visszavont|API-kulcsok/i)
    })
  })

  // ── proposals show ────────────────────────────────────────────────────────

  describe('proposals show', () => {
    it('shows details for a pending proposal', async () => {
      await program.parseAsync(['proposals', 'show', '1'], { from: 'user' })
      const out = io.getStdout()
      expect(out).toContain('Teszt termék')
      expect(out).toContain('market undercut')
    })

    it('exits with 1 when proposal not found', async () => {
      await program.parseAsync(['proposals', 'show', '999'], { from: 'user' })
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
    })
  })

  // ── proposals create ──────────────────────────────────────────────────────

  describe('proposals create', () => {
    it('calls client.agent.createProposal() with correct args and a UUID nonce', async () => {
      await program.parseAsync(
        ['proposals', 'create', '--product-id', '10', '--price', '8900', '--reason', 'Olcsóbb lett a verseny', '--yes'],
        { from: 'user' },
      )
      expect(client.agent.createProposal).toHaveBeenCalledOnce()
      const call = vi.mocked(client.agent.createProposal).mock.calls[0][0]
      expect(call.productId).toBe(10)
      expect(call.proposedPriceGross).toBe(8900)
      expect(call.reason).toBe('Olcsóbb lett a verseny')
      expect(call.nonce).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('generates a unique nonce per call', async () => {
      await program.parseAsync(
        ['proposals', 'create', '--product-id', '10', '--price', '8900', '--reason', 'Ok 1', '--yes'],
        { from: 'user' },
      )
      await program.parseAsync(
        ['proposals', 'create', '--product-id', '10', '--price', '8800', '--reason', 'Ok 2', '--yes'],
        { from: 'user' },
      )
      const calls = vi.mocked(client.agent.createProposal).mock.calls
      expect(calls[0][0].nonce).not.toBe(calls[1][0].nonce)
    })

    it('shows the created proposal ID on success', async () => {
      await program.parseAsync(
        ['proposals', 'create', '--product-id', '10', '--price', '8900', '--reason', 'test', '--yes'],
        { from: 'user' },
      )
      expect(io.getStdout()).toContain('42')
      expect(io.getStdout()).toContain('pending')
    })

    it('prints 404 message when product not in shop', async () => {
      vi.mocked(client.agent.createProposal).mockRejectedValue(new HasznoApiError(404, 'Not Found'))
      await program.parseAsync(
        ['proposals', 'create', '--product-id', '999', '--price', '8900', '--reason', 'test', '--yes'],
        { from: 'user' },
      )
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
      expect(io.getStderr()).toMatch(/termék|bolt|shop|saját/i)
    })

    it('prints 409 message on duplicate nonce', async () => {
      vi.mocked(client.agent.createProposal).mockRejectedValue(new HasznoApiError(409, 'Conflict'))
      await program.parseAsync(
        ['proposals', 'create', '--product-id', '10', '--price', '8900', '--reason', 'test', '--yes'],
        { from: 'user' },
      )
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
      expect(io.getStderr()).toMatch(/nonce|Duplikált/i)
    })
  })

  // ── proposals approve ─────────────────────────────────────────────────────

  describe('proposals approve', () => {
    it('prints not-available message and exits 1 without calling any API', async () => {
      await program.parseAsync(['proposals', 'approve', '--yes'], { from: 'user' })
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
      expect(io.getStderr()).toMatch(/bolt API-kulcs|webes felület|emberi/i)
      expect(client.proposals.approve).not.toHaveBeenCalled()
      expect(client.agent.proposals).not.toHaveBeenCalled()
    })
  })

  // ── proposals reject ──────────────────────────────────────────────────────

  describe('proposals reject', () => {
    it('prints not-available message and exits 1 without calling any API', async () => {
      await program.parseAsync(['proposals', 'reject', '--ids', '1', '--yes'], { from: 'user' })
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
      expect(io.getStderr()).toMatch(/bolt API-kulcs|webes felület|emberi/i)
      expect(client.proposals.reject).not.toHaveBeenCalled()
    })
  })

  // ── proposals rollback ────────────────────────────────────────────────────

  describe('proposals rollback', () => {
    it('prints not-available message and exits 1 without calling any API', async () => {
      await program.parseAsync(['proposals', 'rollback', '--batch', 'b-abc', '--yes'], { from: 'user' })
      expect(io.getMockExit()).toHaveBeenCalledWith(1)
      expect(io.getStderr()).toMatch(/bolt API-kulcs|webes felület|emberi/i)
      expect(client.proposals.rollback).not.toHaveBeenCalled()
    })
  })
})

// ── http / auth integration test ──────────────────────────────────────────────

describe('HTTP client auth header', () => {
  it('sends Authorization: Bearer when apiKey is provided', async () => {
    const { createClient } = await import('../client/index.js')

    const capturedHeaders: Record<string, string>[] = []
    const mockFetch = vi.fn(async (_url: string, init: RequestInit) => {
      capturedHeaders.push({ ...(init.headers as Record<string, string>) })
      return new Response(JSON.stringify([]), { status: 200 })
    })

    const client = createClient({
      apiKey: 'haszno_testtoken123',
      fetch: mockFetch as typeof fetch,
    })

    await client.agent.proposals()

    expect(capturedHeaders[0]?.['Authorization']).toBe('Bearer haszno_testtoken123')
    // must NOT use x-api-key
    expect(capturedHeaders[0]).not.toHaveProperty('x-api-key')
  })

  it('routes agent endpoints to /api/agent/* paths', async () => {
    const { createClient } = await import('../client/index.js')

    const capturedUrls: string[] = []
    const mockFetch = vi.fn(async (url: string) => {
      capturedUrls.push(url)
      return new Response(JSON.stringify([]), { status: 200 })
    })

    const client = createClient({
      apiKey: 'haszno_tok',
      baseUrl: 'https://haszno.com',
      fetch: mockFetch as typeof fetch,
    })

    await client.agent.products()
    await client.agent.orders()
    await client.agent.proposals()

    expect(capturedUrls[0]).toBe('https://haszno.com/api/agent/products')
    expect(capturedUrls[1]).toBe('https://haszno.com/api/agent/orders')
    expect(capturedUrls[2]).toBe('https://haszno.com/api/agent/proposals')
  })
})
