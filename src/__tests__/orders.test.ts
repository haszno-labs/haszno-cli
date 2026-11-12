import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { HasznoClient, AgentOrder } from '../client/index.js'
import { registerOrdersCommands } from '../commands/orders.js'

// ---- fixtures ---------------------------------------------------------------

const orderReceived: AgentOrder = {
  id: 1,
  externalId: 'EXT-001',
  customerName: 'Kiss Péter',
  status: 'received',
  totalGross: 25000,
  createdAt: '2024-01-15T10:00:00Z',
  items: [
    { orderId: 1, qty: 2, priceGross: 12500, name: 'Teszt Termék', sku: 'SKU-001' },
  ],
}

const orderShipped: AgentOrder = {
  id: 2,
  externalId: 'EXT-002',
  customerName: 'Nagy Anna',
  status: 'shipped',
  totalGross: 8900,
  createdAt: '2024-01-16T09:00:00Z',
  items: [
    { orderId: 2, qty: 1, priceGross: 8900, name: 'Másik Termék', sku: 'SKU-002' },
  ],
}

// ---- mock client ------------------------------------------------------------

function makeClient(): HasznoClient {
  return {
    agent: {
      orders: vi.fn(() => Promise.resolve([orderReceived, orderShipped])),
      products: vi.fn(),
      proposals: vi.fn(),
      createProposal: vi.fn(),
    },
    orders: {
      list: vi.fn(),
      ship: vi.fn(),
      createDemo: vi.fn(),
      receiveOrder: vi.fn(),
    },
  } as unknown as HasznoClient
}

// ---- helpers ----------------------------------------------------------------

/** Build a fresh root Command with the orders sub-commands registered. */
function buildProgram(client: HasznoClient) {
  const program = new Command()
    .name('haszno')
    .exitOverride() // throw instead of process.exit so tests can catch
    .option('--json', 'JSON output')
    .option('--api-url <url>', 'override API URL')
    .option('--api-key <key>', 'override API key')

  registerOrdersCommands(program, client)
  return program
}

/** Silence console output for a given test block. */
function silenceConsole() {
  const originalLog = console.log
  const originalError = console.error
  beforeEach(() => {
    console.log = vi.fn()
    console.error = vi.fn()
  })
  afterEach(() => {
    console.log = originalLog
    console.error = originalError
  })
}

// ---- tests ------------------------------------------------------------------

describe('orders list', () => {
  silenceConsole()

  it('calls client.agent.orders() — not client.orders.list()', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'list'])
    expect(client.agent.orders).toHaveBeenCalledOnce()
    expect(client.orders.list).not.toHaveBeenCalled()
  })

  it('--json emits JSON array to stdout', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'list'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed = JSON.parse(output)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
    writeSpy.mockRestore()
  })

  it('--status received filters the list', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'list', '--status', 'received'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed: AgentOrder[] = JSON.parse(output)
    expect(parsed.every((o) => o.status === 'received')).toBe(true)
    writeSpy.mockRestore()
  })

  it('--status shipped filters to only shipped orders', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'list', '--status', 'shipped'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed: AgentOrder[] = JSON.parse(output)
    expect(parsed.every((o) => o.status === 'shipped')).toBe(true)
    writeSpy.mockRestore()
  })

  it('invalid --status exits with code 2', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'list', '--status', 'bogus']),
    ).rejects.toThrow('exit:2')
    exitSpy.mockRestore()
  })

  it('API error exits with code 1', async () => {
    const client = makeClient()
    vi.mocked(client.agent.orders).mockRejectedValue(new Error('connection refused'))
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'list']),
    ).rejects.toThrow('exit:1')
    exitSpy.mockRestore()
  })

  it('empty list prints a friendly message', async () => {
    const client = makeClient()
    vi.mocked(client.agent.orders).mockResolvedValue([])
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'list'])
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Nincs'))
  })
})

describe('orders show', () => {
  silenceConsole()

  it('calls client.agent.orders() — not client.orders.list()', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'show', '1'])
    expect(client.agent.orders).toHaveBeenCalledOnce()
    expect(client.orders.list).not.toHaveBeenCalled()
  })

  it('finds and prints one order by ID', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'show', '1'])
    expect(console.log).toHaveBeenCalled()
  })

  it('--json emits a single AgentOrder object without address or tracking', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'show', '2'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed: AgentOrder = JSON.parse(output)
    expect(parsed.id).toBe(2)
    expect(parsed.status).toBe('shipped')
    // These fields are NOT in AgentOrder (shop token endpoint omits them)
    expect(parsed).not.toHaveProperty('trackingNumber')
    expect(parsed).not.toHaveProperty('address')
    writeSpy.mockRestore()
  })

  it('non-existent ID exits with code 1', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'show', '999']),
    ).rejects.toThrow('exit:1')
    exitSpy.mockRestore()
  })

  it('non-numeric ID exits with code 2', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'show', 'abc']),
    ).rejects.toThrow('exit:2')
    exitSpy.mockRestore()
  })
})

// ── orders ship — NOT AVAILABLE with shop token ───────────────────────────────

describe('orders ship', () => {
  silenceConsole()

  it('prints NOT_AVAILABLE message and exits 1 — does not call client.orders.ship()', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'ship', '1', '--yes']),
    ).rejects.toThrow('exit:1')
    expect(client.orders.ship).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bolt API-kulccsal'))
    exitSpy.mockRestore()
  })
})

// ── orders demo — NOT AVAILABLE with shop token ───────────────────────────────

describe('orders demo', () => {
  silenceConsole()

  it('prints NOT_AVAILABLE message and exits 1 — does not call client.orders.createDemo()', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'demo', '--yes']),
    ).rejects.toThrow('exit:1')
    expect(client.orders.createDemo).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bolt API-kulccsal'))
    exitSpy.mockRestore()
  })
})
