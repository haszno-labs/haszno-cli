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
import type { HasznoClient, AgentProduct, Stats, Impact } from '../client/index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkProduct(overrides: Partial<AgentProduct> = {}): AgentProduct {
  return {
    id: 1,
    sku: 'AUTO-001',
    name: 'Autó alkatrész',
    stock: 5,
    priceGross: 1950,
    listed: true,
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
      list: vi.fn(),
      update: vi.fn(),
      setListing: vi.fn(),
      applyPrices: vi.fn(),
      generateAiDescription: vi.fn(),
    },
    stats: {
      get: vi.fn().mockResolvedValue(STATS),
      getImpact: vi.fn().mockResolvedValue(IMPACT),
    },
    agent: {
      products: vi.fn().mockResolvedValue([mkProduct()]),
      orders: vi.fn().mockResolvedValue([]),
      proposals: vi.fn().mockResolvedValue([]),
      createProposal: vi.fn(),
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
  it('calls client.agent.products() — not client.products.list()', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdList(client, {})
      expect(client.agent.products).toHaveBeenCalledOnce()
      expect(client.products.list).not.toHaveBeenCalled()
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
    vi.mocked(client.agent.products).mockResolvedValue(products)
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

  it('filters by --cats supplier name substring (case-insensitive)', async () => {
    const products = [
      mkProduct({ id: 1, supplierName: 'Auto Kft.' }),
      mkProduct({ id: 2, supplierName: 'Kert Zrt.' }),
      mkProduct({ id: 3, supplierName: 'Elektronika Kft.' }),
    ]
    const client = mkClient()
    vi.mocked(client.agent.products).mockResolvedValue(products)
    const cap = captureConsole()
    try {
      await cmdList(client, { cats: 'auto,kert', json: true })
      const parsed = JSON.parse(cap.lines[0]!)
      expect(parsed).toHaveLength(2)
      const ids = parsed.map((p: AgentProduct) => p.id).sort()
      expect(ids).toEqual([1, 2])
    } finally {
      cap.restore()
    }
  })

  it('prints "Nincs találat." when filtered list is empty', async () => {
    const client = mkClient()
    vi.mocked(client.agent.products).mockResolvedValue([])
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

  it('calls client.agent.products() — not client.products.list()', async () => {
    const client = mkClient()
    const cap = captureConsole()
    try {
      await cmdShow(client, 1, {})
      expect(client.agent.products).toHaveBeenCalledOnce()
      expect(client.products.list).not.toHaveBeenCalled()
    } finally {
      cap.restore()
    }
  })

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
})

// ── cmdUpdate — NOT AVAILABLE with shop token ─────────────────────────────────

describe('cmdUpdate', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints NOT_AVAILABLE message and sets exitCode=1 — does not call client', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdUpdate(client, 1, { price: '1750', yes: true })
      expect(cap.errLines.some(l => l.includes('bolt API-kulccsal'))).toBe(true)
      expect(process.exitCode).toBe(1)
      expect(client.products.update).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })
})

// ── cmdListing — NOT AVAILABLE with shop token ────────────────────────────────

describe('cmdListing', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints NOT_AVAILABLE message and sets exitCode=1 — does not call client', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdListing(client, 1, { off: true, yes: true })
      expect(cap.errLines.some(l => l.includes('bolt API-kulccsal'))).toBe(true)
      expect(process.exitCode).toBe(1)
      expect(client.products.setListing).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })
})

// ── cmdApplyPrices — NOT AVAILABLE with shop token ────────────────────────────

describe('cmdApplyPrices', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints NOT_AVAILABLE message and sets exitCode=1 — does not call client', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdApplyPrices(client, { yes: true })
      expect(cap.errLines.some(l => l.includes('bolt API-kulccsal'))).toBe(true)
      expect(process.exitCode).toBe(1)
      expect(client.products.applyPrices).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })
})

// ── cmdDescribe — NOT AVAILABLE with shop token ───────────────────────────────

describe('cmdDescribe', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints NOT_AVAILABLE message and sets exitCode=1 — does not call client', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdDescribe(client, 7, { yes: true })
      expect(cap.errLines.some(l => l.includes('bolt API-kulccsal'))).toBe(true)
      expect(process.exitCode).toBe(1)
      expect(client.products.generateAiDescription).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })
})

// ── cmdStats — NOT AVAILABLE with shop token ──────────────────────────────────

describe('cmdStats', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints NOT_AVAILABLE message and sets exitCode=1 — does not call client', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdStats(client, {})
      expect(cap.errLines.some(l => l.includes('bolt API-kulccsal'))).toBe(true)
      expect(process.exitCode).toBe(1)
      expect(client.stats.get).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })
})

// ── cmdImpact — NOT AVAILABLE with shop token ─────────────────────────────────

describe('cmdImpact', () => {
  afterEach(() => { process.exitCode = 0 })

  it('prints NOT_AVAILABLE message and sets exitCode=1 — does not call client', async () => {
    const client = mkClient()
    const cap = captureConsole()
    const prevCode = process.exitCode
    try {
      await cmdImpact(client, {})
      expect(cap.errLines.some(l => l.includes('bolt API-kulccsal'))).toBe(true)
      expect(process.exitCode).toBe(1)
      expect(client.stats.getImpact).not.toHaveBeenCalled()
    } finally {
      cap.restore()
      process.exitCode = prevCode as number | undefined
    }
  })
})
