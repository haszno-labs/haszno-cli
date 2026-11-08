/**
 * Unit tests for catalogue.ts, peers.ts, and blog.ts CLI commands.
 * No network calls — all client methods are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Command } from 'commander'
import type {
  HasznoClient,
  CatalogueSearchResult,
  ImportListItem,
  StoreConnection,
  ConnectStorePushResult,
  PeerInvite,
  PeerLink,
  BlogPost,
  BlogListResult,
} from '../client/index.js'

import { registerCatalogueCommands } from '../commands/catalogue.js'
import { registerPeersCommands } from '../commands/peers.js'
import { registerBlogCommands } from '../commands/blog.js'

// ---- fixtures ---------------------------------------------------------------

const CAT_RESULT: CatalogueSearchResult = {
  items: [
    {
      id: 1,
      name: 'Widget Pro',
      imageUrl: null,
      partnerId: 10,
      partnerName: 'Alfa Kft.',
      partnerCountry: 'HU',
      category: 'Elektronika',
      categoryKey: 'elektronika',
      wholesaleNet: 3000,
      rrpGross: 7000,
      marginNet: 2512,
      marginPct: 44.0,
      stock: 50,
      example: false,
      inImportList: false,
      inShop: false,
    },
  ],
  total: 1,
  facets: { partners: [], countries: [], categories: [], marginBuckets: [] },
}

const IMPORT_ITEM: ImportListItem = {
  id: 5,
  networkProductId: 1,
  name: 'Widget Pro',
  sku: 'WID-001',
  partnerName: 'Alfa Kft.',
  wholesaleNet: 3000,
  rrpGross: 7000,
  stock: 50,
  pushStatus: 'varakozik',
  targetConnectionId: null,
  targetExternalId: null,
  addedAt: '2026-11-01T10:00:00Z',
}

const CONNECTION: StoreConnection = {
  id: 1,
  platform: 'woocommerce',
  name: 'Fő webshop',
  status: 'kapcsolva',
  domain: 'mybolt.hu',
  lastError: null,
  connectedAt: '2026-10-01T00:00:00Z',
  config: {},
  lastSyncAt: '2026-11-07T12:00:00Z',
  createdAt: '2026-09-15T00:00:00Z',
}

const PEER_INVITE: PeerInvite = {
  id: 1,
  code: 'inv_abc123',
  createdBy: 'mybolt',
  supplierId: 42,
  expiresAt: '2026-12-31T23:59:00Z',
  acceptedBy: null,
  acceptedAt: null,
  revokedAt: null,
  createdAt: '2026-11-08T00:00:00Z',
}

const PEER_LINK: PeerLink = {
  id: 1,
  supplierId: 42,
  partner: 'partnerbolt',
  createdAt: '2026-11-08T10:00:00Z',
}

const BLOG_POST: BlogPost = {
  id: 1,
  slug: '2026-w45-het-osszefoglalo',
  period: 'het',
  periodStart: '2026-11-03',
  periodEnd: '2026-11-09',
  title: '2026/45. heti piac-összefoglaló',
  summary: 'Az elektronika kategóriában erős kereslet mutatkozott.',
  bodyMd: '## Fő trendek\n\nAz elektronika...',
  data: { rankedCategories: [{ category: 'Elektronika', score: 0.9 }], shopsCount: 12 },
  ogTitle: null,
  publishedAt: '2026-11-08T08:00:00Z',
  status: 'publikalt',
  createdAt: '2026-11-08T07:00:00Z',
  updatedAt: '2026-11-08T08:00:00Z',
}

// ---- client + program factories --------------------------------------------

function makeClient(overrides: Partial<HasznoClient> = {}): HasznoClient {
  return {
    health: { check: vi.fn() },
    settings: { get: vi.fn(), update: vi.fn() },
    products: { list: vi.fn(), update: vi.fn(), setListing: vi.fn(), generateAiDescription: vi.fn(), applyPrices: vi.fn() },
    stats: { get: vi.fn(), getImpact: vi.fn() },
    suppliers: { list: vi.fn() },
    feeds: { importFeed: vi.fn(), importMarketPrices: vi.fn() },
    orders: { list: vi.fn(), receiveOrder: vi.fn(), ship: vi.fn(), createDemo: vi.fn() },
    recommendations: { get: vi.fn(), getAiShortlist: vi.fn(), fillTrendKeywords: vi.fn() },
    rules: { listTemplates: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), run: vi.fn(), runAll: vi.fn(), trigger: vi.fn(), listRuns: vi.fn(), undoUnlists: vi.fn() },
    proposals: { list: vi.fn(), approve: vi.fn(), reject: vi.fn(), rollback: vi.fn() },
    automation: { get: vi.fn(), set: vi.fn() },
    network: { listSuppliers: vi.fn(), getSupplierProducts: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), sync: vi.fn(), getSupplierView: vi.fn() },
    catalogue: {
      search: vi.fn().mockResolvedValue(CAT_RESULT),
    },
    importList: {
      list: vi.fn().mockResolvedValue([IMPORT_ITEM]),
      add: vi.fn().mockResolvedValue({ added: 1, skipped: 0 }),
      // Default: no-target path returns { pushed } only (ImportListPushResult)
      push: vi.fn().mockResolvedValue({ pushed: 1 }),
    },
    connections: {
      list: vi.fn().mockResolvedValue([CONNECTION]),
      get: vi.fn().mockResolvedValue(CONNECTION),
    },
    peers: {
      createInvite: vi.fn().mockResolvedValue(PEER_INVITE),
      listInvites: vi.fn().mockResolvedValue([PEER_INVITE]),
      revokeInvite: vi.fn().mockResolvedValue({ revoked: true }),
      acceptInvite: vi.fn().mockResolvedValue(PEER_LINK),
      listLinks: vi.fn().mockResolvedValue([PEER_LINK]),
      removeLink: vi.fn().mockResolvedValue({ removed: true }),
      setVisibility: vi.fn().mockResolvedValue({ id: 42, visibility: 'public' }),
    },
    blog: {
      list: vi.fn().mockResolvedValue({ posts: [BLOG_POST], total: 1, page: 1, perPage: 1 } as BlogListResult),
      get: vi.fn().mockResolvedValue(BLOG_POST),
    },
    ...overrides,
  } as unknown as HasznoClient
}

function makeCatalogueProgram(client: HasznoClient): Command {
  const program = new Command().name('haszno').exitOverride().option('--json', 'JSON output')
  registerCatalogueCommands(program, client)
  return program
}

function makePeersProgram(client: HasznoClient): Command {
  const program = new Command().name('haszno').exitOverride().option('--json', 'JSON output')
  registerPeersCommands(program, client)
  return program
}

function makeBlogProgram(client: HasznoClient): Command {
  const program = new Command().name('haszno').exitOverride().option('--json', 'JSON output')
  registerBlogCommands(program, client)
  return program
}

async function run(program: Command, ...args: string[]): Promise<void> {
  await program.parseAsync(args, { from: 'user' })
}

// ---- stdout spy setup -------------------------------------------------------

let stdoutSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ==============================================================================
// catalogue search
// ==============================================================================

describe('haszno catalogue search', () => {
  it('calls catalogue.search and prints table output', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, 'catalogue', 'search')
    expect(client.catalogue.search).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
    expect(output).toContain('Widget Pro')
  })

  it('--json prints JSON', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, '--json', 'catalogue', 'search', '--q', 'widget')
    expect(client.catalogue.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'widget' }))
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as CatalogueSearchResult
    expect(parsed.items).toHaveLength(1)
  })

  it('passes --min-margin and --in-stock flags', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, 'catalogue', 'search', '--min-margin', '20', '--in-stock')
    expect(client.catalogue.search).toHaveBeenCalledWith(
      expect.objectContaining({ minMarginPct: 20, inStock: true }),
    )
  })
})

// ==============================================================================
// import list / push
// ==============================================================================

describe('haszno import list', () => {
  it('calls importList.list', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, 'import', 'list')
    expect(client.importList.list).toHaveBeenCalled()
  })

  it('--json prints JSON array', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, '--json', 'import', 'list')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as ImportListItem[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].sku).toBe('WID-001')
  })

  it('passes --status filter', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, 'import', 'list', '--status', 'hiba')
    expect(client.importList.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'hiba' }))
  })
})

describe('haszno import add', () => {
  it('calls importList.add with parsed ids', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, 'import', 'add', '1', '2', '3')
    expect(client.importList.add).toHaveBeenCalledWith({ networkProductIds: [1, 2, 3] })
  })

  it('--json prints result JSON', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, '--json', 'import', 'add', '5')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as { added: number; skipped: number }
    expect(parsed.added).toBe(1)
  })
})

describe('haszno import push', () => {
  it('prints preview and exits without --yes', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    await run(program, 'import', 'push', '--ids', '5,6')
    expect(client.importList.push).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('no-target path: calls importList.push without targetConnectionId and prints pushed only', async () => {
    // The API for the no-target path returns { pushed } only — no failed/errors.
    const client = makeClient({
      importList: {
        list: vi.fn(),
        add: vi.fn(),
        push: vi.fn().mockResolvedValue({ pushed: 2 }),
      },
    })
    const program = makeCatalogueProgram(client)
    await run(program, 'import', 'push', '--ids', '5,6', '--yes')
    expect(client.importList.push).toHaveBeenCalledWith({ ids: [5, 6] })
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
    expect(output).toContain('Kiküldve: 2')
    // Must NOT contain 'sikertelen' (failed) since no-target path has no failed field.
    expect(output).not.toContain('sikertelen')
  })

  it('target path: calls importList.push with targetConnectionId and prints pushed/failed/errors', async () => {
    // The API for the target path returns { pushed, failed, errors }.
    const connectResult: ConnectStorePushResult = { pushed: 1, failed: 1, errors: ['Widget Pro: out of stock'] }
    const client = makeClient({
      importList: {
        list: vi.fn(),
        add: vi.fn(),
        push: vi.fn().mockResolvedValue(connectResult),
      },
    })
    const program = makeCatalogueProgram(client)
    await run(program, 'import', 'push', '--ids', '5', '--target', '1', '--yes')
    expect(client.importList.push).toHaveBeenCalledWith({ ids: [5], targetConnectionId: 1 })
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
    expect(output).toContain('Kiküldve: 1')
    expect(output).toContain('sikertelen: 1')
  })

  it('target path: does not crash when errors array is empty', async () => {
    // Regression guard: if the connected-store API omits errors, the CLI must not throw.
    const client = makeClient({
      importList: {
        list: vi.fn(),
        add: vi.fn(),
        // Simulate a future regression where errors is missing from the response
        push: vi.fn().mockResolvedValue({ pushed: 1, failed: 0 } as ConnectStorePushResult),
      },
    })
    const program = makeCatalogueProgram(client)
    // Must not throw even if errors is undefined (regression guard)
    await expect(run(program, 'import', 'push', '--ids', '5', '--target', '1', '--yes')).resolves.not.toThrow()
  })

  it('--json with no-target prints { pushed } JSON', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, '--json', 'import', 'push', '--ids', '5', '--yes')
    expect(client.importList.push).toHaveBeenCalledWith({ ids: [5] })
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as { pushed: number }
    expect(parsed.pushed).toBe(1)
    expect('failed' in parsed).toBe(false)
  })

  it('passes --target as targetConnectionId', async () => {
    const client = makeClient({
      importList: {
        list: vi.fn(),
        add: vi.fn(),
        push: vi.fn().mockResolvedValue({ pushed: 1, failed: 0, errors: [] }),
      },
    })
    const program = makeCatalogueProgram(client)
    await run(program, 'import', 'push', '--ids', '5', '--target', '1', '--yes')
    expect(client.importList.push).toHaveBeenCalledWith(
      expect.objectContaining({ ids: [5], targetConnectionId: 1 }),
    )
  })
})

// ==============================================================================
// connections list
// ==============================================================================

describe('haszno connections list', () => {
  it('calls connections.list', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, 'connections', 'list')
    expect(client.connections.list).toHaveBeenCalled()
  })

  it('--json prints JSON', async () => {
    const client = makeClient()
    const program = makeCatalogueProgram(client)
    await run(program, '--json', 'connections', 'list')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as StoreConnection[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].platform).toBe('woocommerce')
  })

  it('filters by --status', async () => {
    const client = makeClient({
      connections: {
        list: vi.fn().mockResolvedValue([CONNECTION, { ...CONNECTION, id: 2, status: 'uj' }]),
        get: vi.fn(),
      },
    })
    const program = makeCatalogueProgram(client)
    await run(program, '--json', 'connections', 'list', '--status', 'kapcsolva')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as StoreConnection[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].status).toBe('kapcsolva')
  })
})

// ==============================================================================
// peers
// ==============================================================================

describe('haszno peers invite', () => {
  it('prints preview and exits non-zero without --yes', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    await run(program, 'peers', 'invite', '--supplier', '42', '--expires', '2026-12-31T23:59:00Z')
    expect(client.peers.createInvite).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(1)
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
    expect(output).toContain('--yes')
  })

  it('calls peers.createInvite and prints code with --yes', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    await run(program, 'peers', 'invite', '--supplier', '42', '--expires', '2026-12-31T23:59:00Z', '--yes')
    expect(client.peers.createInvite).toHaveBeenCalledWith({
      supplierId: 42,
      expiresAt: '2026-12-31T23:59:00Z',
    })
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
    expect(output).toContain('inv_abc123')
  })

  it('--json with --yes prints invite JSON', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    await run(program, '--json', 'peers', 'invite', '--supplier', '42', '--expires', '2026-12-31T23:59:00Z', '--yes')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as PeerInvite
    expect(parsed.code).toBe('inv_abc123')
  })
})

describe('haszno peers list', () => {
  it('calls peers.listInvites', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    await run(program, 'peers', 'list')
    expect(client.peers.listInvites).toHaveBeenCalled()
  })

  it('--json prints invites array', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    await run(program, '--json', 'peers', 'list')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as PeerInvite[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].code).toBe('inv_abc123')
  })
})

describe('haszno peers accept', () => {
  it('prints preview and exits without --yes', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never)
    await run(program, 'peers', 'accept', 'inv_abc123', '--acceptor', 'partnerbolt')
    expect(client.peers.acceptInvite).not.toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('calls peers.acceptInvite with --yes', async () => {
    const client = makeClient()
    const program = makePeersProgram(client)
    await run(program, '--json', 'peers', 'accept', 'inv_abc123', '--acceptor', 'partnerbolt', '--yes')
    expect(client.peers.acceptInvite).toHaveBeenCalledWith('inv_abc123', { acceptorId: 'partnerbolt' })
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as PeerLink
    expect(parsed.supplierId).toBe(42)
  })
})

// ==============================================================================
// blog
// ==============================================================================

describe('haszno blog latest', () => {
  it('calls blog.list and prints post', async () => {
    const client = makeClient()
    const program = makeBlogProgram(client)
    await run(program, 'blog', 'latest')
    expect(client.blog.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: 1 }),
    )
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('\n')
    expect(output).toContain('heti piac-összefoglaló')
  })

  it('--json prints BlogListResult', async () => {
    const client = makeClient()
    const program = makeBlogProgram(client)
    await run(program, '--json', 'blog', 'latest')
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => c[0] as string).join('')
    const parsed = JSON.parse(output) as { posts: BlogPost[]; total: number }
    expect(parsed.posts).toHaveLength(1)
    expect(parsed.posts[0].period).toBe('het')
  })

  it('--period passes filter', async () => {
    const client = makeClient()
    const program = makeBlogProgram(client)
    await run(program, 'blog', 'latest', '--period', 'honap', '--limit', '3')
    expect(client.blog.list).toHaveBeenCalledWith(
      expect.objectContaining({ period: 'honap', perPage: 3 }),
    )
  })
})
