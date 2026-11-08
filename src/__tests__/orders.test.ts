import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { HasznoClient, Order } from '../client/index.js'
import { registerOrdersCommands } from '../commands/orders.js'

// ---- fixtures ---------------------------------------------------------------

const orderReceived: Order = {
  id: 1,
  externalId: 'EXT-001',
  customerName: 'Kiss Péter',
  address: '1234 Budapest, Fő utca 1.',
  status: 'received',
  supplierOrderId: null,
  trackingNumber: null,
  totalGross: 25000,
  events: [{ at: '2024-01-15T10:00:00Z', text: 'Rendelés megérkezett' }],
  createdAt: '2024-01-15T10:00:00Z',
  items: [
    { orderId: 1, qty: 2, priceGross: 12500, name: 'Teszt Termék', sku: 'SKU-001' },
  ],
}

const orderShipped: Order = {
  id: 2,
  externalId: 'EXT-002',
  customerName: 'Nagy Anna',
  address: '5678 Győr, Kossuth tér 5.',
  status: 'shipped',
  supplierOrderId: 'SUPP-42',
  trackingNumber: 'TRK123456',
  totalGross: 8900,
  events: [
    { at: '2024-01-16T09:00:00Z', text: 'Rendelés megérkezett' },
    { at: '2024-01-16T14:00:00Z', text: 'Továbbítva a szállítóhoz' },
    { at: '2024-01-17T08:00:00Z', text: 'Feladva' },
  ],
  createdAt: '2024-01-16T09:00:00Z',
  items: [
    { orderId: 2, qty: 1, priceGross: 8900, name: 'Másik Termék', sku: 'SKU-002' },
  ],
}

// ---- mock client ------------------------------------------------------------

function makeClient(overrides: Partial<HasznoClient['orders']> = {}): HasznoClient {
  return {
    orders: {
      list: vi.fn(() => Promise.resolve([orderReceived, orderShipped])),
      ship: vi.fn((id: number) =>
        Promise.resolve({ ...orderReceived, id, status: 'shipped' as const }),
      ),
      createDemo: vi.fn(() => Promise.resolve({ id: 99 })),
      receiveOrder: vi.fn(() => Promise.resolve({ id: 100 })),
      ...overrides,
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

  it('calls client.orders.list() and prints a table by default', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'list'])
    expect(client.orders.list).toHaveBeenCalledOnce()
    expect(console.log).toHaveBeenCalled()
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
    const parsed: Order[] = JSON.parse(output)
    expect(parsed.every((o) => o.status === 'received')).toBe(true)
    writeSpy.mockRestore()
  })

  it('--status shipped filters to only shipped orders', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'list', '--status', 'shipped'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed: Order[] = JSON.parse(output)
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
    const client = makeClient({
      list: vi.fn(() => Promise.reject(new Error('connection refused'))),
    })
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'list']),
    ).rejects.toThrow('exit:1')
    exitSpy.mockRestore()
  })

  it('empty list prints a friendly message', async () => {
    const client = makeClient({ list: vi.fn(() => Promise.resolve([])) })
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'list'])
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Nincs'))
  })
})

describe('orders show', () => {
  silenceConsole()

  it('finds and prints one order by ID', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'show', '1'])
    expect(client.orders.list).toHaveBeenCalledOnce()
    expect(console.log).toHaveBeenCalled()
  })

  it('--json emits a single Order object', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'show', '2'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed: Order = JSON.parse(output)
    expect(parsed.id).toBe(2)
    expect(parsed.trackingNumber).toBe('TRK123456')
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

describe('orders ship', () => {
  silenceConsole()

  it('calls client.orders.ship() with --yes flag', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'ship', '1', '--yes'])
    expect(client.orders.ship).toHaveBeenCalledWith(1)
  })

  it('--json emits the updated order', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'ship', '1', '--yes'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed: Order = JSON.parse(output)
    expect(parsed.status).toBe('shipped')
    writeSpy.mockRestore()
  })

  it('API error exits with code 1', async () => {
    const client = makeClient({
      ship: vi.fn(() => Promise.reject(new Error('server error'))),
    })
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'ship', '1', '--yes']),
    ).rejects.toThrow('exit:1')
    exitSpy.mockRestore()
  })

  it('non-numeric ID exits with code 2', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'ship', 'abc', '--yes']),
    ).rejects.toThrow('exit:2')
    exitSpy.mockRestore()
  })

  it('without --yes in non-TTY env cancels without calling ship()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    const client = makeClient()
    const program = buildProgram(client)
    // process.exit(0) = clean exit; mock it so test doesn't hang
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'ship', '1']),
    ).rejects.toThrow('exit:0')
    expect(client.orders.ship).not.toHaveBeenCalled()
    exitSpy.mockRestore()
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  })
})

describe('orders demo', () => {
  silenceConsole()

  it('calls client.orders.createDemo() with --yes flag', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    await program.parseAsync(['node', 'haszno', 'orders', 'demo', '--yes'])
    expect(client.orders.createDemo).toHaveBeenCalledOnce()
  })

  it('--json emits the created order id', async () => {
    const client = makeClient()
    const program = buildProgram(client)
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await program.parseAsync(['node', 'haszno', '--json', 'orders', 'demo', '--yes'])
    const output = writeSpy.mock.calls.map(([s]) => s).join('')
    const parsed = JSON.parse(output)
    expect(parsed.id).toBe(99)
    writeSpy.mockRestore()
  })

  it('API error exits with code 1', async () => {
    const client = makeClient({
      createDemo: vi.fn(() => Promise.reject(new Error('demo not available'))),
    })
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'demo', '--yes']),
    ).rejects.toThrow('exit:1')
    exitSpy.mockRestore()
  })

  it('without --yes in non-TTY env cancels without calling createDemo()', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    const client = makeClient()
    const program = buildProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => { throw new Error(`exit:${_code}`) })
    await expect(
      program.parseAsync(['node', 'haszno', 'orders', 'demo']),
    ).rejects.toThrow('exit:0')
    expect(client.orders.createDemo).not.toHaveBeenCalled()
    exitSpy.mockRestore()
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  })
})
