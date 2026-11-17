/**
 * Unit tests for src/client/tool-context.ts and the X-Haszno-Tool header
 * injected by src/client/http.ts.
 *
 * Tests verify:
 *  1. setCurrentCommandPath + currentToolName round-trip.
 *  2. currentToolName() returns undefined before setCurrentCommandPath is called.
 *  3. Names that violate the header pattern are rejected.
 *  4. http.ts adds X-Haszno-Tool when a command path is set.
 *  5. http.ts omits X-Haszno-Tool when no command path is set.
 *
 * No live network calls are made.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setCurrentCommandPath,
  currentToolName,
} from '../client/tool-context.js'
import { request } from '../client/http.js'

// Reset the module-level state before each test.
beforeEach(() => {
  // Clear by setting an invalid empty string (filtered out by TOOL_HEADER_RE).
  setCurrentCommandPath('')
})

// ── 1–3: tool-context module ──────────────────────────────────────────────────

describe('setCurrentCommandPath / currentToolName', () => {
  it('returns undefined when no path has been set (empty string)', () => {
    expect(currentToolName()).toBeUndefined()
  })

  it('returns the path after setCurrentCommandPath is called', () => {
    setCurrentCommandPath('cli products list')
    expect(currentToolName()).toBe('cli products list')
  })

  it('rejects paths that exceed 80 characters', () => {
    setCurrentCommandPath('cli ' + 'x'.repeat(80))
    expect(currentToolName()).toBeUndefined()
  })

  it('rejects paths with disallowed characters', () => {
    setCurrentCommandPath('cli bad!command')
    expect(currentToolName()).toBeUndefined()
  })

  it('allows the full permitted character set', () => {
    const path = 'cli webshop theme:set - v1.0'
    setCurrentCommandPath(path)
    expect(currentToolName()).toBe(path)
  })
})

// ── 4–5: X-Haszno-Tool header in http.ts ─────────────────────────────────────

describe('http.ts X-Haszno-Tool header', () => {
  it('adds X-Haszno-Tool when a command path is set', async () => {
    setCurrentCommandPath('cli products list')

    const capturedHeaders: Record<string, string> = {}
    const mockFetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        capturedHeaders[k] = v
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    await request('GET', '/api/ping', undefined, {
      baseUrl: 'https://test.haszno.hu',
      apiKey: 'haszno_test123',
      fetch: mockFetch as typeof fetch,
      maxRetries: 1,
    })

    expect(capturedHeaders['X-Haszno-Tool']).toBe('cli products list')
  })

  it('omits X-Haszno-Tool when no command path is set', async () => {
    // beforeEach already cleared the path via empty string.
    const capturedHeaders: Record<string, string> = {}
    const mockFetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        capturedHeaders[k] = v
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    await request('GET', '/api/ping', undefined, {
      baseUrl: 'https://test.haszno.hu',
      apiKey: 'haszno_test123',
      fetch: mockFetch as typeof fetch,
      maxRetries: 1,
    })

    expect(capturedHeaders['X-Haszno-Tool']).toBeUndefined()
  })
})
