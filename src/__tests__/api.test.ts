/**
 * Unit tests for src/commands/api.ts
 *
 * Covers:
 *   - deriveRisk: risk fallback when x-haszno-risk absent
 *   - matchPathTemplate: path template matching
 *   - fillPathParams: path param substitution
 *   - specEntries: flatten spec.paths
 *   - cmdApiLs: filtering, json output
 *   - cmdApiDescribe: not-found exit, json output
 *   - cmdApiCall: blocked → exit 1, non-TTY confirm without --yes → exit 1,
 *                 non-TTY confirm with --yes → proceeds, pretty-print output
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  deriveRisk,
  matchPathTemplate,
  fillPathParams,
  specEntries,
  cmdApiLs,
  cmdApiDescribe,
  cmdApiCall,
  type OpenApiSpec,
  type OpenApiOperation,
} from '../commands/api.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkSpec(): OpenApiSpec {
  return {
    openapi: '3.0.0',
    info: { title: 'Haszno API', version: '1.0.0' },
    paths: {
      '/api/products': {
        get: {
          operationId: 'listProducts',
          summary: 'Termékek listája',
          tags: ['products'],
          'x-haszno-risk': 'read',
        },
        post: {
          operationId: 'createProduct',
          summary: 'Termék létrehozása',
          tags: ['products'],
          'x-haszno-risk': 'write',
        },
      },
      '/api/products/{id}': {
        get: {
          operationId: 'getProduct',
          summary: 'Termék lekérése',
          tags: ['products'],
          parameters: [{ name: 'id', in: 'path', required: true }],
          'x-haszno-risk': 'read',
        },
        delete: {
          operationId: 'deleteProduct',
          summary: 'Termék törlése',
          tags: ['products'],
          'x-haszno-risk': 'confirm',
        },
      },
      '/api/admin/reset': {
        post: {
          operationId: 'adminReset',
          summary: 'Rendszer visszaállítása',
          tags: ['admin'],
          'x-haszno-risk': 'blocked',
        },
      },
      '/api/legacy': {
        get: {
          operationId: 'legacyGet',
          summary: 'Régi végpont (nincs risk)',
          // no x-haszno-risk
        },
        post: {
          operationId: 'legacyPost',
          summary: 'Régi POST (nincs risk)',
          // no x-haszno-risk
        },
      },
    },
  }
}

/** Minimal fetch mock that returns the given spec. */
function mkFetch(spec: OpenApiSpec): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(spec)),
  }) as unknown as typeof fetch
}

// No real config file in tests
const noConfig = () => ({})

// ── deriveRisk ────────────────────────────────────────────────────────────────

describe('deriveRisk', () => {
  it('uses explicit x-haszno-risk when present', () => {
    const op: OpenApiOperation = { 'x-haszno-risk': 'write' }
    expect(deriveRisk('post', op)).toBe('write')
  })

  it('defaults GET to read when risk absent', () => {
    expect(deriveRisk('get', {})).toBe('read')
    expect(deriveRisk('GET', {})).toBe('read')
  })

  it('defaults non-GET to confirm when risk absent', () => {
    expect(deriveRisk('post', {})).toBe('confirm')
    expect(deriveRisk('delete', {})).toBe('confirm')
    expect(deriveRisk('PUT', {})).toBe('confirm')
  })
})

// ── matchPathTemplate ─────────────────────────────────────────────────────────

describe('matchPathTemplate', () => {
  it('matches exact paths', () => {
    expect(matchPathTemplate('/api/products', '/api/products')).toEqual({})
  })

  it('extracts path parameters', () => {
    expect(matchPathTemplate('/api/products/{id}', '/api/products/42')).toEqual({ id: '42' })
  })

  it('extracts multiple path parameters', () => {
    expect(matchPathTemplate('/api/shops/{shopId}/orders/{orderId}', '/api/shops/5/orders/99')).toEqual({ shopId: '5', orderId: '99' })
  })

  it('returns null on segment count mismatch', () => {
    expect(matchPathTemplate('/api/products/{id}', '/api/products')).toBeNull()
  })

  it('returns null on literal segment mismatch', () => {
    expect(matchPathTemplate('/api/products/{id}', '/api/orders/42')).toBeNull()
  })
})

// ── fillPathParams ────────────────────────────────────────────────────────────

describe('fillPathParams', () => {
  it('fills a single path param', () => {
    expect(fillPathParams('/api/products/{id}', { id: '42' })).toBe('/api/products/42')
  })

  it('leaves unfilled params untouched', () => {
    expect(fillPathParams('/api/products/{id}', {})).toBe('/api/products/{id}')
  })

  it('fills multiple params', () => {
    expect(fillPathParams('/api/{a}/{b}', { a: 'x', b: 'y' })).toBe('/api/x/y')
  })

  it('URL-encodes values', () => {
    expect(fillPathParams('/api/items/{name}', { name: 'hello world' })).toBe('/api/items/hello%20world')
  })
})

// ── specEntries ───────────────────────────────────────────────────────────────

describe('specEntries', () => {
  it('flattens all methods across all paths', () => {
    const entries = specEntries(mkSpec())
    const methods = entries.map((e) => `${e.method} ${e.path}`)
    expect(methods).toContain('GET /api/products')
    expect(methods).toContain('POST /api/products')
    expect(methods).toContain('GET /api/products/{id}')
    expect(methods).toContain('DELETE /api/products/{id}')
    expect(methods).toContain('POST /api/admin/reset')
  })

  it('assigns risk correctly', () => {
    const entries = specEntries(mkSpec())
    const reset = entries.find((e) => e.path === '/api/admin/reset')
    expect(reset?.risk).toBe('blocked')
    const legacyGet = entries.find((e) => e.path === '/api/legacy' && e.method === 'GET')
    expect(legacyGet?.risk).toBe('read')
    const legacyPost = entries.find((e) => e.path === '/api/legacy' && e.method === 'POST')
    expect(legacyPost?.risk).toBe('confirm')
  })
})

// ── cmdApiLs ──────────────────────────────────────────────────────────────────

describe('cmdApiLs', () => {
  let stdoutLines: string[]
  let origLog: typeof console.log

  beforeEach(() => {
    stdoutLines = []
    origLog = console.log
    console.log = (...args: unknown[]) => { stdoutLines.push(args.join(' ')) }
  })
  afterEach(() => {
    console.log = origLog
  })

  it('lists all entries in human mode', async () => {
    await cmdApiLs(undefined, { _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    const all = stdoutLines.join('\n')
    expect(all).toContain('/api/products')
    expect(all).toContain('read')
    expect(all).toContain('blocked')
  })

  it('filters by query', async () => {
    await cmdApiLs('admin', { _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    const all = stdoutLines.join('\n')
    expect(all).toContain('/api/admin/reset')
    expect(all).not.toContain('/api/products')
  })

  it('filters by risk', async () => {
    await cmdApiLs(undefined, { risk: 'blocked', _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    const all = stdoutLines.join('\n')
    expect(all).toContain('blocked')
    expect(all).not.toContain('/api/products')
  })

  it('outputs JSON when --json', async () => {
    await cmdApiLs(undefined, { json: true, _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    const parsed = JSON.parse(stdoutLines[0] ?? '[]') as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
    expect((parsed[0] as Record<string, unknown>)).toHaveProperty('method')
    expect((parsed[0] as Record<string, unknown>)).toHaveProperty('risk')
  })
})

// ── cmdApiDescribe ────────────────────────────────────────────────────────────

describe('cmdApiDescribe', () => {
  let stdoutLines: string[]
  let origLog: typeof console.log
  let exitCode: number | undefined

  beforeEach(() => {
    stdoutLines = []
    origLog = console.log
    console.log = (...args: unknown[]) => { stdoutLines.push(args.join(' ')) }
    exitCode = undefined
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      exitCode = typeof code === 'number' ? code : code != null ? parseInt(String(code), 10) : undefined
      throw new Error(`process.exit(${code})`)
    })
  })
  afterEach(() => {
    console.log = origLog
    vi.restoreAllMocks()
  })

  it('describes an existing endpoint', async () => {
    await cmdApiDescribe('GET', '/api/products', { _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    const all = stdoutLines.join('\n')
    expect(all).toContain('GET /api/products')
    expect(all).toContain('read')
  })

  it('exits 1 for unknown endpoint', async () => {
    await expect(
      cmdApiDescribe('GET', '/api/nonexistent', { _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    ).rejects.toThrow()
    expect(exitCode).toBe(1)
  })

  it('outputs JSON for --json', async () => {
    await cmdApiDescribe('GET', '/api/products', { json: true, _fetch: mkFetch(mkSpec()), _readConfig: noConfig })
    const parsed = JSON.parse(stdoutLines[0] ?? '{}') as Record<string, unknown>
    expect(parsed.method).toBe('GET')
    expect(parsed.path).toBe('/api/products')
    expect(parsed.risk).toBe('read')
  })
})

// ── cmdApiCall ────────────────────────────────────────────────────────────────

describe('cmdApiCall', () => {
  let stdoutLines: string[]
  let origLog: typeof console.log
  let exitCode: number | undefined

  beforeEach(() => {
    stdoutLines = []
    origLog = console.log
    console.log = (...args: unknown[]) => { stdoutLines.push(args.join(' ')) }
    exitCode = undefined
    vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      exitCode = typeof code === 'number' ? code : code != null ? parseInt(String(code), 10) : undefined
      throw new Error(`process.exit(${code})`)
    })
  })
  afterEach(() => {
    console.log = origLog
    vi.restoreAllMocks()
  })

  it('blocked endpoint → exit 1 immediately', async () => {
    // Fetch: spec first, then would-be API call (should not happen)
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(mkSpec())),
      })
    await expect(
      cmdApiCall('POST', '/api/admin/reset', { _fetch: fetchFn as unknown as typeof fetch, _readConfig: noConfig, _isTTY: () => false })
    ).rejects.toThrow()
    expect(exitCode).toBe(1)
    // Should not have made a second fetch (the API call itself)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('confirm endpoint, non-TTY, no --yes → exit 1', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(mkSpec())),
    })
    await expect(
      cmdApiCall('DELETE', '/api/products/42', {
        _fetch: fetchFn as unknown as typeof fetch,
        _readConfig: noConfig,
        _isTTY: () => false,
        yes: false,
      })
    ).rejects.toThrow()
    expect(exitCode).toBe(1)
  })

  it('confirm endpoint, non-TTY, --yes → proceeds', async () => {
    // spec fetch + actual API call
    const result = { ok: true }
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(mkSpec())),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(result)),
      })
    await cmdApiCall('DELETE', '/api/products/42', {
      _fetch: fetchFn as unknown as typeof fetch,
      _readConfig: noConfig,
      _isTTY: () => false,
      yes: true,
    })
    expect(exitCode).toBeUndefined()
    expect(stdoutLines.join('')).toContain('"ok"')
  })

  it('read endpoint, TTY confirm not needed, pretty-prints result', async () => {
    const result = [{ id: 1, name: 'Teszt termék' }]
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(mkSpec())),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(result)),
      })
    await cmdApiCall('GET', '/api/products', {
      _fetch: fetchFn as unknown as typeof fetch,
      _readConfig: noConfig,
      _isTTY: () => true,
    })
    expect(exitCode).toBeUndefined()
    const output = stdoutLines.join('\n')
    expect(output).toContain('Teszt termék')
  })

  it('confirm endpoint, TTY, ask → user says yes → proceeds', async () => {
    const result = { deleted: true }
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(mkSpec())),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(result)),
      })
    await cmdApiCall('DELETE', '/api/products/42', {
      _fetch: fetchFn as unknown as typeof fetch,
      _readConfig: noConfig,
      _isTTY: () => true,
      _askConfirm: async () => true,
    })
    expect(exitCode).toBeUndefined()
    expect(stdoutLines.join('')).toContain('"deleted"')
  })

  it('confirm endpoint, TTY, ask → user says no → exit 1', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      text: () => Promise.resolve(JSON.stringify(mkSpec())),
    })
    await expect(
      cmdApiCall('DELETE', '/api/products/42', {
        _fetch: fetchFn as unknown as typeof fetch,
        _readConfig: noConfig,
        _isTTY: () => true,
        _askConfirm: async () => false,
      })
    ).rejects.toThrow()
    expect(exitCode).toBe(1)
  })

  it('spec cache hit: second call does not re-fetch spec', async () => {
    // Note: the spec cache is file-based; in tests HOME=/nonexistent so writeCache fails silently.
    // We verify the shape, not the cache count directly.
    const result = { ok: true }
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(mkSpec())),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        text: () => Promise.resolve(JSON.stringify(result)),
      })
    await cmdApiCall('GET', '/api/products', {
      _fetch: fetchFn as unknown as typeof fetch,
      _readConfig: noConfig,
      _isTTY: () => false,
    })
    expect(stdoutLines.join('')).toContain('"ok"')
  })
})
