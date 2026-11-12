import { describe, expect, it, vi } from 'vitest'
import { resolveConnection } from '../client/config.js'
import { request } from '../client/http.js'

const noConfig = () => ({})

describe('resolveConnection', () => {
  it('defaults to haszno.com without credentials', () => {
    expect(resolveConnection({}, {}, noConfig)).toEqual({ baseUrl: 'https://haszno.com', apiKey: undefined, basicAuth: undefined })
  })

  it('uses the config file written by `haszno login` when nothing else is set', () => {
    const conn = resolveConnection({}, {}, () => ({ apiUrl: 'https://self.example/', apiKey: 'from-file' }))
    expect(conn).toEqual({ baseUrl: 'https://self.example', apiKey: 'from-file', basicAuth: undefined })
  })

  it('reads basicAuth from the config file', () => {
    expect(resolveConnection({}, {}, () => ({ basicAuth: 'demo:pw' })).basicAuth).toBe('demo:pw')
  })

  it('prefers environment variables over the config file', () => {
    const conn = resolveConnection({}, { HASZNO_API_KEY: 'from-env', HASZNO_API_URL: 'https://env.example' }, () => ({ apiUrl: 'https://file.example', apiKey: 'from-file' }))
    expect(conn).toMatchObject({ baseUrl: 'https://env.example', apiKey: 'from-env' })
  })

  it('never sends an environment key to a URL that only the config file names', () => {
    const readConfig = vi.fn(() => ({ apiUrl: 'https://file.example', apiKey: 'from-file' }))
    const conn = resolveConnection({}, { HASZNO_API_KEY: 'from-env' }, readConfig)
    expect(conn).toMatchObject({ baseUrl: 'https://haszno.com', apiKey: 'from-env' })
    expect(readConfig).not.toHaveBeenCalled()
  })

  it('prefers flags over the environment and the config file', () => {
    const conn = resolveConnection({ apiKey: 'from-flag', baseUrl: 'https://flag.example' }, { HASZNO_API_KEY: 'from-env', HASZNO_API_URL: 'https://env.example' }, () => ({ apiKey: 'from-file' }))
    expect(conn).toMatchObject({ baseUrl: 'https://flag.example', apiKey: 'from-flag' })
  })

  it('falls back to the legacy ARFUTAR_* variables before the config file', () => {
    const conn = resolveConnection({}, { ARFUTAR_API_KEY: 'legacy-env', ARFUTAR_API_URL: 'https://legacy.example' }, () => ({ apiKey: 'from-file' }))
    expect(conn).toMatchObject({ baseUrl: 'https://legacy.example', apiKey: 'legacy-env' })
  })

  it('uses the config URL with a --api-url-less login that saved only a URL', () => {
    expect(resolveConnection({}, {}, () => ({ apiUrl: 'https://only-url.example' })).baseUrl).toBe('https://only-url.example')
  })

  it('treats empty strings as unset', () => {
    expect(resolveConnection({ apiKey: '' }, { HASZNO_API_KEY: '' }, () => ({ apiKey: 'from-file' })).apiKey).toBe('from-file')
  })
})

describe('request() uses the saved config', () => {
  it('sends the key from the config file as x-api-key to the configured URL', async () => {
    const saved = { ...process.env }
    for (const k of ['HASZNO_API_KEY', 'HASZNO_API_URL', 'HASZNO_BASIC', 'ARFUTAR_API_KEY', 'ARFUTAR_API_URL', 'ARFUTAR_BASIC']) delete process.env[k]
    try {
      const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
      await request('GET', '/api/health', undefined, { fetch: fetchMock as unknown as typeof fetch, readConfig: () => ({ apiUrl: 'https://self.example', apiKey: 'from-file' }) })
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toBe('https://self.example/api/health')
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('from-file')
    } finally {
      Object.assign(process.env, saved)
    }
  })
})
