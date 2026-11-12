/**
 * @haszno/cli — Haszno command-line interface.
 *
 * Global flags:
 *   --json          print machine-readable JSON instead of human tables
 *   --api-url <url> override HASZNO_API_URL
 *   --api-key <key> override HASZNO_API_KEY
 *
 * Usage examples:
 *   haszno login
 *   haszno account stats
 *   haszno products list --json
 *   haszno proposals list
 *   haszno proposals approve --ids 1,2,3
 *   haszno rules list
 *   haszno rules run 2
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
import { registerReportCommands } from './commands/report.js'
import { registerResearchCommands } from './commands/research.js'
import { registerActionsCommands } from './commands/actions.js'

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
registerReportCommands(program, client)
registerResearchCommands(program, client)
registerActionsCommands(program, client)

program.parse()
