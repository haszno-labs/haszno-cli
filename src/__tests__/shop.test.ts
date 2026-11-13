/**
 * Tests for `haszno shop` commands and `haszno login`/`logout`/`whoami`.
 *
 * Verifies:
 *  1. URL + method + body for each shop command
 *  2. Multipart image upload (uploadShopImage)
 *  3. --dry-run does not send a network request
 *  4. haszno login stores the token and never logs it unless --show-token
 *  5. haszno logout removes the token from config
 *  6. haszno whoami reads from config
 *  7. Error mapping: 401, 403, 404, 409, 429 surface server message
 *
 * No live network calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { createShopClient, cliLogin, uploadShopImage } from '../client/shop.js'
import { registerShopCommands } from '../commands/shop.js'
import { registerAccountCommands, writeConfigFile, readConfigFile } from '../commands/account.js'
import type { HasznoClient } from '../client/index.js'
import { HasznoApiError } from '../client/index.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

type FetchCall = { url: string; init: RequestInit }

function makeFetch(status: number, body: unknown): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { fn, calls }
}

const BASE = 'https://haszno.com'
const TOKEN = 'haszno_testtoken123'
const noConfig = () => ({})

/** Minimal HasznoClient stub for account command registration. */
function makeStubClient(): HasznoClient {
  return {
    health: { check: vi.fn().mockResolvedValue({ ok: true }) },
    settings: { get: vi.fn().mockResolvedValue({ undercutPct: 2, minMarginPct: 10, vatPct: 27, automationPaused: false }), update: vi.fn() },
    stats: { get: vi.fn().mockResolvedValue({ products: 0, losing: 0, overMarket: 0, toFix: 0, orders: 0 }), getImpact: vi.fn() },
    suppliers: { list: vi.fn().mockResolvedValue([]) },
    feeds: { importFeed: vi.fn(), importMarketPrices: vi.fn() },
    orders: { list: vi.fn().mockResolvedValue([]), receiveOrder: vi.fn(), ship: vi.fn(), createDemo: vi.fn() },
    recommendations: { get: vi.fn(), getAiShortlist: vi.fn(), fillTrendKeywords: vi.fn() },
    rules: { listTemplates: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), run: vi.fn(), runAll: vi.fn(), trigger: vi.fn(), listRuns: vi.fn(), undoUnlists: vi.fn() },
    proposals: { list: vi.fn().mockResolvedValue([]), approve: vi.fn(), reject: vi.fn(), rollback: vi.fn(), propose: vi.fn() },
    automation: { get: vi.fn(), set: vi.fn() },
    network: { listSuppliers: vi.fn(), getSupplierProducts: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), sync: vi.fn(), getSupplierView: vi.fn() },
    catalogue: { search: vi.fn() },
    importList: { list: vi.fn(), add: vi.fn(), push: vi.fn() },
    connections: { list: vi.fn(), get: vi.fn() },
    peers: { createInvite: vi.fn(), listInvites: vi.fn(), revokeInvite: vi.fn(), acceptInvite: vi.fn(), listLinks: vi.fn(), removeLink: vi.fn(), setVisibility: vi.fn() },
    blog: { list: vi.fn(), get: vi.fn() },
  } as unknown as HasznoClient
}

function buildShopProgram(shopClient: ReturnType<typeof createShopClient>) {
  const prog = new Command().name('haszno').option('--json').exitOverride()
  registerShopCommands(prog, shopClient)
  return prog
}

function captureOutput() {
  const out: string[] = []
  const err: string[] = []
  const spyOut = vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out.push(String(s)); return true })
  const spyErr = vi.spyOn(process.stderr, 'write').mockImplementation((s) => { err.push(String(s)); return true })
  return {
    out,
    err,
    text() { return out.join('') },
    errText() { return err.join('') },
    restore() { spyOut.mockRestore(); spyErr.mockRestore() },
  }
}

function mockExit() {
  return vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called')
  }) as typeof process.exit)
}

// ── shop categories ───────────────────────────────────────────────────────────

describe('haszno shop categories', () => {
  it('calls GET /api/v1/shop/categories', async () => {
    const { fn, calls } = makeFetch(200, [{ id: 'elekt', name: 'Elektronika', subcategories: [] }])
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'categories'], { from: 'user' })
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/categories`)
      expect(calls[0].init.method).toBe('GET')
      expect(cap.text()).toContain('Elektronika')
    } finally { cap.restore() }
  })

  it('outputs JSON with --json', async () => {
    const data = [{ id: 'elekt', name: 'Elektronika', subcategories: [] }]
    const { fn } = makeFetch(200, data)
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['--json', 'shop', 'categories'], { from: 'user' })
      expect(JSON.parse(cap.text())).toEqual(data)
    } finally { cap.restore() }
  })
})

// ── shop search ───────────────────────────────────────────────────────────────

describe('haszno shop search', () => {
  it('calls GET /api/v1/shop/ads with query params', async () => {
    const { fn, calls } = makeFetch(200, { items: [], total: 0 })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(
        ['shop', 'search', 'kerékpár', '--category', 'sport', '--min-price', '5000', '--page', '2'],
        { from: 'user' },
      )
      expect(calls[0].url).toContain('/api/v1/shop/ads')
      expect(calls[0].url).toContain('q=ker%C3%A9kp%C3%A1r')
      expect(calls[0].url).toContain('category=sport')
      expect(calls[0].url).toContain('minPrice=5000')
      expect(calls[0].url).toContain('page=2')
      expect(calls[0].init.method).toBe('GET')
    } finally { cap.restore() }
  })

  it('outputs "Nincs találat." when items is empty', async () => {
    const { fn } = makeFetch(200, { items: [], total: 0 })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'search'], { from: 'user' })
      expect(cap.text()).toContain('Nincs találat.')
    } finally { cap.restore() }
  })
})

// ── shop show ─────────────────────────────────────────────────────────────────

describe('haszno shop show', () => {
  it('calls GET /api/v1/shop/ads/:id', async () => {
    const ad = { id: 42, title: 'Bicikli', priceGross: 25000, negotiable: true, status: 'aktiv', reserved: false, description: null, condition: 'jó', county: 'Pest', city: 'Budapest', images: [], attributes: {} }
    const { fn, calls } = makeFetch(200, ad)
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'show', '42'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/ads/42`)
      expect(calls[0].init.method).toBe('GET')
      expect(cap.text()).toContain('Bicikli')
      expect(cap.text()).toContain('25')
    } finally { cap.restore() }
  })

  it('exits 2 on non-numeric id', async () => {
    const { fn } = makeFetch(200, {})
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildShopProgram(sc).parseAsync(['shop', 'show', 'abc'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally { cap.restore(); exitSpy.mockRestore() }
  })
})

// ── shop price-hint ───────────────────────────────────────────────────────────

describe('haszno shop price-hint', () => {
  it('calls GET /api/v1/shop/price-hint', async () => {
    const hint = { categoryId: 'sport', subcategoryId: null, suggestedMin: 5000, suggestedMax: 20000, suggestedMid: 10000, recentCount: 15 }
    const { fn, calls } = makeFetch(200, hint)
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'price-hint', '--category', 'sport'], { from: 'user' })
      expect(calls[0].url).toContain('/api/v1/shop/price-hint')
      expect(calls[0].url).toContain('categoryId=sport')
      expect(cap.text()).toContain('5')
    } finally { cap.restore() }
  })
})

// ── shop post --dry-run ───────────────────────────────────────────────────────

describe('haszno shop post --dry-run', () => {
  it('prints request body without sending any HTTP call', async () => {
    const { fn, calls } = makeFetch(201, { id: 1, title: 'Test', priceGross: 1000, status: 'aktiv', reserved: false, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(
        ['shop', 'post', '--title', 'Test', '--price', '1000', '--dry-run'],
        { from: 'user' },
      )
      // No fetch call should have been made
      expect(calls).toHaveLength(0)
      expect(cap.text()).toContain('dry-run')
      expect(cap.text()).toContain('Test')
    } finally { cap.restore() }
  })
})

// ── shop post ─────────────────────────────────────────────────────────────────

describe('haszno shop post', () => {
  it('calls POST /api/v1/shop/my/ads with correct body', async () => {
    const ad = { id: 7, title: 'Futópad', priceGross: 50000, status: 'aktiv', reserved: false, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' }
    const { fn, calls } = makeFetch(201, ad)
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(
        ['shop', 'post', '--title', 'Futópad', '--price', '50000', '--yes'],
        { from: 'user' },
      )
      const postCall = calls.find((c) => c.init.method === 'POST' && c.url.includes('/api/v1/shop/my/ads'))
      expect(postCall).toBeDefined()
      const body = JSON.parse(postCall!.init.body as string)
      expect(body.title).toBe('Futópad')
      expect(body.priceGross).toBe(50000)
      expect(cap.text()).toContain('#7')
    } finally { cap.restore() }
  })

  it('exits 2 when --title is missing and no AI suggest', async () => {
    const { fn } = makeFetch(201, {})
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildShopProgram(sc).parseAsync(['shop', 'post', '--price', '1000', '--yes'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally { cap.restore(); exitSpy.mockRestore() }
  })
})

// ── shop my ───────────────────────────────────────────────────────────────────

describe('haszno shop my', () => {
  it('calls GET /api/v1/shop/my/ads', async () => {
    const { fn, calls } = makeFetch(200, [])
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'my'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads`)
      expect(calls[0].init.method).toBe('GET')
    } finally { cap.restore() }
  })
})

// ── shop edit ─────────────────────────────────────────────────────────────────

describe('haszno shop edit', () => {
  it('calls PATCH /api/v1/shop/my/ads/:id with partial body', async () => {
    const ad = { id: 42, title: 'Új cím', priceGross: 30000, status: 'aktiv', reserved: false, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' }
    const { fn, calls } = makeFetch(200, ad)
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'edit', '42', '--title', 'Új cím', '--price', '30000'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads/42`)
      expect(calls[0].init.method).toBe('PATCH')
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.title).toBe('Új cím')
      expect(body.priceGross).toBe(30000)
    } finally { cap.restore() }
  })
})

// ── shop pause / activate / renew / delete ────────────────────────────────────

describe('haszno shop state commands', () => {
  it('pause calls POST /api/v1/shop/my/ads/:id/pause', async () => {
    const { fn, calls } = makeFetch(200, { id: 5, status: 'szunetel', reserved: false, title: 'Test', priceGross: 0, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'pause', '5'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads/5/pause`)
      expect(calls[0].init.method).toBe('POST')
    } finally { cap.restore() }
  })

  it('activate calls POST /api/v1/shop/my/ads/:id/activate', async () => {
    const { fn, calls } = makeFetch(200, { id: 5, status: 'aktiv', reserved: false, title: 'Test', priceGross: 0, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'activate', '5'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads/5/activate`)
      expect(calls[0].init.method).toBe('POST')
    } finally { cap.restore() }
  })

  it('sold calls POST /api/v1/shop/my/ads/:id/sold with price', async () => {
    const { fn, calls } = makeFetch(200, { id: 5, status: 'eladva', reserved: false, title: 'Test', priceGross: 0, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'sold', '5', '--price', '23000'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads/5/sold`)
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.soldPriceGross).toBe(23000)
    } finally { cap.restore() }
  })

  it('renew calls POST /api/v1/shop/my/ads/:id/renew', async () => {
    const { fn, calls } = makeFetch(200, { id: 5, status: 'aktiv', reserved: false, title: 'Test', priceGross: 0, images: [], attributes: {}, negotiable: false, condition: null, county: null, city: null, description: null, contactName: null, contactPhone: null, showPhone: false, createdAt: '', updatedAt: '' })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'renew', '5'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads/5/renew`)
    } finally { cap.restore() }
  })

  it('delete calls DELETE /api/v1/shop/my/ads/:id', async () => {
    const { fn, calls } = makeFetch(200, { deleted: true })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'delete', '5'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/ads/5`)
      expect(calls[0].init.method).toBe('DELETE')
    } finally { cap.restore() }
  })
})

// ── shop inquiries / inquire ──────────────────────────────────────────────────

describe('haszno shop inquiries', () => {
  it('calls GET /api/v1/shop/my/inquiries', async () => {
    const { fn, calls } = makeFetch(200, [])
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'inquiries'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/inquiries`)
    } finally { cap.restore() }
  })

  it('inquire calls POST /api/v1/shop/ads/:adId/inquiries', async () => {
    const { fn, calls } = makeFetch(201, { id: 1, adId: 42, message: 'Hello', senderName: 'Test', senderEmail: null, createdAt: '', readAt: null })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'inquire', '42', '--message', 'Hello'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/ads/42/inquiries`)
      expect(calls[0].init.method).toBe('POST')
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.message).toBe('Hello')
    } finally { cap.restore() }
  })

  it('inquire exits 2 when --message is missing', async () => {
    const { fn } = makeFetch(201, {})
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildShopProgram(sc).parseAsync(['shop', 'inquire', '42'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally { cap.restore(); exitSpy.mockRestore() }
  })
})

// ── shop favorites ────────────────────────────────────────────────────────────

describe('haszno shop favorites', () => {
  it('favorites calls GET /api/v1/shop/my/favorites', async () => {
    const { fn, calls } = makeFetch(200, [])
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'favorites'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/favorites`)
    } finally { cap.restore() }
  })

  it('favorite calls POST /api/v1/shop/my/favorites/:adId', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'favorite', '10'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/favorites/10`)
      expect(calls[0].init.method).toBe('POST')
    } finally { cap.restore() }
  })

  it('unfavorite calls DELETE /api/v1/shop/my/favorites/:adId', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'unfavorite', '10'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/favorites/10`)
      expect(calls[0].init.method).toBe('DELETE')
    } finally { cap.restore() }
  })
})

// ── shop reserve ──────────────────────────────────────────────────────────────

describe('haszno shop reserve', () => {
  it('calls POST /api/v1/shop/ads/:adId/reservations with body', async () => {
    const resv = { id: 1, adId: 42, ad: { id: 42, title: 'Bicikli', priceGross: 10000, image: null, status: 'aktiv' }, status: 'fuggoben', message: 'Érdeklődöm', offerPriceGross: null, buyerName: 'Test', buyerPhone: null, buyerEmail: null, sellerName: 'Eladó', sellerPhone: null, sellerEmail: null, heldUntil: null, createdAt: '', updatedAt: '' }
    const { fn, calls } = makeFetch(201, { reservation: resv })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reserve', '42', '--message', 'Érdeklődöm', '--yes'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/ads/42/reservations`)
      expect(calls[0].init.method).toBe('POST')
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.message).toBe('Érdeklődöm')
      expect(cap.text()).toContain('Foglalás létrehozva')
    } finally { cap.restore() }
  })

  it('with --offer sends offerPriceGross', async () => {
    const resv = { id: 2, adId: 10, ad: { id: 10, title: 'X', priceGross: 5000, image: null, status: 'aktiv' }, status: 'fuggoben', message: null, offerPriceGross: 4000, buyerName: 'T', buyerPhone: null, buyerEmail: null, sellerName: 'E', sellerPhone: null, sellerEmail: null, heldUntil: null, createdAt: '', updatedAt: '' }
    const { fn, calls } = makeFetch(201, { reservation: resv })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reserve', '10', '--offer', '4000', '--yes'], { from: 'user' })
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.offerPriceGross).toBe(4000)
    } finally { cap.restore() }
  })
})

// ── shop reservations ─────────────────────────────────────────────────────────

describe('haszno shop reservations', () => {
  it('calls GET /api/v1/shop/my/reservations with role=buyer', async () => {
    const { fn, calls } = makeFetch(200, { items: [] })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservations'], { from: 'user' })
      expect(calls[0].url).toContain('/api/v1/shop/my/reservations')
      expect(calls[0].url).toContain('role=buyer')
    } finally { cap.restore() }
  })

  it('--as seller passes role=seller', async () => {
    const { fn, calls } = makeFetch(200, { items: [] })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservations', '--as', 'seller'], { from: 'user' })
      expect(calls[0].url).toContain('role=seller')
    } finally { cap.restore() }
  })
})

// ── shop reservation accept / decline / cancel / complete ─────────────────────

describe('haszno shop reservation sub-commands', () => {
  const simple = { id: 1, adId: 42, status: 'elfogadva', heldUntil: null, createdAt: '', updatedAt: '', decidedAt: null }

  it('accept calls POST /api/v1/shop/my/reservations/:id/accept', async () => {
    const { fn, calls } = makeFetch(200, { reservation: simple })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservation', 'accept', '1'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/reservations/1/accept`)
      expect(calls[0].init.method).toBe('POST')
    } finally { cap.restore() }
  })

  it('accept with --held-until passes heldUntil in body', async () => {
    const { fn, calls } = makeFetch(200, { reservation: simple })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservation', 'accept', '1', '--held-until', '2026-12-01T12:00:00Z'], { from: 'user' })
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.heldUntil).toBe('2026-12-01T12:00:00Z')
    } finally { cap.restore() }
  })

  it('decline calls POST /api/v1/shop/my/reservations/:id/decline', async () => {
    const { fn, calls } = makeFetch(200, { reservation: { ...simple, status: 'elutasitva' } })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservation', 'decline', '1'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/reservations/1/decline`)
    } finally { cap.restore() }
  })

  it('cancel calls POST /api/v1/shop/my/reservations/:id/cancel', async () => {
    const { fn, calls } = makeFetch(200, { reservation: { ...simple, status: 'visszavonva' } })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservation', 'cancel', '1'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/reservations/1/cancel`)
    } finally { cap.restore() }
  })

  it('complete calls POST /api/v1/shop/my/reservations/:id/complete with optional price', async () => {
    const { fn, calls } = makeFetch(200, { reservation: { ...simple, status: 'teljesitve' } })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const cap = captureOutput()
    try {
      await buildShopProgram(sc).parseAsync(['shop', 'reservation', 'complete', '1', '--price', '9000'], { from: 'user' })
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/reservations/1/complete`)
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.soldPriceGross).toBe(9000)
    } finally { cap.restore() }
  })
})

// ── Multipart image upload ────────────────────────────────────────────────────

describe('uploadShopImage', () => {
  it('sends multipart POST to /api/v1/shop/my/images', async () => {
    // Create a temporary file
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-img-test-'))
    const imgPath = join(tmp, 'test.jpg')
    try {
      writeFileSync(imgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0]))

      const calls: FetchCall[] = []
      const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} })
        return new Response(JSON.stringify({ imageId: 'img_abc', url: 'https://cdn.example/img_abc.jpg' }), { status: 200 })
      }) as unknown as typeof fetch

      const result = await uploadShopImage(imgPath, {
        baseUrl: BASE,
        apiKey: TOKEN,
        fetch: fn as typeof fetch,
        readConfig: noConfig,
      })

      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe(`${BASE}/api/v1/shop/my/images`)
      expect(calls[0].init.method).toBe('POST')
      // Should be FormData (body is a FormData instance)
      expect(calls[0].init.body).toBeInstanceOf(FormData)
      // Auth header should be Bearer
      const headers = calls[0].init.headers as Record<string, string>
      expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`)
      expect(result.imageId).toBe('img_abc')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('throws HasznoApiError on non-OK response', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-img-test-'))
    const imgPath = join(tmp, 'test.png')
    try {
      writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
      const fn = vi.fn(async () =>
        new Response(JSON.stringify({ error: 'Too large' }), { status: 413 }),
      ) as unknown as typeof fetch

      await expect(
        uploadShopImage(imgPath, {
          baseUrl: BASE,
          apiKey: TOKEN,
          fetch: fn as typeof fetch,
          readConfig: noConfig,
        }),
      ).rejects.toMatchObject({ status: 413, message: 'Too large' })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ── haszno login ─────────────────────────────────────────────────────────────

describe('haszno login', () => {
  let tmp = ''
  let cfgPath = ''

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'haszno-login-test-'))
    cfgPath = join(tmp, 'config.json')
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('stores the token and prints user info; never prints token without --show-token', async () => {
    const loginResp = { token: TOKEN, scope: 'write', user: { email: 'u@test.com', name: 'Test User', shopName: 'Teszt Bolt' } }
    const { fn, calls } = makeFetch(200, loginResp)

    const prog = new Command()
      .name('haszno')
      .option('--json')
      .exitOverride()
    registerAccountCommands(prog, makeStubClient(), {
      configPath: cfgPath,
      httpOpts: { fetch: fn as typeof fetch, readConfig: noConfig },
    })

    // Inject env credentials to skip the interactive prompt
    const savedEmail = process.env['HASZNO_EMAIL']
    const savedPassword = process.env['HASZNO_PASSWORD']
    process.env['HASZNO_EMAIL'] = 'u@test.com'
    process.env['HASZNO_PASSWORD'] = 'password12345'

    const cap = captureOutput()
    try {
      await prog.parseAsync(['login'], { from: 'user' })

      // Sent POST to /api/v1/auth/cli-login
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toContain('/api/v1/auth/cli-login')
      expect(calls[0].init.method).toBe('POST')
      const body = JSON.parse(calls[0].init.body as string)
      expect(body.email).toBe('u@test.com')
      expect(body.password).toBe('password12345')

      // Token saved to config
      const cfg = readConfigFile(cfgPath)
      expect(cfg.apiKey).toBe(TOKEN)

      // Output contains name and email but NOT the full token
      expect(cap.text()).toContain('Test User')
      expect(cap.text()).toContain('u@test.com')
      expect(cap.text()).not.toContain(TOKEN)
    } finally {
      cap.restore()
      if (savedEmail === undefined) delete process.env['HASZNO_EMAIL']
      else process.env['HASZNO_EMAIL'] = savedEmail
      if (savedPassword === undefined) delete process.env['HASZNO_PASSWORD']
      else process.env['HASZNO_PASSWORD'] = savedPassword
    }
  })

  it('prints token when --show-token is passed', async () => {
    const loginResp = { token: TOKEN, scope: 'write', user: { email: 'u@test.com', name: 'Test User', shopName: 'Teszt Bolt' } }
    const { fn } = makeFetch(200, loginResp)

    const prog = new Command().name('haszno').option('--json').exitOverride()
    registerAccountCommands(prog, makeStubClient(), {
      configPath: cfgPath,
      httpOpts: { fetch: fn as typeof fetch, readConfig: noConfig },
    })

    const savedEmail = process.env['HASZNO_EMAIL']
    const savedPassword = process.env['HASZNO_PASSWORD']
    process.env['HASZNO_EMAIL'] = 'u@test.com'
    process.env['HASZNO_PASSWORD'] = 'password12345'

    const cap = captureOutput()
    try {
      await prog.parseAsync(['login', '--show-token'], { from: 'user' })
      expect(cap.text()).toContain(TOKEN)
    } finally {
      cap.restore()
      if (savedEmail === undefined) delete process.env['HASZNO_EMAIL']
      else process.env['HASZNO_EMAIL'] = savedEmail
      if (savedPassword === undefined) delete process.env['HASZNO_PASSWORD']
      else process.env['HASZNO_PASSWORD'] = savedPassword
    }
  })

  it('exits 2 when no env credentials and stdin is not a TTY', async () => {
    const { fn } = makeFetch(200, {})
    const prog = new Command().name('haszno').option('--json').exitOverride()
    registerAccountCommands(prog, makeStubClient(), {
      configPath: cfgPath,
      httpOpts: { fetch: fn as typeof fetch, readConfig: noConfig },
    })

    const savedEmail = process.env['HASZNO_EMAIL']
    const savedPassword = process.env['HASZNO_PASSWORD']
    delete process.env['HASZNO_EMAIL']
    delete process.env['HASZNO_PASSWORD']

    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        prog.parseAsync(['login'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally {
      cap.restore()
      exitSpy.mockRestore()
      if (savedEmail !== undefined) process.env['HASZNO_EMAIL'] = savedEmail
      if (savedPassword !== undefined) process.env['HASZNO_PASSWORD'] = savedPassword
    }
  })

  it('handles 401 error from server', async () => {
    const { fn } = makeFetch(401, { error: 'Hibás e-mail-cím vagy jelszó' })
    const prog = new Command().name('haszno').option('--json').exitOverride()
    registerAccountCommands(prog, makeStubClient(), {
      configPath: cfgPath,
      httpOpts: { fetch: fn as typeof fetch, readConfig: noConfig },
    })

    const savedEmail = process.env['HASZNO_EMAIL']
    const savedPassword = process.env['HASZNO_PASSWORD']
    process.env['HASZNO_EMAIL'] = 'u@test.com'
    process.env['HASZNO_PASSWORD'] = 'wrongpassword'

    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        prog.parseAsync(['login'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(cap.errText()).toContain('Hibás e-mail-cím vagy jelszó')
    } finally {
      cap.restore()
      exitSpy.mockRestore()
      if (savedEmail === undefined) delete process.env['HASZNO_EMAIL']
      else process.env['HASZNO_EMAIL'] = savedEmail
      if (savedPassword === undefined) delete process.env['HASZNO_PASSWORD']
      else process.env['HASZNO_PASSWORD'] = savedPassword
    }
  })
})

// ── haszno logout ─────────────────────────────────────────────────────────────

describe('haszno logout', () => {
  it('removes apiKey from config', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-logout-test-'))
    const cfgPath = join(tmp, 'config.json')
    try {
      writeConfigFile({ apiKey: TOKEN, apiUrl: BASE }, cfgPath)

      const prog = new Command().name('haszno').option('--json').exitOverride()
      registerAccountCommands(prog, makeStubClient(), { configPath: cfgPath })

      const cap = captureOutput()
      try {
        await prog.parseAsync(['logout'], { from: 'user' })
        const cfg = readConfigFile(cfgPath)
        expect(cfg.apiKey).toBeUndefined()
        expect(cap.text()).toContain('Kijelentkezve')
      } finally { cap.restore() }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ── haszno whoami ─────────────────────────────────────────────────────────────

describe('haszno whoami', () => {
  it('shows user info from config', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-whoami-test-'))
    const cfgPath = join(tmp, 'config.json')
    try {
      writeConfigFile({ apiKey: TOKEN, apiUrl: BASE } as Record<string, unknown> as ReturnType<typeof readConfigFile>, cfgPath)
      // Write extra fields manually
      writeFileSync(cfgPath, JSON.stringify({ apiKey: TOKEN, apiUrl: BASE, userEmail: 'u@t.com', userName: 'Test', shopName: 'Bolt' }, null, 2))

      const prog = new Command().name('haszno').option('--json').exitOverride()
      registerAccountCommands(prog, makeStubClient(), { configPath: cfgPath })

      const cap = captureOutput()
      try {
        await prog.parseAsync(['whoami'], { from: 'user' })
        expect(cap.text()).toContain('Test')
        expect(cap.text()).toContain('u@t.com')
        expect(cap.text()).toContain('Bolt')
      } finally { cap.restore() }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('shows "Nincs mentett token" when not logged in', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-whoami-test-'))
    const cfgPath = join(tmp, 'config.json')
    try {
      const prog = new Command().name('haszno').option('--json').exitOverride()
      registerAccountCommands(prog, makeStubClient(), { configPath: cfgPath })

      const cap = captureOutput()
      try {
        await prog.parseAsync(['whoami'], { from: 'user' })
        expect(cap.text()).toContain('Nincs mentett token')
      } finally { cap.restore() }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('outputs JSON with --json', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-whoami-test-'))
    const cfgPath = join(tmp, 'config.json')
    try {
      writeFileSync(cfgPath, JSON.stringify({ apiKey: TOKEN, apiUrl: BASE, userEmail: 'u@t.com', userName: 'Test', shopName: 'Bolt' }, null, 2))

      const prog = new Command().name('haszno').option('--json').exitOverride()
      registerAccountCommands(prog, makeStubClient(), { configPath: cfgPath })

      const cap = captureOutput()
      try {
        await prog.parseAsync(['--json', 'whoami'], { from: 'user' })
        const parsed = JSON.parse(cap.text()) as { authenticated: boolean; userEmail: string }
        expect(parsed.authenticated).toBe(true)
        expect(parsed.userEmail).toBe('u@t.com')
      } finally { cap.restore() }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ── cliLogin helper ───────────────────────────────────────────────────────────

describe('cliLogin()', () => {
  it('POSTs to /api/v1/auth/cli-login with no auth header', async () => {
    const loginResp = { token: TOKEN, scope: 'write', user: { email: 'u@test.com', name: 'User', shopName: 'Bolt' } }
    const calls: FetchCall[] = []
    const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify(loginResp), { status: 200 })
    }) as unknown as typeof fetch

    const result = await cliLogin(
      { email: 'u@test.com', password: 'pass123456', label: 'Test' },
      { baseUrl: BASE, fetch: fn as typeof fetch, readConfig: noConfig },
    )
    expect(calls[0].url).toBe(`${BASE}/api/v1/auth/cli-login`)
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    // No auth header on the login call
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['x-api-key']).toBeUndefined()
    expect(result.token).toBe(TOKEN)
    expect(result.user.email).toBe('u@test.com')
  })

  it('includes label in request body', async () => {
    const calls: FetchCall[] = []
    const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ token: TOKEN, scope: 'write', user: { email: 'e', name: 'n', shopName: 's' } }), { status: 200 })
    }) as unknown as typeof fetch

    await cliLogin({ email: 'e', password: 'p1234567890', label: 'MyLabel' }, { baseUrl: BASE, fetch: fn as typeof fetch, readConfig: noConfig })
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.label).toBe('MyLabel')
  })
})

// ── Error mapping ─────────────────────────────────────────────────────────────

describe('shop command error mapping', () => {
  const errorCases = [
    { status: 401, msg: 'Érvényes Bearer token szükséges', label: '401' },
    { status: 403, msg: 'Nincs jogosultsága ehhez', label: '403' },
    { status: 404, msg: 'Nincs ilyen hirdetés', label: '404' },
    { status: 409, msg: 'Már van nyitott foglalásod erre a hirdetésre.', label: '409 conflict' },
    { status: 429, msg: 'Túl sok kérés', label: '429' },
  ]

  it.each(errorCases)('$label surfaces server error message', async ({ status, msg }) => {
    const { fn } = makeFetch(status, { error: msg })
    const sc = createShopClient({ baseUrl: BASE, apiKey: TOKEN, fetch: fn as typeof fetch, readConfig: noConfig, maxRetries: 1 })
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildShopProgram(sc).parseAsync(['shop', 'show', '1'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(cap.errText()).toContain(msg)
    } finally {
      cap.restore()
      exitSpy.mockRestore()
    }
  })
})
