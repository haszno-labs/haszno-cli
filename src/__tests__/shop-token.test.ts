/**
 * Tests for dual-mode credential handling in haszno-cli.
 *
 * Verifies:
 *  1. Shop token (haszno_ prefix) → Authorization: Bearer, routes to /api/agent/*
 *  2. Non-prefixed key → x-api-key header, routes to legacy /api/* paths (unchanged)
 *  3. Basic credentials → Authorization: Basic, unchanged
 *  4. Config-file credentials → unchanged; a saved shop token is also detected
 *  5. HASZNO_API_TOKEN env takes priority over HASZNO_API_KEY
 *  6. Disabled operations in shop-token mode make zero HTTP calls
 *  7. Nonce is reused across transport retries
 *  8. Error codes (401, 403, 404, 409, 422, 429) map to clear messages
 *
 * No live network calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { request, isShopToken, SHOP_TOKEN_PREFIX } from '../client/http.js'
import { createClient, ShopTokenNotSupportedError, LegacyKeyNotSupportedError } from '../client/index.js'
import { resolveConnection } from '../client/config.js'

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

const SHOP_TOKEN = 'haszno_abc123def456'
const LEGACY_KEY = 'legacy-api-key-no-prefix'
const BASIC_CRED = 'demo:password'
const noConfig = () => ({})

// ── isShopToken ───────────────────────────────────────────────────────────────

describe('isShopToken()', () => {
  it('returns true for haszno_ prefixed strings', () => {
    expect(isShopToken('haszno_abc')).toBe(true)
    expect(isShopToken(SHOP_TOKEN_PREFIX + 'x')).toBe(true)
  })

  it('returns false for non-prefixed strings', () => {
    expect(isShopToken(LEGACY_KEY)).toBe(false)
    expect(isShopToken('')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isShopToken(undefined)).toBe(false)
  })
})

// ── resolveConnection with HASZNO_API_TOKEN ───────────────────────────────────

describe('resolveConnection() — HASZNO_API_TOKEN priority', () => {
  it('HASZNO_API_TOKEN takes priority over HASZNO_API_KEY', () => {
    const conn = resolveConnection({}, { HASZNO_API_TOKEN: SHOP_TOKEN, HASZNO_API_KEY: LEGACY_KEY }, noConfig)
    expect(conn.apiKey).toBe(SHOP_TOKEN)
  })

  it('HASZNO_API_TOKEN falls back to HASZNO_API_KEY when absent', () => {
    const conn = resolveConnection({}, { HASZNO_API_KEY: LEGACY_KEY }, noConfig)
    expect(conn.apiKey).toBe(LEGACY_KEY)
  })

  it('opts.apiKey takes priority over HASZNO_API_TOKEN', () => {
    const conn = resolveConnection({ apiKey: 'flag-key' }, { HASZNO_API_TOKEN: SHOP_TOKEN }, noConfig)
    expect(conn.apiKey).toBe('flag-key')
  })

  it('shop token saved in config file is detected', () => {
    const conn = resolveConnection({}, {}, () => ({ apiKey: SHOP_TOKEN }))
    expect(conn.apiKey).toBe(SHOP_TOKEN)
    expect(isShopToken(conn.apiKey)).toBe(true)
  })
})

// ── http.ts auth header selection ────────────────────────────────────────────

describe('request() auth header selection', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of [
      'HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY',
      'HASZNO_BASIC', 'ARFUTAR_BASIC', 'HASZNO_API_URL', 'ARFUTAR_API_URL',
    ]) delete process.env[k]
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  it('shop token via opts.apiKey → Authorization: Bearer', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, {
      apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig,
    })
    const authHeader = (calls[0].init.headers as Record<string, string>)['Authorization']
    expect(authHeader).toBe(`Bearer ${SHOP_TOKEN}`)
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBeUndefined()
  })

  it('shop token via HASZNO_API_TOKEN env → Authorization: Bearer', async () => {
    process.env['HASZNO_API_TOKEN'] = SHOP_TOKEN
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, { fetch: fn as typeof fetch, readConfig: noConfig })
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('non-prefixed key via HASZNO_API_KEY → x-api-key header (unchanged)', async () => {
    process.env['HASZNO_API_KEY'] = LEGACY_KEY
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, { fetch: fn as typeof fetch, readConfig: noConfig })
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe(LEGACY_KEY)
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('legacy ARFUTAR_API_KEY → x-api-key (unchanged fallback)', async () => {
    process.env['ARFUTAR_API_KEY'] = LEGACY_KEY
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, { fetch: fn as typeof fetch, readConfig: noConfig })
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe(LEGACY_KEY)
  })

  it('Basic credentials → Authorization: Basic (unchanged)', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, {
      basicAuth: BASIC_CRED, fetch: fn as typeof fetch, readConfig: noConfig,
    })
    const authHeader = (calls[0].init.headers as Record<string, string>)['Authorization']
    expect(authHeader).toBe(`Basic ${Buffer.from(BASIC_CRED).toString('base64')}`)
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBeUndefined()
  })

  it('config-file key (non-prefixed) → x-api-key (unchanged)', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, {
      fetch: fn as typeof fetch,
      readConfig: () => ({ apiUrl: 'https://haszno.com', apiKey: LEGACY_KEY }),
    })
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe(LEGACY_KEY)
  })

  it('config-file shop token → Authorization: Bearer', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    await request('GET', '/api/health', undefined, {
      fetch: fn as typeof fetch,
      readConfig: () => ({ apiUrl: 'https://haszno.com', apiKey: SHOP_TOKEN }),
    })
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })
})

// ── createClient() shop-token mode routing ───────────────────────────────────

describe('createClient() — shop-token mode', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of [
      'HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY',
      'HASZNO_BASIC', 'ARFUTAR_BASIC', 'HASZNO_API_URL', 'ARFUTAR_API_URL',
    ]) delete process.env[k]
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  it('products.list() → GET /api/agent/products', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.products.list()
    expect(calls[0].url).toContain('/api/agent/products')
    expect(calls[0].url).not.toContain('/api/products')
  })

  it('orders.list() → GET /api/agent/orders', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.orders.list()
    expect(calls[0].url).toContain('/api/agent/orders')
  })

  it('proposals.list() → GET /api/agent/proposals', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.proposals.list()
    expect(calls[0].url).toContain('/api/agent/proposals')
    expect(calls[0].url).not.toContain('/api/proposals')
  })

  it('proposals.propose() → POST /api/agent/proposals with correct body', async () => {
    const { fn, calls } = makeFetch(201, { id: 7, status: 'pending', createdAt: '2026-01-01T00:00:00Z' })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const result = await client.proposals.propose({
      productId: 42, proposedPriceGross: 8990, reason: 'Piaci minimum alálövés', nonce: 'nonce-1',
    })
    expect(calls[0].url).toContain('/api/agent/proposals')
    expect(calls[0].init.method).toBe('POST')
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.productId).toBe(42)
    expect(body.proposedPriceGross).toBe(8990)
    expect(body.nonce).toBe('nonce-1')
    expect(result.id).toBe(7)
  })

  it('nonce is reused across transport retries', async () => {
    let attempt = 0
    const calls: FetchCall[] = []
    const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      attempt++
      if (attempt === 1) return new Response(JSON.stringify({ error: 'server error' }), { status: 500 })
      return new Response(JSON.stringify({ id: 1, status: 'pending', createdAt: '2026-01-01T00:00:00Z' }), { status: 201 })
    }) as unknown as typeof fetch

    const nonce = 'constant-nonce'
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig, retryDelayMs: 0 })
    await client.proposals.propose({ productId: 1, proposedPriceGross: 5000, reason: 'test', nonce })

    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[0].init.body as string).nonce).toBe('constant-nonce')
    expect(JSON.parse(calls[1].init.body as string).nonce).toBe('constant-nonce')
  })

  it('shop token is sent as Bearer on all agent requests', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.products.list()
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBeUndefined()
  })

  it('shop token via HASZNO_API_TOKEN env → agent routing', async () => {
    process.env['HASZNO_API_TOKEN'] = SHOP_TOKEN
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ fetch: fn as typeof fetch, readConfig: noConfig })
    await client.products.list()
    expect(calls[0].url).toContain('/api/agent/products')
  })

  it('shop token from config file → agent routing', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({
      fetch: fn as typeof fetch,
      readConfig: () => ({ apiUrl: 'https://haszno.com', apiKey: SHOP_TOKEN }),
    })
    await client.products.list()
    expect(calls[0].url).toContain('/api/agent/products')
  })
})

// ── createClient() shop-token mode — disabled operations ─────────────────────

describe('createClient() — disabled operations in shop-token mode', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of ['HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY']) delete process.env[k]
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  const disabledOps: Array<{ label: string; call: (c: ReturnType<typeof createClient>) => Promise<unknown> }> = [
    { label: 'proposals.approve', call: (c) => c.proposals.approve({}) },
    { label: 'proposals.reject', call: (c) => c.proposals.reject({ ids: [1] }) },
    { label: 'proposals.rollback', call: (c) => c.proposals.rollback({ batchId: 'b-1' }) },
    { label: 'rules.list', call: (c) => c.rules.list() },
    { label: 'feeds.importFeed', call: (c) => c.feeds.importFeed({ supplierId: 1, format: 'csv', content: '' }) },
    { label: 'settings.get', call: (c) => c.settings.get() },
    { label: 'orders.ship', call: (c) => c.orders.ship(1) },
    { label: 'automation.get', call: (c) => c.automation.get() },
    { label: 'connections.list', call: (c) => c.connections.list() },
  ]

  it.each(disabledOps)('$label throws ShopTokenNotSupportedError with zero HTTP calls', async ({ call }) => {
    const { fn } = makeFetch(200, {})
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await expect(call(client)).rejects.toThrow(ShopTokenNotSupportedError)
    expect(fn).not.toHaveBeenCalled()
  })
})

// ── createClient() legacy mode — unchanged behaviour ─────────────────────────

describe('createClient() — legacy mode (non-prefixed key)', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of ['HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY']) delete process.env[k]
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  it('products.list() → GET /api/products (legacy)', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.products.list()
    expect(calls[0].url).toContain('/api/products')
    expect(calls[0].url).not.toContain('/api/agent')
  })

  it('orders.list() → GET /api/orders (legacy)', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.orders.list()
    expect(calls[0].url).toContain('/api/orders')
    expect(calls[0].url).not.toContain('/api/agent')
  })

  it('proposals.list() → GET /api/proposals (legacy)', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.proposals.list({ status: 'pending' })
    expect(calls[0].url).toContain('/api/proposals')
    expect(calls[0].url).not.toContain('/api/agent')
  })

  it('proposals.approve() works in legacy mode', async () => {
    const { fn, calls } = makeFetch(200, { batchId: 'b-1', applied: 1 })
    const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.proposals.approve({})
    expect(calls[0].url).toContain('/api/proposals/approve')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('non-prefixed key → x-api-key header (unchanged)', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.products.list()
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe(LEGACY_KEY)
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBeUndefined()
  })

  it('Basic credentials → Authorization: Basic (unchanged)', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ basicAuth: BASIC_CRED, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.products.list()
    expect((calls[0].init.headers as Record<string, string>)['Authorization'])
      .toBe(`Basic ${Buffer.from(BASIC_CRED).toString('base64')}`)
  })

  it('config-file key sends to saved URL only (unchanged behaviour)', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({
      fetch: fn as typeof fetch,
      readConfig: () => ({ apiUrl: 'https://self.example', apiKey: LEGACY_KEY }),
    })
    await client.products.list()
    expect(calls[0].url).toBe('https://self.example/api/products')
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe(LEGACY_KEY)
  })
})

// ── Error mapping ─────────────────────────────────────────────────────────────

describe('error mapping in shop-token mode', () => {
  const errorCases = [
    { status: 401, serverMsg: 'Érvényes Bearer token szükséges', label: '401 invalid token' },
    { status: 403, serverMsg: 'Ehhez a művelethez írás (write) jogosultság szükséges', label: '403 read-only' },
    { status: 404, serverMsg: 'Nincs ilyen termék', label: '404 product not found' },
    { status: 409, serverMsg: 'Duplikált nonce', label: '409 replayed nonce' },
    { status: 422, serverMsg: 'Az ár a korlát alatt van.', label: '422 below floor' },
  ]

  it.each(errorCases)('$label surfaces server message', async ({ status, serverMsg }) => {
    const { fn } = makeFetch(status, { error: serverMsg })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await expect(
      client.proposals.propose({ productId: 1, proposedPriceGross: 100, reason: 'test', nonce: 'n' })
    ).rejects.toMatchObject({ message: serverMsg, status })
  })
})

// ── manager namespace — HTTP contract (shop-token mode) ───────────────────────

describe('createClient() — manager methods HTTP contract (shop-token mode)', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of ['HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY']) delete process.env[k]
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  it('manager.listReports() → GET /api/daily-reports, Bearer', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.listReports()
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/daily-reports')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('manager.getLatestReport() → GET /api/agent/daily-report, Bearer', async () => {
    const { fn, calls } = makeFetch(200, { id: 1 })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.getLatestReport()
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toMatch(/\/api\/agent\/daily-report$/)
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('manager.getReport("2026-11-12") → GET /api/agent/daily-report/2026-11-12, Bearer', async () => {
    const { fn, calls } = makeFetch(200, { id: 1 })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.getReport('2026-11-12')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/daily-report/2026-11-12')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('manager.getResearchBrief() → GET /api/agent/research-brief, Bearer', async () => {
    const { fn, calls } = makeFetch(200, { day: '2026-11-12' })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.getResearchBrief()
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/research-brief')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('manager.postFindings() → POST /api/agent/daily-report/:day/findings, Bearer, JSON body', async () => {
    const body = { headline: 'Teszt', items: [] }
    const { fn, calls } = makeFetch(200, { id: 1 })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.postFindings('2026-11-12', body)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toContain('/api/agent/daily-report/2026-11-12/findings')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
    expect(JSON.parse(calls[0].init.body as string).headline).toBe('Teszt')
  })

  it('manager.listActions() → GET /api/agent/actions (no query string), Bearer', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.listActions()
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toMatch(/\/api\/agent\/actions$/)
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('manager.listActions({ status, limit }) → GET /api/agent/actions?status=javasolt&limit=10, Bearer', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.listActions({ status: 'javasolt', limit: 10 })
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/actions?status=javasolt&limit=10')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('manager.proposeAction() → POST /api/agent/actions, Bearer, JSON body', async () => {
    const body = { type: 'felvetel' as const, productId: 42, reason: 'Jó termék' }
    const { fn, calls } = makeFetch(200, { id: 1 })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.manager.proposeAction(body)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toMatch(/\/api\/agent\/actions$/)
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.type).toBe('felvetel')
    expect(sent.productId).toBe(42)
  })
})

// ── manager namespace — legacy mode rejects without HTTP calls ────────────────

describe('createClient() — manager methods rejected in legacy mode', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of ['HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY']) delete process.env[k]
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  const managerOps: Array<{ label: string; call: (c: ReturnType<typeof createClient>) => Promise<unknown> }> = [
    { label: 'manager.listReports', call: (c) => c.manager.listReports() },
    { label: 'manager.getLatestReport', call: (c) => c.manager.getLatestReport() },
    { label: 'manager.getReport', call: (c) => c.manager.getReport('2026-11-12') },
    { label: 'manager.getResearchBrief', call: (c) => c.manager.getResearchBrief() },
    { label: 'manager.postFindings', call: (c) => c.manager.postFindings('2026-11-12', { items: [] }) },
    { label: 'manager.listActions', call: (c) => c.manager.listActions() },
    { label: 'manager.proposeAction', call: (c) => c.manager.proposeAction({ type: 'felvetel', productId: 1, reason: 'test' }) },
  ]

  it.each(managerOps)('$label rejects with LegacyKeyNotSupportedError and no HTTP call', async ({ call }) => {
    const { fn } = makeFetch(200, {})
    const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
    await expect(call(client)).rejects.toMatchObject({ name: 'LegacyKeyNotSupportedError' })
    // Verify the error is an instance of LegacyKeyNotSupportedError
    await expect(call(client)).rejects.toBeInstanceOf(LegacyKeyNotSupportedError)
    // No HTTP call must have been made
    expect(fn).not.toHaveBeenCalled()
  })
})
