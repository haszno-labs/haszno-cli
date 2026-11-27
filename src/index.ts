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
import { Command, CommanderError } from 'commander'
import { createClient } from './client/index.js'
import { resolveConnection } from './client/config.js'
import { CliExit, commandDiagnosticOutcome, configureCliErrors, configureCommandErrors, deferCliExit, writeCliError } from './client/cli-error.js'
import { invocationResult, reportCliInvocation } from './client/invocation-diagnostics.js'
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
const connection = resolveConnection(sharedOpts)
const { apiKey, basicAuth } = connection
configureCliErrors(() => program.opts().json === true, [
  apiKey, basicAuth, basicAuth && Buffer.from(basicAuth).toString('base64'), process.env['HASZNO_PASSWORD'],
])
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

configureCommandErrors(program, () => Boolean(program.opts().json || process.argv.slice(2).includes('--json')))

function commandPath(action: Command): string[] {
  const parts: string[] = []
  let cmd: Command | null = action
  while (cmd !== null && cmd !== program) {
    parts.unshift(cmd.name())
    cmd = cmd.parent ?? null
  }
  return parts
}

const diagnostics = process.env['HASZNO_DIAGNOSTICS'] === '1'
let target: string | undefined
let parserTarget: string | undefined
if (diagnostics) {
  deferCliExit()
  const captureParserExit = (command: Command) => {
    command.exitOverride((error) => {
      if (error.code === 'commander.unknownCommand') parserTarget = 'command-not-found'
      else if (error.exitCode !== 0) parserTarget = commandPath(command).join('.') || 'invalid-command'
      throw error
    })
    command.commands.forEach(captureParserExit)
  }
  captureParserExit(program)
}

program.hook('preAction', (_owner, action) => {
  const path = commandPath(action)
  target = path.join('.')
  // Use registered command names, never argv or option values.
  setCurrentCommandPath(`cli ${path.join(' ')}`.trimEnd())
})

async function run() {
  let result: ReturnType<typeof invocationResult>
  let forcedExit: number | undefined
  try {
    await program.parseAsync()
    result = commandDiagnosticOutcome(Number(process.exitCode ?? 0))
  } catch (err) {
    if (err instanceof CliExit) {
      forcedExit = err.exitCode
      result = commandDiagnosticOutcome(err.exitCode)
    } else if (diagnostics && err instanceof CommanderError) {
      forcedExit = err.exitCode
      result = err.code === 'commander.unknownCommand' ? { outcome: 'blocked', reason: 'not_available' } : invocationResult(2)
    } else {
      writeCliError(err)
      process.exitCode = 1
      result = invocationResult(1, err)
    }
  }
  const name = target ?? parserTarget
  if (name) await reportCliInvocation(diagnostics, connection, name, result)
  // The original action or parser requested a hard exit. Defer it just long
  // enough to report, rather than letting unrelated handles hold the CLI open.
  if (forcedExit !== undefined) process.exit(forcedExit)
}

void run()
