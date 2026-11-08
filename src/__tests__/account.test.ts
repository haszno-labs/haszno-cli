import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import type { HasznoClient } from '../client/index.js'
import {
  registerAccountCommands,
  readConfigFile,
  writeConfigFile,
} from '../commands/account.js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeClient(overrides: Partial<Record<string, unknown>> = {}): HasznoClient {
  const defaults = {
    health: {
      check: vi.fn().mockResolvedValue({ ok: true }),
    },
    settings: {
      get: vi.fn().mockResolvedValue({
        id: 1, undercutPct: 2, minMarginPct: 10, vatPct: 27, automationPaused: false,
      }),
      update: vi.fn().mockResolvedValue({
        id: 1, undercutPct: 3, minMarginPct: 10, vatPct: 27, automationPaused: false,
      }),
    },
    stats: {
      get: vi.fn().mockResolvedValue({
        products: 50, losing: 3, overMarket: 5, toFix: 8, orders: 2,
      }),
      getImpact: vi.fn().mockResolvedValue({
        days: 30, extraProfit: 15000, baseline: 50000,
        pctGain: 30, orders: 10, autoForwardedOrders: 7,
      }),
    },
    suppliers: {
      list: vi.fn().mockResolvedValue([
        {
          id: 1, name: 'Teszt Kft.', orderMode: 'email',
          email: 'test@example.com', network: false,
          category: null, country: null, description: null,
          shopUrl: null, createdAt: '2024-01-01',
        },
      ]),
    },
  }
  return { ...defaults, ...overrides } as unknown as HasznoClient
}

/** Build a fresh Commander program for each test; exitOverride prevents process.exit on help/version. */
function buildProgram(client: HasznoClient, configPath?: string) {
  const prog = new Command()
    .name('haszno')
    .version('0.1.0')
    .option('--json', 'JSON output')
    .exitOverride()
  registerAccountCommands(prog, client, configPath ? { configPath } : {})
  return prog
}

/** Capture process.stdout.write / process.stderr.write calls as plain strings. */
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

/** Mock process.exit so tests don't terminate; throws instead. */
function mockExit() {
  return vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called')
  }) as typeof process.exit)
}

// ── Config file tests ─────────────────────────────────────────────────────────

describe('readConfigFile', () => {
  it('returns empty object when file does not exist', () => {
    expect(readConfigFile('/nonexistent/path/config.json')).toEqual({})
  })

  it('returns parsed config when file exists', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-test-'))
    const cfgPath = join(tmp, 'config.json')
    try {
      writeConfigFile({ apiUrl: 'https://test.example', apiKey: 'secret' }, cfgPath)
      const result = readConfigFile(cfgPath)
      expect(result.apiUrl).toBe('https://test.example')
      expect(result.apiKey).toBe('secret')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('returns empty object on malformed JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-test-'))
    const cfgPath = join(tmp, 'config.json')
    try {
      writeFileSync(cfgPath, 'not valid json', 'utf-8')
      expect(readConfigFile(cfgPath)).toEqual({})
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('writeConfigFile', () => {
  it('creates directories and writes JSON', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-test-'))
    const cfgPath = join(tmp, 'sub', 'config.json')
    try {
      writeConfigFile({ apiUrl: 'https://demo.example' }, cfgPath)
      const back = readConfigFile(cfgPath)
      expect(back.apiUrl).toBe('https://demo.example')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

// ── configure command ─────────────────────────────────────────────────────────

describe('configure command', () => {
  it('saves --api-url and --api-key to config file', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'haszno-test-'))
    const cfgPath = join(tmp, 'config.json')
    const cap = captureOutput()
    try {
      const prog = buildProgram(makeClient(), cfgPath)
      await prog.parseAsync(
        ['configure', '--api-url', 'https://my.shop', '--api-key', 'k123'],
        { from: 'user' },
      )
      const cfg = readConfigFile(cfgPath)
      expect(cfg.apiUrl).toBe('https://my.shop')
      expect(cfg.apiKey).toBe('k123')
      expect(cap.text()).toContain('elmentve')
    } finally {
      cap.restore()
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('exits 2 when no flags and stdin is not a TTY', async () => {
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      const prog = buildProgram(makeClient())
      await expect(
        prog.parseAsync(['configure'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally {
      cap.restore()
      exitSpy.mockRestore()
    }
  })
})

// ── account ping ─────────────────────────────────────────────────────────────

describe('account ping', () => {
  it('calls health.check() and prints ok message', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'ping'], { from: 'user' })
      expect(client.health.check).toHaveBeenCalledOnce()
      expect(cap.text()).toContain('elérhető')
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON with --json flag', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['--json', 'account', 'ping'], { from: 'user' })
      const parsed = JSON.parse(cap.text()) as { ok: boolean }
      expect(parsed.ok).toBe(true)
    } finally {
      cap.restore()
    }
  })

  it('exits 1 when health.check returns ok=false', async () => {
    const client = makeClient({
      health: { check: vi.fn().mockResolvedValue({ ok: false }) },
    })
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildProgram(client).parseAsync(['account', 'ping'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      cap.restore()
      exitSpy.mockRestore()
    }
  })
})

// ── account stats ─────────────────────────────────────────────────────────────

describe('account stats', () => {
  it('calls stats.get() and prints table', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'stats'], { from: 'user' })
      expect(client.stats.get).toHaveBeenCalledOnce()
      expect(cap.text()).toContain('Termékek')
      expect(cap.text()).toContain('50')
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON with --json', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['--json', 'account', 'stats'], { from: 'user' })
      const parsed = JSON.parse(cap.text()) as { products: number }
      expect(parsed.products).toBe(50)
    } finally {
      cap.restore()
    }
  })
})

// ── account impact ────────────────────────────────────────────────────────────

describe('account impact', () => {
  it('calls stats.getImpact() with default 30 days', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'impact'], { from: 'user' })
      expect(client.stats.getImpact).toHaveBeenCalledWith({ days: 30 })
      expect(cap.text()).toContain('Haszon-mérő')
    } finally {
      cap.restore()
    }
  })

  it('passes custom --days value', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(
        ['account', 'impact', '--days', '7'],
        { from: 'user' },
      )
      expect(client.stats.getImpact).toHaveBeenCalledWith({ days: 7 })
    } finally {
      cap.restore()
    }
  })

  it('exits 2 on invalid --days value', async () => {
    const client = makeClient()
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildProgram(client).parseAsync(['account', 'impact', '--days', 'abc'], { from: 'user' }),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally {
      cap.restore()
      exitSpy.mockRestore()
    }
  })
})

// ── account suppliers ─────────────────────────────────────────────────────────

describe('account suppliers', () => {
  it('calls suppliers.list() and prints rows', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'suppliers'], { from: 'user' })
      expect(client.suppliers.list).toHaveBeenCalledOnce()
      expect(cap.text()).toContain('Teszt Kft.')
    } finally {
      cap.restore()
    }
  })

  it('prints empty message when no suppliers', async () => {
    const client = makeClient({
      suppliers: { list: vi.fn().mockResolvedValue([]) },
    })
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'suppliers'], { from: 'user' })
      expect(cap.text()).toContain('Nincs')
    } finally {
      cap.restore()
    }
  })
})

// ── account whoami ────────────────────────────────────────────────────────────

describe('account whoami', () => {
  it('calls health.check() and settings.get() and prints both', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'whoami'], { from: 'user' })
      expect(client.health.check).toHaveBeenCalledOnce()
      expect(client.settings.get).toHaveBeenCalledOnce()
      expect(cap.text()).toContain('Kapcsolat')
      expect(cap.text()).toContain('undercutPct')
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON with --json', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['--json', 'account', 'whoami'], { from: 'user' })
      const parsed = JSON.parse(cap.text()) as { health: { ok: boolean }; settings: { undercutPct: number } }
      expect(parsed.health.ok).toBe(true)
      expect(parsed.settings.undercutPct).toBe(2)
    } finally {
      cap.restore()
    }
  })
})

// ── account settings ──────────────────────────────────────────────────────────

describe('account settings', () => {
  it('calls settings.get() and prints current settings', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'settings'], { from: 'user' })
      expect(client.settings.get).toHaveBeenCalledOnce()
      expect(cap.text()).toContain('undercutPct')
      expect(cap.text()).toContain('2%')
    } finally {
      cap.restore()
    }
  })
})

// ── account settings update ───────────────────────────────────────────────────

describe('account settings update', () => {
  it('calls settings.update() with merged values when --yes', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(
        ['account', 'settings', 'update', '--undercut-pct', '3', '--yes'],
        { from: 'user' },
      )
      expect(client.settings.get).toHaveBeenCalledOnce()
      expect(client.settings.update).toHaveBeenCalledWith(
        expect.objectContaining({ undercutPct: 3 }),
      )
      expect(cap.text()).toContain('frissítve')
    } finally {
      cap.restore()
    }
  })

  it('exits 2 when no option flags provided', async () => {
    const client = makeClient()
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildProgram(client).parseAsync(
          ['account', 'settings', 'update', '--yes'],
          { from: 'user' },
        ),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
    } finally {
      cap.restore()
      exitSpy.mockRestore()
    }
  })

  it('exits 2 when --yes omitted and stdin is not a TTY', async () => {
    const client = makeClient()
    const cap = captureOutput()
    const exitSpy = mockExit()
    try {
      await expect(
        buildProgram(client).parseAsync(
          ['account', 'settings', 'update', '--undercut-pct', '5'],
          { from: 'user' },
        ),
      ).rejects.toThrow('process.exit called')
      expect(exitSpy).toHaveBeenCalledWith(2)
      expect(cap.errText()).toContain('--yes')
    } finally {
      cap.restore()
      exitSpy.mockRestore()
    }
  })

  it('outputs JSON on success with --json', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(
        ['--json', 'account', 'settings', 'update', '--undercut-pct', '3', '--yes'],
        { from: 'user' },
      )
      const parsed = JSON.parse(cap.text()) as { undercutPct: number }
      expect(parsed.undercutPct).toBe(3)
    } finally {
      cap.restore()
    }
  })
})

// ── account version ───────────────────────────────────────────────────────────

describe('account version', () => {
  it('calls health.check() and prints version + API status', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'version'], { from: 'user' })
      expect(client.health.check).toHaveBeenCalledOnce()
      expect(cap.text()).toContain('0.1.0')
      expect(cap.text()).toContain('elérhető')
    } finally {
      cap.restore()
    }
  })

  it('outputs JSON with --json', async () => {
    const client = makeClient()
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['--json', 'account', 'version'], { from: 'user' })
      const parsed = JSON.parse(cap.text()) as { version: string; api: string }
      expect(parsed.version).toBe('0.1.0')
      expect(parsed.api).toBe('ok')
    } finally {
      cap.restore()
    }
  })

  it('reports unreachable when health.check() throws', async () => {
    const client = makeClient({
      health: { check: vi.fn().mockRejectedValue(new Error('network error')) },
    })
    const cap = captureOutput()
    try {
      await buildProgram(client).parseAsync(['account', 'version'], { from: 'user' })
      expect(cap.text()).toContain('nem elérhető')
    } finally {
      cap.restore()
    }
  })
})
