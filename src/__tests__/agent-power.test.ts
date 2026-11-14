/**
 * Tests for feat/agent-power-commands additions:
 *
 *  1. HasznoApiError carries code + requestId extracted from API error envelope
 *  2. Partner client methods route to correct /api/v1/shop/partner/* URLs
 *  3. Moderation client methods route to correct /api/v1/shop/my/moderation/* URLs
 *  4. `haszno account me` command calls /api/v1/auth/me and prints identity
 *  5. `haszno account doctor` shows credential mode + available command groups (JSON)
 *
 * No live network calls are made.
 */
import { describe, it, expect, vi } from 'vitest'
import { request } from '../client/http.js'
import { HasznoApiError } from '../client/index.js'
import { createShopClient } from '../client/shop.js'
import { Command } from 'commander'
import { registerAccountCommands } from '../commands/account.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

type FetchCall = { url: string; init: RequestInit }

function makeFetch(status: number, body: unknown, headers: Record<string, string> = {}): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status, headers })
  }) as unknown as typeof fetch
  return { fn, calls }
}

const SHOP_TOKEN = 'haszno_abc123def456'
const noConfig = () => ({})

// ── 1. Error code + requestId extraction ─────────────────────────────────────

describe('HasznoApiError — code and requestId from error envelope', () => {
  it('extracts code from JSON body', async () => {
    const { fn } = makeFetch(401, { error: 'Hitelesítés szükséges', code: 'unauthenticated', requestId: 'req-aaa' })
    await expect(
      request('GET', '/api/v1/auth/me', undefined, {
        apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig,
      })
    ).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof HasznoApiError)) return false
      return err.status === 401 && err.code === 'unauthenticated' && err.requestId === 'req-aaa'
    })
  })

  it('extracts requestId from X-Request-Id header when missing from body', async () => {
    const { fn } = makeFetch(404, { error: 'Nem találtam' }, { 'x-request-id': 'req-bbb' })
    await expect(
      request('GET', '/api/v1/auth/me', undefined, {
        apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig,
      })
    ).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof HasznoApiError)) return false
      return err.status === 404 && err.requestId === 'req-bbb'
    })
  })

  it('code is undefined when not in body', async () => {
    const { fn } = makeFetch(500, { error: 'Server error' })
    await expect(
      request('GET', '/api/v1/auth/me', undefined, {
        apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig,
      })
    ).rejects.toSatisfy((err: unknown) => {
      if (!(err instanceof HasznoApiError)) return false
      return err.status === 500 && err.code === undefined
    })
  })

  it('well-known code mapping: 403 forbidden', async () => {
    const { fn } = makeFetch(403, { error: 'Tiltott', code: 'forbidden', requestId: 'req-ccc' })
    await expect(
      request('GET', '/api/v1/agent/products', undefined, {
        apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig,
      })
    ).rejects.toMatchObject({ status: 403, code: 'forbidden', requestId: 'req-ccc' })
  })

  it('409 conflict with requestId in body', async () => {
    const { fn } = makeFetch(409, { error: 'Duplikált nonce', code: 'conflict', requestId: 'req-dup' })
    await expect(
      request('POST', '/api/v1/agent/proposals', { productId: 1, proposedPriceGross: 100, reason: 'x', nonce: 'dup' }, {
        apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig,
      })
    ).rejects.toMatchObject({ status: 409, code: 'conflict', requestId: 'req-dup' })
  })
})

// ── 2. Partner client methods ─────────────────────────────────────────────────

describe('createShopClient().partner', () => {
  it('getProfile() → GET /api/v1/shop/partner/profile', async () => {
    const body = { refCode: 'ref123', displayName: 'Test', bio: null, logoUrl: null, website: null, activeSyndications: 0, createdAt: '2026-01-01' }
    const { fn, calls } = makeFetch(200, body)
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.partner.getProfile()
    expect(calls[0].url).toContain('/api/v1/shop/partner/profile')
    expect(calls[0].init.method).toBe('GET')
  })

  it('updateProfile() → PUT /api/v1/shop/partner/profile', async () => {
    const body = { refCode: 'ref123', displayName: 'New', bio: null, logoUrl: null, website: null, activeSyndications: 0, createdAt: '2026-01-01' }
    const { fn, calls } = makeFetch(200, body)
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.partner.updateProfile({ displayName: 'New' })
    expect(calls[0].url).toContain('/api/v1/shop/partner/profile')
    expect(calls[0].init.method).toBe('PUT')
  })

  it('listSyndications() → GET /api/v1/shop/partner/syndications', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.partner.listSyndications()
    expect(calls[0].url).toContain('/api/v1/shop/partner/syndications')
    expect(calls[0].init.method).toBe('GET')
  })

  it('upsertSyndication(42) → PUT /api/v1/shop/partner/syndications/42', async () => {
    const body = { adId: 42, adTitle: 'Termék', markupPct: 10, status: 'active', createdAt: '2026-01-01', updatedAt: '2026-01-01' }
    const { fn, calls } = makeFetch(200, body)
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.partner.upsertSyndication(42, { markupPct: 10 })
    expect(calls[0].url).toContain('/api/v1/shop/partner/syndications/42')
    expect(calls[0].init.method).toBe('PUT')
  })

  it('removeSyndication(42) → DELETE /api/v1/shop/partner/syndications/42', async () => {
    const { fn, calls } = makeFetch(200, { ok: true })
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.partner.removeSyndication(42)
    expect(calls[0].url).toContain('/api/v1/shop/partner/syndications/42')
    expect(calls[0].init.method).toBe('DELETE')
  })

  it('Bearer header is sent on partner requests', async () => {
    const body = { refCode: 'r', displayName: null, bio: null, logoUrl: null, website: null, activeSyndications: 0, createdAt: '' }
    const { fn, calls } = makeFetch(200, body)
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.partner.getProfile()
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${SHOP_TOKEN}`)
  })
})

// ── 3. Moderation client methods ──────────────────────────────────────────────

describe('createShopClient().moderation', () => {
  it('list() → GET /api/v1/shop/my/moderation', async () => {
    const { fn, calls } = makeFetch(200, [])
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.moderation.list()
    expect(calls[0].url).toContain('/api/v1/shop/my/moderation')
    expect(calls[0].init.method).toBe('GET')
  })

  it('appeal(7) → POST /api/v1/shop/my/moderation/7/appeal', async () => {
    const { fn, calls } = makeFetch(200, { ok: true, id: 7 })
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.moderation.appeal(7)
    expect(calls[0].url).toContain('/api/v1/shop/my/moderation/7/appeal')
    expect(calls[0].init.method).toBe('POST')
  })

  it('appeal(7, reason) sends reason in body', async () => {
    const { fn, calls } = makeFetch(200, { ok: true, id: 7 })
    const client = createShopClient({ apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig })
    await client.moderation.appeal(7, 'Ez téves döntés volt')
    const sentBody = JSON.parse(calls[0].init.body as string) as { reason: string }
    expect(sentBody.reason).toBe('Ez téves döntés volt')
  })
})

// ── 4. account me command ─────────────────────────────────────────────────────

describe('haszno account me', () => {
  it('calls GET /api/v1/auth/me and prints identity in JSON mode', async () => {
    const mePayload = { id: 1, email: 'test@example.com', name: 'Teszt', shopId: 10, shopName: 'Teszt Bolt', founderSince: '2024-01-01', role: 'owner', tokenScope: 'write' }
    const { fn } = makeFetch(200, mePayload)

    const program = new Command().allowUnknownOption().option('--json')
    registerAccountCommands(program, {} as never, { httpOpts: { apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig } })

    const output: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (s: string) => { output.push(s); return true }

    try {
      await program.parseAsync(['node', 'haszno', 'account', 'me', '--json'])
    } finally {
      process.stdout.write = originalWrite
    }

    const parsed = JSON.parse(output.join('')) as typeof mePayload
    expect(parsed.email).toBe('test@example.com')
    expect(parsed.tokenScope).toBe('write')
  })
})

// ── 5. account doctor command ─────────────────────────────────────────────────

describe('haszno account doctor', () => {
  it('reports shop-token mode and available command groups in JSON output', async () => {
    const mePayload = { id: 1, email: 'a@b.com', name: 'A', shopId: 1, shopName: 'B', founderSince: '', role: 'owner', tokenScope: 'write' }
    const { fn } = makeFetch(200, mePayload)

    const program = new Command().allowUnknownOption().option('--json')
    registerAccountCommands(program, {} as never, { httpOpts: { apiKey: SHOP_TOKEN, fetch: fn as typeof fetch, readConfig: noConfig } })

    const output: string[] = []
    const originalWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (s: string) => { output.push(s); return true }

    try {
      await program.parseAsync(['node', 'haszno', 'account', 'doctor', '--json'])
    } finally {
      process.stdout.write = originalWrite
    }

    const parsed = JSON.parse(output.join('')) as {
      credentialMode: string; apiOk: boolean; availableCommandGroups: string[]; blockedForShopToken: string[]
    }
    expect(parsed.credentialMode).toContain('Bearer')
    expect(parsed.apiOk).toBe(true)
    expect(parsed.availableCommandGroups.some((g) => g.includes('proposals'))).toBe(true)
    expect(parsed.blockedForShopToken.some((b) => b.includes('approve'))).toBe(true)
  })
})
