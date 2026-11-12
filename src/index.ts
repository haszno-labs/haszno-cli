/**
 * @haszno/cli — Haszno command-line interface.
 *
 * Global flags:
 *   --json             print machine-readable JSON instead of human tables
 *   --api-url <url>    override HASZNO_API_URL
 *   --api-key <token>  override token (sent as Authorization: Bearer)
 *
 * Authentication (in priority order):
 *   --api-key <token>  → Authorization: Bearer <token>
 *   HASZNO_API_TOKEN   → per-shop Bearer token (canonical, Haszno → Integráció → API-kulcsok)
 *   HASZNO_API_KEY     → legacy alias for HASZNO_API_TOKEN (silent migration)
 *   HASZNO_BASIC       → HTTP Basic auth (session-based endpoints only)
 *
 * Usage examples:
 *   haszno products list --json
 *   haszno proposals list
 *   haszno proposals create --product-id 42 --price 8900 --reason "Verseny csökkentett"
 *   haszno orders list
 *   haszno rules list
 */
import { Command } from 'commander'
import { createClient } from './client/index.js'

import { registerCatalogCommands } from './commands/catalog.js'
import { registerProductsCommands } from './commands/products.js'
import { registerProposalsCommands } from './commands/proposals.js'
import { registerRulesCommands } from './commands/rules.js'
import { registerOrdersCommands } from './commands/orders.js'
import { registerIdeasCommands } from './commands/ideas.js'
import { registerFeedsCommands } from './commands/feeds.js'
import { registerAccountCommands } from './commands/account.js'
import { registerCatalogueCommands } from './commands/catalogue.js'
import { registerPeersCommands } from './commands/peers.js'
import { registerBlogCommands } from './commands/blog.js'

const program = new Command()
  .name('haszno')
  .description('Haszno dropshipping CLI')
  .version('0.1.0')
  .option('--json', 'output machine-readable JSON')
  .option('--api-url <url>', 'Haszno API base URL (overrides HASZNO_API_URL)')
  .option('--api-key <key>', 'Haszno API key (overrides HASZNO_API_KEY)')

function buildClient(opts: { apiUrl?: string; apiKey?: string }) {
  return createClient({
    baseUrl: opts.apiUrl,
    apiKey: opts.apiKey,
  })
}

// Global flags must be known before commands are registered (they receive the client),
// so read them straight from argv instead of program.opts() (empty until parse()).
function argvFlag(name: string): string | undefined {
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1]
    if (argv[i].startsWith(name + '=')) return argv[i].slice(name.length + 1)
  }
  return undefined
}

const client = buildClient({ apiUrl: argvFlag('--api-url'), apiKey: argvFlag('--api-key') })

registerCatalogCommands(program, client)
registerProductsCommands(program, client)
registerProposalsCommands(program, client)
registerRulesCommands(program, client)
registerOrdersCommands(program, client)
registerIdeasCommands(program, client)
registerFeedsCommands(program, client)
registerAccountCommands(program, client)
registerCatalogueCommands(program, client)
registerPeersCommands(program, client)
registerBlogCommands(program, client)

program.parse()
