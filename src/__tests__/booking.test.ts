/**
 * Tests for the booking command group and the booking namespace in HasznoClient.
 *
 * Verifies:
 *  1. Shop-token client routes all booking calls to /api/agent/booking/* with Bearer
 *  2. Legacy client rejects all booking ops with LegacyKeyNotSupportedError (zero HTTP calls)
 *  3. Dry-run default: applySetup without yes → dryRun:true in request body
 *  4. Each route uses the correct HTTP method and path
 *
 * No live network calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createClient, LegacyKeyNotSupportedError } from '../client/index.js'

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

const SHOP_TOKEN = 'haszno_booking_test_token'
const LEGACY_KEY = 'legacy-key-no-prefix'
const noConfig = () => ({})

// ── Shop-token client — booking namespace HTTP contract ───────────────────────

describe('booking — shop-token client HTTP contract', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of ['HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY']) {
      delete process.env[k]
    }
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  it('getSetup() → GET /api/agent/booking/setup with Bearer', async () => {
    const { fn, calls } = makeFetch(200, { page: { published: false, theme: {} }, services: [], resources: [], hours: [], exceptions: [], checklist: [], nextStep: null })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.getSetup()
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/booking/setup')
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })

  it('applySetup(body, dryRun=true) → PUT /api/agent/booking/setup with dryRun:true in body', async () => {
    const { fn, calls } = makeFetch(200, { dryRun: true, changes: [] })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.applySetup({ theme: { accent: '#ff0000' } }, true)
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].url).toContain('/api/agent/booking/setup')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.dryRun).toBe(true)
  })

  it('applySetup(body, dryRun=false) → PUT /api/agent/booking/setup without dryRun:true', async () => {
    const { fn, calls } = makeFetch(200, { dryRun: false, changes: ['Téma frissítve'], applied: 1 })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.applySetup({ theme: { accent: '#ff0000' } }, false)
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.dryRun).toBeUndefined()
  })

  it('setTheme(partial) → PUT /api/agent/booking/theme with partial body', async () => {
    const { fn, calls } = makeFetch(200, { accent: '#12b5a0', background: 'light' })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.setTheme({ accent: '#12b5a0', background: 'light' })
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].url).toContain('/api/agent/booking/theme')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.accent).toBe('#12b5a0')
    expect(sent.background).toBe('light')
  })

  it('listServices() → GET /api/agent/booking/services', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.listServices()
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/booking/services')
  })

  it('createService(body) → POST /api/agent/booking/services', async () => {
    const { fn, calls } = makeFetch(201, { id: 1, name: 'Teszt', durationMin: 60, priceGross: 5000, description: null, active: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.createService({ name: 'Teszt', durationMin: 60, priceGross: 5000, description: null })
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toContain('/api/agent/booking/services')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.name).toBe('Teszt')
    expect(sent.durationMin).toBe(60)
  })

  it('updateService(id, body) → PATCH /api/agent/booking/services/:id', async () => {
    const { fn, calls } = makeFetch(200, { id: 3, name: 'Frissítve', durationMin: 30, priceGross: null, description: null, active: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.updateService(3, { name: 'Frissítve' })
    expect(calls[0].init.method).toBe('PATCH')
    expect(calls[0].url).toContain('/api/agent/booking/services/3')
  })

  it('deleteService(id) → DELETE /api/agent/booking/services/:id', async () => {
    const { fn, calls } = makeFetch(200, { deleted: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.deleteService(5)
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toContain('/api/agent/booking/services/5')
  })

  it('listResources() → GET /api/agent/booking/resources', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.listResources()
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/booking/resources')
  })

  it('createResource(body) → POST /api/agent/booking/resources', async () => {
    const { fn, calls } = makeFetch(201, { id: 1, name: 'Fogorvos', description: null, active: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.createResource({ name: 'Fogorvos', description: null })
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toContain('/api/agent/booking/resources')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.name).toBe('Fogorvos')
  })

  it('updateResource(id, body) → PATCH /api/agent/booking/resources/:id', async () => {
    const { fn, calls } = makeFetch(200, { id: 2, name: 'Frissítve', description: null, active: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.updateResource(2, { name: 'Frissítve' })
    expect(calls[0].init.method).toBe('PATCH')
    expect(calls[0].url).toContain('/api/agent/booking/resources/2')
  })

  it('deleteResource(id) → DELETE /api/agent/booking/resources/:id', async () => {
    const { fn, calls } = makeFetch(200, { deleted: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.deleteResource(4)
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toContain('/api/agent/booking/resources/4')
  })

  it('setHours(hours) → PUT /api/agent/booking/hours with hours array in body', async () => {
    const hoursPayload = [
      { day: 'mon' as const, open: '09:00', close: '17:00' },
      { day: 'tue' as const, open: '09:00', close: '17:00' },
    ]
    const { fn, calls } = makeFetch(200, hoursPayload)
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.setHours(hoursPayload)
    expect(calls[0].init.method).toBe('PUT')
    expect(calls[0].url).toContain('/api/agent/booking/hours')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(Array.isArray(sent.hours)).toBe(true)
    expect(sent.hours[0].day).toBe('mon')
  })

  it('addClosure(body) → POST /api/agent/booking/exceptions', async () => {
    const { fn, calls } = makeFetch(201, { id: 7, date: '2026-12-25', label: 'Karácsony', open: null, close: null })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.addClosure({ date: '2026-12-25', label: 'Karácsony', open: null, close: null })
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toContain('/api/agent/booking/exceptions')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.date).toBe('2026-12-25')
  })

  it('removeClosure(id) → DELETE /api/agent/booking/exceptions/:id', async () => {
    const { fn, calls } = makeFetch(200, { deleted: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.removeClosure(7)
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toContain('/api/agent/booking/exceptions/7')
  })

  it('publish(true) → POST /api/agent/booking/publish with { published: true }', async () => {
    const { fn, calls } = makeFetch(200, { published: true })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    const result = await client.booking.publish(true)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].url).toContain('/api/agent/booking/publish')
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.published).toBe(true)
    expect(result.published).toBe(true)
  })

  it('publish(false) → POST /api/agent/booking/publish with { published: false }', async () => {
    const { fn, calls } = makeFetch(200, { published: false })
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.publish(false)
    const sent = JSON.parse(calls[0].init.body as string)
    expect(sent.published).toBe(false)
  })

  it('listAppointments({ from, to }) → GET /api/agent/booking/appointments?from=…&to=…', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.booking.listAppointments({ from: '2026-11-01', to: '2026-11-30' })
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].url).toContain('/api/agent/booking/appointments')
    expect(calls[0].url).toContain('from=2026-11-01')
    expect(calls[0].url).toContain('to=2026-11-30')
  })
})

// ── Legacy client — booking ops rejected without HTTP calls ───────────────────

describe('booking — legacy client rejects all ops with LegacyKeyNotSupportedError', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    for (const k of ['HASZNO_API_TOKEN', 'HASZNO_API_KEY', 'ARFUTAR_API_KEY']) {
      delete process.env[k]
    }
  })
  afterEach(() => {
    Object.assign(process.env, saved)
    for (const k of Object.keys(process.env)) {
      if (!(k in saved)) delete process.env[k]
    }
  })

  const bookingOps: Array<{
    label: string
    call: (c: ReturnType<typeof createClient>) => Promise<unknown>
  }> = [
    { label: 'booking.getSetup', call: (c) => c.booking.getSetup() },
    { label: 'booking.applySetup', call: (c) => c.booking.applySetup({}) },
    { label: 'booking.setTheme', call: (c) => c.booking.setTheme({ accent: '#ff0000' }) },
    { label: 'booking.listServices', call: (c) => c.booking.listServices() },
    {
      label: 'booking.createService',
      call: (c) => c.booking.createService({ name: 'X', durationMin: 30, priceGross: null, description: null }),
    },
    { label: 'booking.updateService', call: (c) => c.booking.updateService(1, { name: 'Y' }) },
    { label: 'booking.deleteService', call: (c) => c.booking.deleteService(1) },
    { label: 'booking.listResources', call: (c) => c.booking.listResources() },
    {
      label: 'booking.createResource',
      call: (c) => c.booking.createResource({ name: 'R', description: null }),
    },
    { label: 'booking.updateResource', call: (c) => c.booking.updateResource(1, { name: 'S' }) },
    { label: 'booking.deleteResource', call: (c) => c.booking.deleteResource(1) },
    {
      label: 'booking.setHours',
      call: (c) => c.booking.setHours([{ day: 'mon', open: '09:00', close: '17:00' }]),
    },
    {
      label: 'booking.addClosure',
      call: (c) => c.booking.addClosure({ date: '2026-12-25', label: null, open: null, close: null }),
    },
    { label: 'booking.removeClosure', call: (c) => c.booking.removeClosure(1) },
    { label: 'booking.publish', call: (c) => c.booking.publish(true) },
    {
      label: 'booking.listAppointments',
      call: (c) => c.booking.listAppointments({ from: '2026-11-01', to: '2026-11-30' }),
    },
  ]

  it.each(bookingOps)(
    '$label rejects with LegacyKeyNotSupportedError and no HTTP call',
    async ({ call }) => {
      const { fn } = makeFetch(200, {})
      const client = createClient({ apiKey: LEGACY_KEY, fetch: fn as typeof fetch, readConfig: noConfig })
      await expect(call(client)).rejects.toBeInstanceOf(LegacyKeyNotSupportedError)
      expect(fn).not.toHaveBeenCalled()
    },
  )
})
