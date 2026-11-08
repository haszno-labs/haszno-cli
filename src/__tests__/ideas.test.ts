/**
 * Tests for packages/cli/src/commands/ideas.ts
 *
 * Uses a mocked HasznoClient — no network calls.
 * Tests cover:
 *   - ideas list (success, json, filters: min-score / supplier / limit, error path)
 *   - ideas fill-keywords (--yes confirms, missing --yes exits 0, API error exits 1)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type { HasznoClient, Recommendations } from '../client/index.js'
import { registerIdeasCommands } from '../commands/ideas.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_RECS: Recommendations = {
  anchor: '2024-W22',
  geo: 'HU',
  items: [
    {
      id: 1,
      sku: 'SKU-001',
      name: 'Kerékpáros sisak XL',
      costNet: 4000,
      stock: 20,
      supplierName: 'BikeWorld',
      recommended: { priceGross: 8990, marginNet: 1890, marginPct: 24.3 },
      trendScore: 82,
    },
    {
      id: 2,
      sku: 'SKU-002',
      name: 'Túrázó hátizsák 40L',
      costNet: 9000,
      stock: 5,
      supplierName: 'OutdoorPro',
      recommended: { priceGross: 18990, marginNet: 3800, marginPct: 21.0 },
      trendScore: 60,
    },
    {
      id: 3,
      sku: 'SKU-003',
      name: 'Vízálló térkép tok',
      costNet: 1200,
      stock: 100,
      supplierName: 'BikeWorld',
      recommended: { priceGross: 2990, marginNet: 460, marginPct: 17.5 },
      // no trendScore → undefined
    },
  ],
}

function makeClient(overrides?: Partial<HasznoClient['recommendations']>): HasznoClient {
  return {
    recommendations: {
      get: vi.fn(() => Promise.resolve(SAMPLE_RECS)),
      fillTrendKeywords: vi.fn(() => Promise.resolve({ updated: 7 })),
      ...overrides,
    },
  } as unknown as HasznoClient
}

/** Build a fresh root Command with the ideas sub-commands registered. */
function makeProgram(opts: { json?: boolean } = {}): { program: Command; client: HasznoClient } {
  const client = makeClient()
  const program = new Command()
    .exitOverride() // throw instead of process.exit so tests can catch
    .option('--json', 'output JSON')

  if (opts.json) {
    // Pre-set the flag so isJson() sees it
    program.setOptionValue('json', true)
  }

  registerIdeasCommands(program, client)
  return { program, client }
}

// ---------------------------------------------------------------------------
// Capture console output
// ---------------------------------------------------------------------------

function captureOutput(): { lines: () => string[]; restore: () => void } {
  const buf: string[] = []
  const orig = console.log
  console.log = (...args: unknown[]) => {
    buf.push(args.map(String).join(' '))
  }
  return {
    lines: () => buf,
    restore: () => {
      console.log = orig
    },
  }
}

function captureError(): { lines: () => string[]; restore: () => void } {
  const buf: string[] = []
  const orig = console.error
  console.error = (...args: unknown[]) => {
    buf.push(args.map(String).join(' '))
  }
  return {
    lines: () => buf,
    restore: () => {
      console.error = orig
    },
  }
}

// ---------------------------------------------------------------------------
// ideas list — basic success
// ---------------------------------------------------------------------------

describe('ideas list', () => {
  it('calls client.recommendations.get() and prints a table', async () => {
    const { program, client } = makeProgram()
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list'])
    } finally {
      out.restore()
    }
    expect(client.recommendations.get).toHaveBeenCalledOnce()
    const all = out.lines().join('\n')
    expect(all).toContain('SKU-001')
    expect(all).toContain('BikeWorld')
    expect(all).toContain('82')
  })

  it('--json emits valid JSON with all fields', async () => {
    const { program, client } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list'])
    } finally {
      out.restore()
    }
    expect(client.recommendations.get).toHaveBeenCalledOnce()
    const payload = JSON.parse(out.lines().join(''))
    expect(payload.anchor).toBe('2024-W22')
    expect(payload.geo).toBe('HU')
    expect(payload.total).toBe(3)
    expect(payload.items[0].sku).toBe('SKU-001')
    expect(typeof payload.items[0].suggestedPriceGross).toBe('number')
    expect(typeof payload.items[0].marginPct).toBe('number')
  })

  it('sorts by trendScore DESC', async () => {
    const { program } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list'])
    } finally {
      out.restore()
    }
    const payload = JSON.parse(out.lines().join(''))
    // SKU-001 (trendScore 82) must be before SKU-002 (60) before SKU-003 (undefined/0)
    expect(payload.items[0].sku).toBe('SKU-001')
    expect(payload.items[1].sku).toBe('SKU-002')
    expect(payload.items[2].sku).toBe('SKU-003')
  })

  it('--min-score filters out low-score items', async () => {
    const { program } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list', '--min-score', '70'])
    } finally {
      out.restore()
    }
    const payload = JSON.parse(out.lines().join(''))
    expect(payload.filtered).toBe(1)
    expect(payload.items[0].sku).toBe('SKU-001')
  })

  it('--supplier filters by supplier name (case-insensitive partial match)', async () => {
    const { program } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list', '--supplier', 'outdoor'])
    } finally {
      out.restore()
    }
    const payload = JSON.parse(out.lines().join(''))
    expect(payload.filtered).toBe(1)
    expect(payload.items[0].sku).toBe('SKU-002')
  })

  it('--limit restricts results', async () => {
    const { program } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list', '--limit', '2'])
    } finally {
      out.restore()
    }
    const payload = JSON.parse(out.lines().join(''))
    expect(payload.items).toHaveLength(2)
  })

  it('combined filters: --min-score + --supplier + --limit', async () => {
    const { program } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync([
        'node', 'haszno', 'ideas', 'list',
        '--min-score', '50',
        '--supplier', 'bikeworld',
        '--limit', '1',
      ])
    } finally {
      out.restore()
    }
    const payload = JSON.parse(out.lines().join(''))
    // BikeWorld items with trendScore >= 50: only SKU-001 (82). SKU-003 has no trendScore (0 < 50).
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].sku).toBe('SKU-001')
  })

  it('API error exits with code 1 and prints error', async () => {
    const client = makeClient({
      get: vi.fn(() => Promise.reject(new Error('server error'))),
    })
    const program = new Command()
      .exitOverride()
      .option('--json')
    registerIdeasCommands(program, client)

    const err = captureError()
    let exitCode: number | undefined
    const origExit = process.exit
    process.exit = ((code: number) => { exitCode = code; throw new Error(`exit:${code}`) }) as typeof process.exit
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list'])
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit
      err.restore()
    }
    expect(exitCode).toBe(1)
    expect(err.lines().join('')).toContain('server error')
  })

  it('--json API error emits JSON error object', async () => {
    const client = makeClient({
      get: vi.fn(() => Promise.reject(new Error('oops'))),
    })
    const program = new Command()
      .exitOverride()
      .option('--json')
    program.setOptionValue('json', true)
    registerIdeasCommands(program, client)

    const err = captureError()
    let exitCode: number | undefined
    const origExit = process.exit
    process.exit = ((code: number) => { exitCode = code; throw new Error(`exit:${code}`) }) as typeof process.exit
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'list'])
    } catch {
      // expected
    } finally {
      process.exit = origExit
      err.restore()
    }
    expect(exitCode).toBe(1)
    const errLines = err.lines().join('')
    const parsed = JSON.parse(errLines)
    expect(parsed.error).toContain('oops')
  })
})

// ---------------------------------------------------------------------------
// ideas fill-keywords
// ---------------------------------------------------------------------------

describe('ideas fill-keywords', () => {
  it('--yes calls client.recommendations.fillTrendKeywords() and prints result', async () => {
    const { program, client } = makeProgram()
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'fill-keywords', '--yes'])
    } finally {
      out.restore()
    }
    expect(client.recommendations.fillTrendKeywords).toHaveBeenCalledOnce()
    expect(out.lines().join('')).toContain('7')
  })

  it('--yes --json emits JSON with updated count', async () => {
    const { program, client } = makeProgram({ json: true })
    const out = captureOutput()
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'fill-keywords', '--yes'])
    } finally {
      out.restore()
    }
    expect(client.recommendations.fillTrendKeywords).toHaveBeenCalledOnce()
    const payload = JSON.parse(out.lines().join(''))
    expect(payload.updated).toBe(7)
  })

  it('without --yes in --json mode exits 0 and does NOT call API', async () => {
    // In json mode there is no TTY confirm — it must abort without calling the API.
    const { program, client } = makeProgram({ json: true })
    const err = captureError()
    let exitCode: number | undefined
    const origExit = process.exit
    process.exit = ((code: number) => { exitCode = code; throw new Error(`exit:${code}`) }) as typeof process.exit
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'fill-keywords'])
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit
      err.restore()
    }
    expect(exitCode).toBe(0)
    expect(client.recommendations.fillTrendKeywords).not.toHaveBeenCalled()
  })

  it('API error exits 1 and prints error message', async () => {
    const client = makeClient({
      fillTrendKeywords: vi.fn(() => Promise.reject(new Error('AI quota exceeded'))),
    })
    const program = new Command()
      .exitOverride()
      .option('--json')
    registerIdeasCommands(program, client)

    const err = captureError()
    let exitCode: number | undefined
    const origExit = process.exit
    process.exit = ((code: number) => { exitCode = code; throw new Error(`exit:${code}`) }) as typeof process.exit
    try {
      await program.parseAsync(['node', 'haszno', 'ideas', 'fill-keywords', '--yes'])
    } catch {
      // expected
    } finally {
      process.exit = origExit
      err.restore()
    }
    expect(exitCode).toBe(1)
    expect(err.lines().join('')).toContain('AI quota exceeded')
  })
})
