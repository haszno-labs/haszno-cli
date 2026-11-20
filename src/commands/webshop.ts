/**
 * CLI commands — the hosted webshop's page editor, from a terminal or a script.
 *
 * Domain: webshop
 * Subcommands:
 *   haszno webshop list                         the account's webshops
 *   haszno webshop pages                        the pages of the draft (+ draftVersion)
 *   haszno webshop inspect [page]               the whole draft, or one page with its widgets
 *   haszno webshop widgets [--category <c>]     the widget catalogue
 *   haszno webshop widget <type>                one widget's settings
 *   haszno webshop batch --ops <json|@file|->   apply page ops in one save (the main write command)
 *   haszno webshop brand [--primary …]          brand colours, fonts, logo, design
 *   haszno webshop validate                     check the draft
 *   haszno webshop preview [--page <p>]         a preview link of the draft
 *   haszno webshop undo                         step the draft back one version
 *   haszno webshop publish --yes                make the draft live
 *   haszno webshop guide [section]              the site builder guide
 *   haszno webshop tool <name> [--args <json>]  any haszno_webshop_* tool, raw
 *
 * Every command calls the matching tool of the hosted Haszno MCP server, so the CLI and an MCP client share one
 * behaviour (validation, `baseVersion` conflict rule, version history).
 */
import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import type { HttpOptions } from '../client/http.js'
import { callMcpTool } from '../client/mcp.js'

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<string>

function isJsonMode(cmd: Command): boolean {
  let p: Command | null = cmd
  while (p) {
    if (p.opts<{ json?: boolean }>().json) return true
    p = p.parent
  }
  return false
}

/** A JSON value given inline, as `@path/to/file.json`, or as `-` (standard input). */
export function readJsonArg(value: string, label: string): unknown {
  const raw = value === '-' ? readFileSync(0, 'utf8') : value.startsWith('@') ? readFileSync(value.slice(1), 'utf8') : value
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`A(z) ${label} nem érvényes JSON.`)
  }
}

function wholeNumber(value: string, label: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new Error(`A(z) ${label} nemnegatív egész szám legyen.`)
  return n
}

/** Drops the options the user did not give, so the tool sees only real arguments. */
const given = (args: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined))

/** Prints a tool's answer: JSON answers pretty-printed (compact with --json, for scripts), text as it is. */
function print(text: string, json: boolean): void {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    process.stdout.write(json ? JSON.stringify({ text }) + '\n' : text + '\n')
    return
  }
  process.stdout.write(JSON.stringify(parsed, null, json ? 0 : 2) + '\n')
}

export function registerWebshopCommands(program: Command, opts: HttpOptions, call?: ToolCaller): void {
  const callTool: ToolCaller = call ?? ((name, args) => callMcpTool(name, args, opts))

  /** Runs one tool call for a command; an error goes to stderr with exit code 1, like every other command. */
  const run = async (cmd: Command, name: string, build: () => Record<string, unknown>): Promise<void> => {
    try {
      print(await callTool(name, given(build())), isJsonMode(cmd))
    } catch (err) {
      console.error(`Hiba: ${err instanceof Error ? err.message : String(err)}`)
      process.exitCode = 1
    }
  }

  const webshop = program
    .command('webshop')
    .description('A hosztolt webshop oldalszerkesztője: oldalak, widgetek, márka, közzététel')
  const slugOpt = ['--slug <slug>', 'melyik webshop (ha a fiókban több van)'] as const
  const baseOpt = ['--base-version <n>', 'a legutóbb beolvasott draftVersion — ütközés ellen, mindig add meg'] as const

  webshop.command('list').description('A fiók webshopjai')
    .action((_o, cmd: Command) => run(cmd, 'haszno_webshop_list', () => ({})))

  webshop.command('pages').description('A vázlat oldalai és a draftVersion').option(...slugOpt)
    .action((o: { slug?: string }, cmd: Command) => run(cmd, 'haszno_webshop_list_pages', () => ({ slug: o.slug })))

  webshop.command('inspect [page]').description('A teljes vázlat, vagy egy oldal a widgetjeivel (home vagy az oldal slugja)')
    .option(...slugOpt).option('--verbose', 'minden beállítás, rövidítés nélkül')
    .action((page: string | undefined, o: { slug?: string; verbose?: boolean }, cmd: Command) =>
      page === undefined
        ? run(cmd, 'haszno_webshop_inspect', () => ({ slug: o.slug, verbose: o.verbose }))
        : run(cmd, 'haszno_webshop_inspect_page', () => ({ slug: o.slug, page })))

  webshop.command('widgets').description('A használható widgetek').option('--category <category>', 'csak egy kategória')
    .action((o: { category?: string }, cmd: Command) => run(cmd, 'haszno_webshop_list_widgets', () => ({ category: o.category })))

  webshop.command('widget <type>').description('Egy widget beállításai és példája')
    .action((type: string, _o, cmd: Command) => run(cmd, 'haszno_webshop_describe_widget', () => ({ type })))

  webshop.command('batch').description('Oldalműveletek egy mentésben (create_page, add_widget, update_widget, …)')
    .requiredOption('--ops <json>', 'a műveletek tömbje: JSON, @fájl vagy - (szabványos bemenet)')
    .option(...baseOpt).option('--expect <json>', 'elvárt eredmény (pl. {"pages":{"home":{"widgets":5}}}) — JSON, @fájl')
    .option('--dry-run', 'csak ellenőrzés, mentés nélkül').option(...slugOpt)
    .action((o: { ops: string; baseVersion?: string; expect?: string; dryRun?: boolean; slug?: string }, cmd: Command) =>
      run(cmd, 'haszno_webshop_page_batch', () => {
        const ops = readJsonArg(o.ops, '--ops')
        if (!Array.isArray(ops)) throw new Error('A(z) --ops műveletek tömbje legyen.')
        return {
          slug: o.slug,
          ops,
          baseVersion: o.baseVersion === undefined ? undefined : wholeNumber(o.baseVersion, '--base-version'),
          expect: o.expect === undefined ? undefined : readJsonArg(o.expect, '--expect'),
          dryRun: o.dryRun,
        }
      }))

  webshop.command('brand').description('Márka: színek, betűtípusok, logó, dizájn')
    .option('--primary <color>', 'elsődleges szín (#rrggbb)').option('--secondary <color>', 'másodlagos szín (#rrggbb)')
    .option('--font <family>', 'szövegbetű').option('--display-font <family>', 'címbetű')
    .option('--logo <url>', 'logó URL').option('--design <name>', 'dizájn neve').option(...baseOpt).option(...slugOpt)
    .action((o: { primary?: string; secondary?: string; font?: string; displayFont?: string; logo?: string; design?: string; baseVersion?: string; slug?: string }, cmd: Command) =>
      run(cmd, 'haszno_webshop_set_brand', () => ({
        slug: o.slug,
        primaryColor: o.primary,
        secondaryColor: o.secondary,
        fontFamily: o.font,
        displayFontFamily: o.displayFont,
        logoUrl: o.logo,
        design: o.design,
        baseVersion: o.baseVersion === undefined ? undefined : wholeNumber(o.baseVersion, '--base-version'),
      })))

  webshop.command('validate').description('A vázlat ellenőrzése (hibák és figyelmeztetések)').option(...slugOpt)
    .action((o: { slug?: string }, cmd: Command) => run(cmd, 'haszno_webshop_validate', () => ({ slug: o.slug })))

  webshop.command('preview').description('Előnézeti link a vázlathoz').option('--page <page>', 'melyik oldal').option(...slugOpt)
    .action((o: { page?: string; slug?: string }, cmd: Command) => run(cmd, 'haszno_webshop_preview_url', () => ({ slug: o.slug, page: o.page })))

  webshop.command('undo').description('A vázlat visszaléptetése egy verzióval').option(...baseOpt).option(...slugOpt)
    .action((o: { baseVersion?: string; slug?: string }, cmd: Command) =>
      run(cmd, 'haszno_webshop_undo', () => ({
        slug: o.slug,
        baseVersion: o.baseVersion === undefined ? undefined : wholeNumber(o.baseVersion, '--base-version'),
      })))

  webshop.command('publish').description('A vázlat közzététele — a vásárlók ezt látják').option('--yes', 'megerősítés').option(...slugOpt)
    .action((o: { yes?: boolean; slug?: string }, cmd: Command) => {
      if (!o.yes) {
        console.error('A közzététel élesíti a vázlatot. Add meg a --yes kapcsolót a megerősítéshez.')
        process.exitCode = 1
        return
      }
      return run(cmd, 'haszno_webshop_publish', () => ({ slug: o.slug }))
    })

  webshop.command('guide [section]').description('Az oldalépítő útmutató (vagy egy fejezete)')
    .action((section: string | undefined, _o, cmd: Command) => run(cmd, 'haszno_site_builder_skill', () => ({ section })))

  webshop.command('tool <name>').description('Bármelyik haszno_webshop_* eszköz hívása nyers argumentumokkal')
    .option('--args <json>', 'az argumentumok objektuma: JSON, @fájl vagy -', '{}')
    .action((name: string, o: { args: string }, cmd: Command) => {
      if (!/^haszno_(webshop_[a-z_]+|site_builder_skill)$/.test(name)) {
        console.error('Csak haszno_webshop_* eszköz hívható így.')
        process.exitCode = 1
        return
      }
      return run(cmd, name, () => {
        const args = readJsonArg(o.args, '--args')
        if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('A(z) --args objektum legyen.')
        return args as Record<string, unknown>
      })
    })
}
