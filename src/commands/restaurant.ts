import type { Command } from 'commander'
import { writeCliError } from '../client/cli-error.js'
import type { HttpOptions } from '../client/http.js'
import { callMcpTool } from '../client/mcp.js'

export function registerRestaurantCommands(program: Command, options: HttpOptions): void {
  program.command('restaurant').description('Saját étterem a Haszno rendszerében')
    .command('site').description('A saját étterem rendelési és admincíme, közzétételi állapota és étlapja')
    .action(async (_options, cmd: Command) => {
      const json = cmd.optsWithGlobals<{ json?: boolean }>().json === true
      try {
        const answer: unknown = JSON.parse(await callMcpTool('haszno_restaurant_get_site', {}, options))
        process.stdout.write(JSON.stringify(answer, null, json ? 0 : 2) + '\n')
      } catch (error) {
        writeCliError(error instanceof SyntaxError ? new Error('A Haszno MCP nem érvényes JSON-adatot adott vissza.') : error, { json })
        process.exitCode = 1
      }
    })
}
