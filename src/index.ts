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
 *   haszno vaszon                 (local bridge: the Vászon chat drives your own Claude Code)
 */
import { Command } from 'commander'
import { createClient } from './client/index.js'
import { resolveConnection } from './client/config.js'
import { configureCliErrors, writeCliError } from './client/cli-error.js'
import { setCurrentCommandPath } from './client/tool-context.js'

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
import { registerShopCommands } from './commands/shop.js'
import { registerModulesCommands } from './commands/modules.js'
import { registerBookingCommands } from './commands/booking.js'
import { registerVaszonCommands } from './commands/vaszon.js'
import { registerWebshopCommands } from './commands/webshop.js'
import { registerApiCommands } from './commands/api.js'
import { createShopClient } from './client/shop.js'

const program = new Command()
  .name('haszno')
  .description('Haszno dropshipping CLI')
  .version('0.8.0')
  .option('--json', 'output machine-readable JSON')
  .option('--api-url <url>', 'Haszno API base URL (overrides HASZNO_API_URL)')
  .option('--api-key <key>', 'Haszno API key (overrides HASZNO_API_KEY)')

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

const sharedOpts = { baseUrl: argvFlag('--api-url'), apiKey: argvFlag('--api-key') }
const { apiKey, basicAuth } = resolveConnection(sharedOpts)
configureCliErrors(() => program.opts().json === true, [
  apiKey, basicAuth, basicAuth && Buffer.from(basicAuth).toString('base64'), process.env['HASZNO_PASSWORD'],
])
program.configureOutput({
  outputError: (message, write) => {
    if (program.opts().json || process.argv.slice(2).includes('--json')) {
      writeCliError(message.replace(/^error:\s*/i, ''), { json: true, code: 'invalid_input' })
    } else {
      write(message)
    }
  },
})
const client = createClient(sharedOpts)
const shopClient = createShopClient(sharedOpts)

registerCatalogCommands(program, client)
registerProductsCommands(program, client)
registerProposalsCommands(program, client)
registerRulesCommands(program, client)
registerOrdersCommands(program, client)
registerIdeasCommands(program, client)
registerFeedsCommands(program, client)
registerAccountCommands(program, client, { httpOpts: sharedOpts })
registerCatalogueCommands(program, client)
registerPeersCommands(program, client)
registerBlogCommands(program, client)
registerReportCommands(program, client)
registerResearchCommands(program, client)
registerActionsCommands(program, client)
registerShopCommands(program, shopClient)
registerModulesCommands(program, client)
registerBookingCommands(program, client)
registerVaszonCommands(program, sharedOpts, '0.8.0')
registerWebshopCommands(program, sharedOpts)
registerApiCommands(program, sharedOpts)

// Record the invoked command path as "cli <subcommand path>" before each action.
// This value is picked up by http.ts to populate the X-Haszno-Tool request header.
program.hook('preAction', (thisCommand) => {
  const parts: string[] = []
  let cmd: Command | null = thisCommand
  while (cmd !== null && cmd !== program) {
    parts.unshift(cmd.name())
    cmd = cmd.parent ?? null
  }
  setCurrentCommandPath(`cli ${parts.join(' ')}`.trimEnd())
})

program.parseAsync().catch(err => {
  writeCliError(err)
  process.exitCode = 1
})
