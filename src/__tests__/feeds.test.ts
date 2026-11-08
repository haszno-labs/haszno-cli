import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { HasznoClient } from '../client/index.js'

// ── fs mock must be declared before the module under test is imported ──────
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'node:fs/promises'
const mockReadFile = readFile as ReturnType<typeof vi.fn>

import { registerFeedsCommands } from '../commands/feeds.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(feedOverrides: Partial<HasznoClient['feeds']> = {}): HasznoClient {
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
    feeds: {
      importFeed: vi.fn(),
      importMarketPrices: vi.fn(),
      ...feedOverrides,
    },
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
    proposals: { list: vi.fn(), approve: vi.fn(), reject: vi.fn(), rollback: vi.fn() },
    automation: { get: vi.fn(), set: vi.fn() },
    network: {
      listSuppliers: vi.fn(),
      getSupplierProducts: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      sync: vi.fn(),
      getSupplierView: vi.fn(),
    },
  } as unknown as HasznoClient
}

/** Build a fresh Commander program with feeds registered. exitOverride() prevents process.exit on parse errors. */
function makeProgram(client: HasznoClient): Command {
  const program = new Command()
    .name('haszno')
    .exitOverride()
    .option('--json', 'JSON output')
    .option('--api-url <url>', 'API base URL')
    .option('--api-key <key>', 'API key')
  registerFeedsCommands(program, client)
  return program
}

/** Parse args using user-style (no executable/script prefix). */
async function run(program: Command, ...args: string[]): Promise<void> {
  await program.parseAsync(args, { from: 'user' })
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FEED_CSV = 'sku,name,price\nABC,Widget,1000\n'
const MARKET_CSV = 'sku,market_min\nABC,900\n'
const IMPORT_FEED_RESULT = { created: 3, updated: 2, total: 5 }
const IMPORT_MARKET_RESULT = { matched: 4, total: 6 }

// ---------------------------------------------------------------------------
// Tests — import-supplier
// ---------------------------------------------------------------------------

describe('feeds import-supplier', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any

  beforeEach(() => {
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    mockReadFile.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls client.feeds.importFeed with correct params when --file is given', async () => {
    const importFeed = vi.fn().mockResolvedValue(IMPORT_FEED_RESULT)
    const client = makeClient({ importFeed })
    mockReadFile.mockResolvedValue(FEED_CSV)

    const program = makeProgram(client)
    await run(
      program,
      'feeds', 'import-supplier',
      '--supplier', '7',
      '--format', 'csv',
      '--file', 'products.csv',
      '--yes',
    )

    expect(mockReadFile).toHaveBeenCalledWith('products.csv', 'utf-8')
    expect(importFeed).toHaveBeenCalledWith({
      supplierId: 7,
      format: 'csv',
      content: FEED_CSV,
    })
  })

  it('prints created/updated/total table on success', async () => {
    const importFeed = vi.fn().mockResolvedValue(IMPORT_FEED_RESULT)
    const client = makeClient({ importFeed })
    mockReadFile.mockResolvedValue(FEED_CSV)

    const program = makeProgram(client)
    await run(
      program,
      'feeds', 'import-supplier',
      '--supplier', '7',
      '--format', 'csv',
      '--file', 'products.csv',
      '--yes',
    )

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toMatch('3') // created
    expect(output).toMatch('2') // updated
    expect(output).toMatch('5') // total
  })

  it('prints JSON when --json flag is set', async () => {
    const importFeed = vi.fn().mockResolvedValue(IMPORT_FEED_RESULT)
    const client = makeClient({ importFeed })
    mockReadFile.mockResolvedValue(FEED_CSV)

    const program = makeProgram(client)
    await run(
      program,
      '--json',
      'feeds', 'import-supplier',
      '--supplier', '7',
      '--format', 'xml',
      '--file', 'feed.xml',
      '--yes',
    )

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    const parsed = JSON.parse(output)
    expect(parsed).toMatchObject(IMPORT_FEED_RESULT)
  })

  it('exits with 2 and error message when non-TTY and --yes not given', async () => {
    const importFeed = vi.fn().mockResolvedValue(IMPORT_FEED_RESULT)
    const client = makeClient({ importFeed })
    mockReadFile.mockResolvedValue(FEED_CSV)
    // ensure non-TTY (vitest stdin is never a TTY, but be explicit)
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const program = makeProgram(client)
    await run(
      program,
      'feeds', 'import-supplier',
      '--supplier', '7',
      '--format', 'csv',
      '--file', 'products.csv',
      // no --yes
    )

    expect(exitSpy).toHaveBeenCalledWith(2)
    expect(errSpy.mock.calls.some((c) => /--yes/.test(String(c[0])))).toBe(true)
    expect(importFeed).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('exits with 1 when API throws', async () => {
    const importFeed = vi.fn().mockRejectedValue(new Error('API hiba'))
    const client = makeClient({ importFeed })
    mockReadFile.mockResolvedValue(FEED_CSV)

    const program = makeProgram(client)
    await run(
      program,
      'feeds', 'import-supplier',
      '--supplier', '7',
      '--format', 'csv',
      '--file', 'products.csv',
      '--yes',
    )

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('rejects invalid --format with parse error', async () => {
    const client = makeClient()
    const program = makeProgram(client)

    await expect(
      run(program, 'feeds', 'import-supplier', '--supplier', '7', '--format', 'json', '--yes'),
    ).rejects.toThrow()
  })

  it('rejects non-numeric --supplier with parse error', async () => {
    const client = makeClient()
    const program = makeProgram(client)

    await expect(
      run(program, 'feeds', 'import-supplier', '--supplier', 'abc', '--format', 'csv', '--yes'),
    ).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests — import-market
// ---------------------------------------------------------------------------

describe('feeds import-market', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any

  beforeEach(() => {
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    mockReadFile.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls client.feeds.importMarketPrices with file content', async () => {
    const importMarketPrices = vi.fn().mockResolvedValue(IMPORT_MARKET_RESULT)
    const client = makeClient({ importMarketPrices })
    mockReadFile.mockResolvedValue(MARKET_CSV)

    const program = makeProgram(client)
    await run(program, 'feeds', 'import-market', '--file', 'prices.csv', '--yes')

    expect(mockReadFile).toHaveBeenCalledWith('prices.csv', 'utf-8')
    expect(importMarketPrices).toHaveBeenCalledWith({ content: MARKET_CSV })
  })

  it('prints matched/total table on success', async () => {
    const importMarketPrices = vi.fn().mockResolvedValue(IMPORT_MARKET_RESULT)
    const client = makeClient({ importMarketPrices })
    mockReadFile.mockResolvedValue(MARKET_CSV)

    const program = makeProgram(client)
    await run(program, 'feeds', 'import-market', '--file', 'prices.csv', '--yes')

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toMatch('4') // matched
    expect(output).toMatch('6') // total
  })

  it('prints JSON with --json', async () => {
    const importMarketPrices = vi.fn().mockResolvedValue(IMPORT_MARKET_RESULT)
    const client = makeClient({ importMarketPrices })
    mockReadFile.mockResolvedValue(MARKET_CSV)

    const program = makeProgram(client)
    await run(program, '--json', 'feeds', 'import-market', '--file', 'prices.csv', '--yes')

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    const parsed = JSON.parse(output)
    expect(parsed).toMatchObject(IMPORT_MARKET_RESULT)
  })

  it('exits with 2 without --yes in non-TTY environment', async () => {
    const importMarketPrices = vi.fn()
    const client = makeClient({ importMarketPrices })
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    const program = makeProgram(client)
    await run(program, 'feeds', 'import-market', '--file', 'prices.csv')

    expect(exitSpy).toHaveBeenCalledWith(2)
    expect(importMarketPrices).not.toHaveBeenCalled()
  })

  it('exits with 1 when API throws', async () => {
    const importMarketPrices = vi.fn().mockRejectedValue(new Error('500'))
    const client = makeClient({ importMarketPrices })
    mockReadFile.mockResolvedValue(MARKET_CSV)

    const program = makeProgram(client)
    await run(program, 'feeds', 'import-market', '--file', 'prices.csv', '--yes')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits with 1 when file read fails', async () => {
    const importMarketPrices = vi.fn()
    const client = makeClient({ importMarketPrices })
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const program = makeProgram(client)
    await run(program, 'feeds', 'import-market', '--file', 'missing.csv', '--yes')

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(importMarketPrices).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — urls
// ---------------------------------------------------------------------------

describe('feeds urls', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any

  beforeEach(() => {
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prints Árukereső and Google Shopping URLs', async () => {
    const client = makeClient()
    process.env['HASZNO_API_URL'] = 'https://test.example.com'

    const program = makeProgram(client)
    await run(program, 'feeds', 'urls')

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toContain('https://test.example.com/feed/arukereso.xml')
    expect(output).toContain('https://test.example.com/feed/google.xml')

    delete process.env['HASZNO_API_URL']
  })

  it('--api-url override takes precedence over env', async () => {
    const client = makeClient()
    process.env['HASZNO_API_URL'] = 'https://env.example.com'

    const program = makeProgram(client)
    await run(program, '--api-url', 'https://override.example.com', 'feeds', 'urls')

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    expect(output).toContain('https://override.example.com/feed/arukereso.xml')
    expect(output).not.toContain('https://env.example.com')

    delete process.env['HASZNO_API_URL']
  })

  it('--json emits a JSON array with name and url fields', async () => {
    const client = makeClient()
    process.env['HASZNO_API_URL'] = 'https://test.example.com'

    const program = makeProgram(client)
    await run(program, '--json', 'feeds', 'urls')

    const rawOutput = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    const parsed = JSON.parse(rawOutput) as Array<{ name: string; url: string }>
    expect(parsed).toHaveLength(2)
    expect(parsed[0]?.name).toBe('Árukereső')
    expect(parsed[0]?.url).toContain('/feed/arukereso.xml')
    expect(parsed[1]?.name).toBe('Google Shopping')
    expect(parsed[1]?.url).toContain('/feed/google.xml')

    delete process.env['HASZNO_API_URL']
  })

  it('trailing slash in HASZNO_API_URL is stripped', async () => {
    const client = makeClient()
    process.env['HASZNO_API_URL'] = 'https://test.example.com/'

    const program = makeProgram(client)
    await run(program, 'feeds', 'urls')

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n')
    // Should not have double slash
    expect(output).not.toContain('//feed/')
    expect(output).toContain('/feed/arukereso.xml')

    delete process.env['HASZNO_API_URL']
  })
})

// ---------------------------------------------------------------------------
// Tests — requireConfirm helper (unit)
// ---------------------------------------------------------------------------

describe('requireConfirm', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true immediately when yes=true without checking TTY', async () => {
    const { requireConfirm: fn } = await import('../commands/feeds.js')
    const result = await fn(true, 'Folytatja?')
    expect(result).toBe(true)
  })

  it('calls process.exit(2) when yes=false and not a TTY', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    const { requireConfirm: fn } = await import('../commands/feeds.js')
    await fn(false, 'Folytatja?')

    expect(exitSpy).toHaveBeenCalledWith(2)
  })
})
