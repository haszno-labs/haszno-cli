/**
 * Unit tests for packages/cli/src/commands/products.ts
 *
 * All tests use a mocked HasznoClient — no network required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cmdList,
  cmdShow,
  cmdUpdate,
  cmdListing,
  cmdApplyPrices,
  cmdDescribe,
  cmdStats,
  cmdImpact,
} from '../commands/products.js'
import type { HasznoClient, Product, Stats, Impact } from '../client/index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    supplierId: 10,
    sku: 'AUTO-001',
    name: 'Autó alkatrész',
    costNet: 1000,
    stock: 5,
    rrpGross: 2500,
    marketMinGross: 1800,
    marketShop: 'autoalkatresz.hu',
    priceGross: 1950,
    listed: true,
    trendKeyword: null,
    trendKeywordEn: null,
    updatedAt: '2024-03-15T10:00:00Z',
    supplierName: 'Auto Kft.',
    current: { priceGross: 1950, marginNet: 591, marginPct: 59.1 },
    recommended: { priceGross: 1750, marginNet: 433, marginPct: 43.3 },
    ...overrides,
  }
}

const STATS: Stats = {
  products: 42,
  losing: 3,
  overMarket: 5,
  toFix: 8,
  orders: 11,
}

const IMPACT: Impact = {
  days: 30,
  extraProfit: 15000,
  baseline: 60000,
  pctGain: 25,
  orders: 20,
  autoForwardedOrders: 14,
}

function mkClient(overrides: Partial<Record<string, unknown>> = {}): HasznoClient {
  return {
    products: {
      list: vi.fn().mockResolvedValue([mkProduct()]),
      update: vi.fn().mockResolvedValue(mkProduct({ priceGross: 1750, marketMinGross: 1700, marketShop: 'uj.hu' })),
      setListing: vi.fn().mockResolvedValue(mkProduct({ listed: false })),
      applyPrices: vi.fn().mockResolvedValue({ changed: 2, total: 5 }),
      generateAiDescription: vi.fn().mockResolvedValue({ text: 'Kiváló minőségű alkatrész.' }),
    },
    stats: {
      get: vi.fn().mockResolvedValue(STATS),
      getImpact: vi.fn().mockResolvedValue(IMPACT),
    },
    ...overrides,
  } as unknown as HasznoClient
}

/** Capture console output lines during a test. */
function captureConsole() {
  const lines: string[] = []
  const errLines: string[] = []
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    lines.push(args.map(String).join(' '))
  })
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errLines.push(args.map(String).join(' '))
  })
  return {
    lines,
    errLines,
    restore: () => { logSpy.mockRestore(); errSpy.mockRestore() },
  }
}

// ── cmdList ───────────────────────────────────────────────────────────────────

describe('cmdList', () => {
  it('calls products.list with all=undefined by default', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdList(client, {})
      expect(client.products.list).toHaveBeenCalledWith({ all: undefined })
    } finally {
      cap.restore()
    }
  })

  it('passes all=true when --all is set', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdList(client, { all: true })
      expect(client.products.list).toHaveBeenCalledWith({ all: true })
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON array when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdList(client, { json: true })
      expect(cap.lines).toHaveLength(1)
      const parsed = JSON.parse(cap.lines[0]!)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0].sku).toBe('AUTO-001')
    } finally {
      cap.restore()
    }
  })

  it('filters losing products when --losing is set', async () => {
    const products = [
      mkProduct({ id: 1, current: { priceGross: 900, marginNet: -81, marginPct: -9 } }),
      mkProduct({ id: 2, current: { priceGross: 1950, marginNet: 591, marginPct: 59.1 } }),
    ]
    const client = mkClient()
    vi.mocked(client.products.list).mockResolvedValue(products)
    const cap = captureConsole()
    try {
      await cmdList(client, { losing: true, json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].id).toBe(1)
    } finally {
      cap.restore()
    }
  })

  it('filters over-market products when --over-market is set', async () => {
    const products = [
      mkProduct({ id: 1, priceGross: 2000, marketMinGross: 1800 }), // over market
      mkProduct({ id: 2, priceGross: 1600, marketMinGross: 1800 }), // under market
      mkProduct({ id: 3, marketMinGross: null }),                     // no market data
    ]
    const client = mkClient()
    vi.mocked(client.products.list).mockResolvedValue(products)
    const cap = captureConsole()
    try {
      await cmdList(client, { overMarket: true, json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].id).toBe(1)
    } finally {
      cap.restore()
    }
  })

  it('filters by --cats supplier name substring (case-insensitive)', async () => {
    const products = [
      mkProduct({ id: 1, supplierName: 'Auto Kft.' }),
      mkProduct({ id: 2, supplierName: 'Kert Zrt.' }),
      mkProduct({ id: 3, supplierName: 'Elektronika Kft.' }),
    ]
    const client = mkClient()
    vi.mocked(client.products.list).mockResolvedValue(products)
    const cap = captureConsole()
    try {
      await cmdList(client, { cats: 'auto,kert', json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed).toHaveLength(2)
      const ids = parsed.map((p: Product) => p.id).sort()
      expect(ids).toEqual([1, 2])
    } finally {
      cap.restore()
    }
  })

  it('prints "Nincs találat." when filtered list is empty', async () => {
    const client = mkClient()
    vi.mocked(client.products.list).mockResolvedValue([])
    const cap = captureConsole()
    try {
      await cmdList(client, {})
      expect(cap.lines.some(l => l.includes('Nincs találat.'))).toBe(true)
    } finally {
      cap.restore()
    }
  })

  it('renders a human table with product count line', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdList(client, {})
      const output = cap.lines.join('\n')
      expect(output).toContain('AUTO-001')
      expect(output).toContain('Autó alkatrész')
      expect(output).toMatch(/1 termék/)
    } finally {
      cap.restore()
    }
  })
})

// ── cmdShow ───────────────────────────────────────────────────────────────────

describe('cmdShow', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints product detail for a known ID', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdShow(client, 1, {})
      const output = cap.lines.join('\n')
      expect(output).toContain('AUTO-001')
      expect(output).toContain('Auto Kft.')
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdShow(client, 1, { json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.id).toBe(1)
      expect(parsed.sku).toBe('AUTO-001')
    } finally {
      cap.restore()
    }
  })

  it('sets exitCode=1 and logs error for unknown ID', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdShow(client, 999, {})
      expect(cap.errLines.some(l => l.includes('999'))).toBe(true)
      expect(process.exitCode).toBe(1)
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })

  it('calls products.list with all=true to include unlisted products', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdShow(client, 1, {})
      expect(client.products.list).toHaveBeenCalledWith({ all: true })
    } finally {
      cap.restore()
    }
  })
})

// ── cmdUpdate ─────────────────────────────────────────────────────────────────

describe('cmdUpdate', () => {
  afterEach(() => { process.exitCode = 0 })

  it('calls products.update with numeric priceGross', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdUpdate(client, 1, { price: '1750', yes: true })
      expect(client.products.update).toHaveBeenCalledWith(1, { priceGross: 1750 })
    } finally {
      cap.restore()
    }
  })

  it('calls products.update with marketMinGross=null when "null" passed', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdUpdate(client, 1, { marketMin: 'null', yes: true })
      expect(client.products.update).toHaveBeenCalledWith(1, { marketMinGross: null })
    } finally {
      cap.restore()
    }
  })

  it('calls products.update with marketShop', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdUpdate(client, 1, { marketShop: 'valami.hu', yes: true })
      expect(client.products.update).toHaveBeenCalledWith(1, { marketShop: 'valami.hu' })
    } finally {
      cap.restore()
    }
  })

  it('sets exitCode=2 when no field supplied', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdUpdate(client, 1, { yes: true })
      expect(process.exitCode).toBe(2)
      expect(client.products.update).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })

  it('aborts without calling update when confirm resolves false', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdUpdate(client, 1, { price: '1750', confirm: () => Promise.resolve(false) })
      expect(client.products.update).not.toHaveBeenCalled()
      expect(cap.lines.some(l => l.includes('Megszakítva.'))).toBe(true)
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON on success when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdUpdate(client, 1, { price: '1750', yes: true, json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.id).toBe(1)
    } finally {
      cap.restore()
    }
  })
})

// ── cmdListing ────────────────────────────────────────────────────────────────

describe('cmdListing', () => {
  afterEach(() => { process.exitCode = 0 })

  it('calls setListing with listed=false when --off', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdListing(client, 1, { off: true, yes: true })
      expect(client.products.setListing).toHaveBeenCalledWith(1, { listed: false })
    } finally {
      cap.restore()
    }
  })

  it('calls setListing with listed=true when --on', async () => {
    const client = mkClient()
    vi.mocked(client.products.setListing).mockResolvedValue(mkProduct({ listed: true }))
    const cap = captureConsole()
    try {
      await cmdListing(client, 1, { on: true, yes: true })
      expect(client.products.setListing).toHaveBeenCalledWith(1, { listed: true })
    } finally {
      cap.restore()
    }
  })

  it('sets exitCode=2 when neither --on nor --off given', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdListing(client, 1, { yes: true })
      expect(process.exitCode).toBe(2)
      expect(client.products.setListing).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })

  it('aborts when confirm resolves false', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdListing(client, 1, { off: true, confirm: () => Promise.resolve(false) })
      expect(client.products.setListing).not.toHaveBeenCalled()
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdListing(client, 1, { off: true, yes: true, json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.listed).toBe(false)
    } finally {
      cap.restore()
    }
  })
})

// ── cmdApplyPrices ────────────────────────────────────────────────────────────

describe('cmdApplyPrices', () => {
  it('calls applyPrices with no body when --ids not given', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdApplyPrices(client, { yes: true })
      expect(client.products.applyPrices).toHaveBeenCalledWith(undefined)
    } finally {
      cap.restore()
    }
  })

  it('calls applyPrices with ids parsed from comma-separated string', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdApplyPrices(client, { ids: '12,34, 56', yes: true })
      expect(client.products.applyPrices).toHaveBeenCalledWith({ ids: [12, 34, 56] })
    } finally {
      cap.restore()
    }
  })

  it('aborts when confirm resolves false', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdApplyPrices(client, { confirm: () => Promise.resolve(false) })
      expect(client.products.applyPrices).not.toHaveBeenCalled()
    } finally {
      cap.restore()
    }
  })

  it('prints change summary in human mode', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdApplyPrices(client, { yes: true })
      expect(cap.lines.some(l => l.includes('2/5'))).toBe(true)
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdApplyPrices(client, { yes: true, json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.changed).toBe(2)
      expect(parsed.total).toBe(5)
    } finally {
      cap.restore()
    }
  })
})

// ── cmdDescribe ───────────────────────────────────────────────────────────────

describe('cmdDescribe', () => {
  it('calls generateAiDescription with the given id', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdDescribe(client, 7, { yes: true })
      expect(client.products.generateAiDescription).toHaveBeenCalledWith(7)
    } finally {
      cap.restore()
    }
  })

  it('prints the generated text in human mode', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdDescribe(client, 7, { yes: true })
      expect(cap.lines.some(l => l.includes('Kiváló'))).toBe(true)
    } finally {
      cap.restore()
    }
  })

  it('aborts when confirm resolves false', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdDescribe(client, 7, { confirm: () => Promise.resolve(false) })
      expect(client.products.generateAiDescription).not.toHaveBeenCalled()
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdDescribe(client, 7, { yes: true, json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.text).toBeTruthy()
    } finally {
      cap.restore()
    }
  })
})

// ── cmdStats ──────────────────────────────────────────────────────────────────

describe('cmdStats', () => {
  it('calls stats.get()', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdStats(client, {})
      expect(client.stats.get).toHaveBeenCalled()
    } finally {
      cap.restore()
    }
  })

  it('prints all five stat lines in human mode', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdStats(client, {})
      const output = cap.lines.join('\n')
      expect(output).toContain('42')   // products
      expect(output).toContain('3')    // losing
      expect(output).toContain('5')    // overMarket
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdStats(client, { json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.products).toBe(42)
      expect(parsed.losing).toBe(3)
    } finally {
      cap.restore()
    }
  })
})

// ── cmdImpact ─────────────────────────────────────────────────────────────────

describe('cmdImpact', () => {
  it('calls stats.getImpact with no params when --days not given', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdImpact(client, {})
      expect(client.stats.getImpact).toHaveBeenCalledWith(undefined)
    } finally {
      cap.restore()
    }
  })

  it('passes days param when --days is provided', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdImpact(client, { days: '7' })
      expect(client.stats.getImpact).toHaveBeenCalledWith({ days: 7 })
    } finally {
      cap.restore()
    }
  })

  it('prints Haszon-mérő header in human mode', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdImpact(client, {})
      expect(cap.lines.some(l => l.includes('Haszon-mérő'))).toBe(true)
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON when json=true', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdImpact(client, { json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed.days).toBe(30)
      expect(parsed.extraProfit).toBe(15000)
      expect(parsed.pctGain).toBe(25)
    } finally {
      cap.restore()
    }
  })
})
