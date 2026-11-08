/**
 * CLI commands — catalog (network suppliers + their products).
 *
 * Domain: catalog
 * Subcommands:
 *   haszno catalog suppliers           list network suppliers
 *   haszno catalog products <id>       list a network supplier's catalogue
 *   haszno catalog view <supplierId>   supplier view (aggregated reseller stats)
 */
import type { Command } from 'commander'
import type { HasznoClient } from '../client/index.js'

export function registerCatalogCommands(_program: Command, _client: HasznoClient): void {
  // TODO: implement in a parallel agent pass
}
