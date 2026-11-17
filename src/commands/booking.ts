/**
 * CLI commands — Foglalási modul (Booking).
 *
 * Command group: haszno booking
 *
 *   haszno booking status                     Teljesítési ellenőrzőlista + következő lépés
 *   haszno booking export                     Teljes konfiguráció JSON-ban (apply bemenetként)
 *   haszno booking apply <fájl|->             Konfiguráció alkalmazása (alapért. dry-run)
 *   haszno booking theme set [opciók...]      Megjelenés testreszabása
 *   haszno booking service list               Szolgáltatások listája
 *   haszno booking service add [opciók...]    Új szolgáltatás
 *   haszno booking service update <id> [...]  Szolgáltatás módosítása
 *   haszno booking service remove <id>        Szolgáltatás törlése
 *   haszno booking resource list              Erőforrások listája
 *   haszno booking resource add [opciók...]   Új erőforrás
 *   haszno booking resource update <id> [...] Erőforrás módosítása
 *   haszno booking resource remove <id>       Erőforrás törlése
 *   haszno booking hours set <fájl|->         Nyitvatartás beállítása (JSON)
 *   haszno booking closure add [opciók...]    Zárás / kivétel hozzáadása
 *   haszno booking closure remove <id>        Zárás törlése
 *   haszno booking publish --yes              Foglalási oldal közzététele
 *   haszno booking unpublish --yes            Foglalási oldal visszavonása
 *   haszno booking appointments               Időpontok listája (--from --to kötelező)
 *
 * Mindegyik parancs bolt API-tokent (haszno_… prefix) igényel — legacy kulccsal
 * az összes booking művelet LegacyKeyNotSupportedError hibával meghiúsul.
 */

import { readFileSync } from 'node:fs'
import type { Command } from 'commander'
import type {
  HasznoClient,
  BookingTheme,
  BookingService,
  BookingResource,
  BookingDayHours,
  BookingAppointment,
} from '../client/index.js'
import { handleError, printJson } from './account.js'

// ── Output helpers ────────────────────────────────────────────────────────────

function getJsonFlag(cmd: Command): boolean {
  try {
    return (cmd.optsWithGlobals() as { json?: boolean }).json === true
  } catch {
    return false
  }
}

async function readStdinOrFile(source: string): Promise<string> {
  if (source === '-') {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8').trim()
  }
  return readFileSync(source, 'utf8').trim()
}

function parseJson<T>(text: string, label: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    process.stderr.write(`Érvénytelen JSON (${label}).\n`)
    process.exit(2)
  }
}

function fmtService(s: BookingService): string {
  const price = s.priceGross != null ? `${s.priceGross.toLocaleString('hu-HU')} Ft` : 'ár nincs'
  const active = s.active ? '' : ' [inaktív]'
  return `  #${String(s.id).padStart(4)}  ${s.name.padEnd(30)} ${String(s.durationMin).padStart(3)} perc  ${price}${active}`
}

function fmtResource(r: BookingResource): string {
  const active = r.active ? '' : ' [inaktív]'
  return `  #${String(r.id).padStart(4)}  ${r.name}${active}${r.description ? `  — ${r.description}` : ''}`
}

function fmtAppointment(a: BookingAppointment): string {
  return (
    `  ${a.date} ${a.startTime}–${a.endTime}  ${a.serviceName.padEnd(28)}  ` +
    `${a.customerName}  ${a.status}`
  )
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerBookingCommands(program: Command, client: HasznoClient): void {
  const booking = program
    .command('booking')
    .description('Foglalási modul konfigurálása és lekérdezése (bolt API-token szükséges)')

  // ── haszno booking status ─────────────────────────────────────────────────

  booking
    .command('status')
    .description('Ellenőrzőlista és következő teendő')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const setup = await client.booking.getSetup()
        if (getJsonFlag(cmd)) {
          printJson({ checklist: setup.checklist, nextStep: setup.nextStep })
          return
        }
        const published = setup.page.published ? 'közzétéve' : 'vázlat'
        process.stdout.write(`Foglalási oldal állapota: ${published}\n\n`)
        for (const item of setup.checklist) {
          const mark = item.done ? '[x]' : '[ ]'
          process.stdout.write(`  ${mark}  ${item.label}\n`)
        }
        if (setup.nextStep) {
          process.stdout.write(`\nKövetkező lépés:\n  ${setup.nextStep}\n`)
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking export ─────────────────────────────────────────────────

  booking
    .command('export')
    .description('Teljes konfiguráció JSON-ban (haszno booking apply bemenetként használható)')
    .action(async (_opts: Record<string, unknown>, _cmd: Command) => {
      try {
        const setup = await client.booking.getSetup()
        // Export only the mutable parts (page, services, resources, hours, exceptions)
        const exportPayload = {
          theme: setup.page.theme,
          services: setup.services,
          resources: setup.resources,
          hours: setup.hours,
          exceptions: setup.exceptions,
        }
        printJson(exportPayload)
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking apply <fájl|-> ─────────────────────────────────────────

  booking
    .command('apply <forrás>')
    .description('Konfiguráció alkalmazása JSON fájlból vagy stdin-ről (alapért. dry-run)')
    .option('--dry-run', 'Csak a változásokat listázza, nem ment (alapértelmezett --yes nélkül)')
    .option('--yes', 'Tényleges alkalmazás (dry-run kihagyása)')
    .action(async (source: string, opts: { dryRun?: boolean; yes?: boolean }, cmd: Command) => {
      try {
        const rawText = await readStdinOrFile(source)
        const body = parseJson<Record<string, unknown>>(rawText, source)

        // --dry-run overrides --yes; without --yes it's always a dry run
        const dryRun = !!opts.dryRun || !opts.yes

        const result = await client.booking.applySetup(body, dryRun)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        if (dryRun) {
          process.stdout.write('Dry-run — változások (nem lett mentve):\n')
        } else {
          process.stdout.write('Alkalmazva. Változások:\n')
        }
        if (result.changes.length === 0) {
          process.stdout.write('  (nincs változás)\n')
        } else {
          for (const ch of result.changes) {
            process.stdout.write(`  • ${ch}\n`)
          }
        }
        if (dryRun) {
          process.stdout.write('\nAz alkalmazáshoz add meg a --yes kapcsolót.\n')
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking theme set ──────────────────────────────────────────────

  const theme = booking
    .command('theme')
    .description('Megjelenés (téma) beállításai')

  theme
    .command('set')
    .description('Téma részleges frissítése (csak a megadott mezők változnak)')
    .option('--accent <#hex>', 'Kiemelési szín (pl. #12b5a0)')
    .option('--background <értéke>', 'Háttér: light | soft | dark')
    .option('--radius <értéke>', 'Saroksugár: sharp | soft | round')
    .option('--font <értéke>', 'Betűtípus: inter | serif | rounded')
    .option('--logo <url>', 'Logó URL (https://…)')
    .option('--cover <url>', 'Borítókép URL (https://…)')
    .option('--headline <szöveg>', 'Főcím (max. 80 karakter)')
    .option('--button <szöveg>', 'Gombfelirat (max. 40 karakter)')
    .action(
      async (
        opts: {
          accent?: string
          background?: string
          radius?: string
          font?: string
          logo?: string
          cover?: string
          headline?: string
          button?: string
        },
        cmd: Command,
      ) => {
        const partial: BookingTheme = {}
        if (opts.accent !== undefined) partial.accent = opts.accent
        if (opts.background !== undefined)
          partial.background = opts.background as BookingTheme['background']
        if (opts.radius !== undefined) partial.radius = opts.radius as BookingTheme['radius']
        if (opts.font !== undefined) partial.font = opts.font as BookingTheme['font']
        if (opts.logo !== undefined) partial.logoUrl = opts.logo
        if (opts.cover !== undefined) partial.coverUrl = opts.cover
        if (opts.headline !== undefined) partial.headline = opts.headline
        if (opts.button !== undefined) partial.buttonLabel = opts.button

        if (Object.keys(partial).length === 0) {
          process.stderr.write('Legalább egy opciót adj meg (pl. --accent, --background).\n')
          process.exitCode = 2
          return
        }

        try {
          const result = await client.booking.setTheme(partial)
          if (getJsonFlag(cmd)) {
            printJson(result)
            return
          }
          process.stdout.write('Téma frissítve.\n')
          if (result.accent) process.stdout.write(`  Kiemelési szín:  ${result.accent}\n`)
          if (result.background) process.stdout.write(`  Háttér:          ${result.background}\n`)
          if (result.radius) process.stdout.write(`  Saroksugár:      ${result.radius}\n`)
          if (result.font) process.stdout.write(`  Betűtípus:       ${result.font}\n`)
          if (result.logoUrl) process.stdout.write(`  Logó URL:        ${result.logoUrl}\n`)
          if (result.coverUrl) process.stdout.write(`  Borítókép URL:   ${result.coverUrl}\n`)
          if (result.headline) process.stdout.write(`  Főcím:           ${result.headline}\n`)
          if (result.buttonLabel) process.stdout.write(`  Gombfelirat:     ${result.buttonLabel}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── haszno booking service ────────────────────────────────────────────────

  const service = booking
    .command('service')
    .description('Foglalható szolgáltatások kezelése')

  service
    .command('list')
    .description('Szolgáltatások listája')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const services = await client.booking.listServices()
        if (getJsonFlag(cmd)) {
          printJson(services)
          return
        }
        if (services.length === 0) {
          process.stdout.write('Nincs szolgáltatás.\n')
          return
        }
        for (const s of services) process.stdout.write(fmtService(s) + '\n')
      } catch (err) {
        handleError(err)
      }
    })

  service
    .command('add')
    .description('Új szolgáltatás hozzáadása')
    .requiredOption('--name <név>', 'Szolgáltatás neve')
    .requiredOption('--duration <perc>', 'Időtartam percben')
    .option('--price <Ft>', 'Ár (bruttó Ft, üresen = ár nélkül)')
    .option('--description <szöveg>', 'Leírás')
    .action(
      async (
        opts: { name: string; duration: string; price?: string; description?: string },
        cmd: Command,
      ) => {
        const durationMin = parseInt(opts.duration, 10)
        if (isNaN(durationMin) || durationMin <= 0) {
          process.stderr.write('--duration értéke pozitív egész szám kell legyen.\n')
          process.exitCode = 2
          return
        }
        try {
          const body: Omit<BookingService, 'id' | 'active'> = {
            name: opts.name,
            durationMin,
            priceGross: opts.price != null ? parseInt(opts.price, 10) : null,
            description: opts.description ?? null,
          }
          const result = await client.booking.createService(body)
          if (getJsonFlag(cmd)) {
            printJson(result)
            return
          }
          process.stdout.write(`Szolgáltatás hozzáadva:\n${fmtService(result)}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )

  service
    .command('update <id>')
    .description('Meglévő szolgáltatás módosítása')
    .option('--name <név>', 'Új neve')
    .option('--duration <perc>', 'Új időtartam percben')
    .option('--price <Ft>', 'Új ár (bruttó Ft)')
    .option('--description <szöveg>', 'Leírás')
    .option('--active', 'Aktiválás')
    .option('--no-active', 'Deaktiválás')
    .action(
      async (
        idStr: string,
        opts: {
          name?: string
          duration?: string
          price?: string
          description?: string
          active?: boolean
        },
        cmd: Command,
      ) => {
        const id = parseInt(idStr, 10)
        if (isNaN(id)) {
          process.stderr.write('Érvénytelen azonosító.\n')
          process.exitCode = 2
          return
        }
        const body: Partial<Omit<BookingService, 'id'>> = {}
        if (opts.name !== undefined) body.name = opts.name
        if (opts.duration !== undefined) {
          const dur = parseInt(opts.duration, 10)
          if (isNaN(dur) || dur <= 0) {
            process.stderr.write('--duration értéke pozitív egész szám kell legyen.\n')
            process.exitCode = 2
            return
          }
          body.durationMin = dur
        }
        if (opts.price !== undefined) body.priceGross = parseInt(opts.price, 10)
        if (opts.description !== undefined) body.description = opts.description
        if (opts.active !== undefined) body.active = opts.active

        if (Object.keys(body).length === 0) {
          process.stderr.write('Legalább egy módosítandó mezőt adj meg.\n')
          process.exitCode = 2
          return
        }
        try {
          const result = await client.booking.updateService(id, body)
          if (getJsonFlag(cmd)) {
            printJson(result)
            return
          }
          process.stdout.write(`Szolgáltatás #${id} frissítve:\n${fmtService(result)}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )

  service
    .command('remove <id>')
    .description('Szolgáltatás törlése (soft-delete)')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) {
        process.stderr.write('Érvénytelen azonosító.\n')
        process.exitCode = 2
        return
      }
      try {
        const result = await client.booking.deleteService(id)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        process.stdout.write(`Szolgáltatás #${id} törölve.\n`)
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking resource ───────────────────────────────────────────────

  const resource = booking
    .command('resource')
    .description('Erőforrások kezelése (személyek, termek, eszközök)')

  resource
    .command('list')
    .description('Erőforrások listája')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const resources = await client.booking.listResources()
        if (getJsonFlag(cmd)) {
          printJson(resources)
          return
        }
        if (resources.length === 0) {
          process.stdout.write('Nincs erőforrás.\n')
          return
        }
        for (const r of resources) process.stdout.write(fmtResource(r) + '\n')
      } catch (err) {
        handleError(err)
      }
    })

  resource
    .command('add')
    .description('Új erőforrás hozzáadása')
    .requiredOption('--name <név>', 'Erőforrás neve')
    .option('--description <szöveg>', 'Leírás')
    .action(
      async (opts: { name: string; description?: string }, cmd: Command) => {
        try {
          const body: Omit<BookingResource, 'id' | 'active'> = {
            name: opts.name,
            description: opts.description ?? null,
          }
          const result = await client.booking.createResource(body)
          if (getJsonFlag(cmd)) {
            printJson(result)
            return
          }
          process.stdout.write(`Erőforrás hozzáadva:\n${fmtResource(result)}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )

  resource
    .command('update <id>')
    .description('Meglévő erőforrás módosítása')
    .option('--name <név>', 'Új neve')
    .option('--description <szöveg>', 'Leírás')
    .option('--active', 'Aktiválás')
    .option('--no-active', 'Deaktiválás')
    .action(
      async (
        idStr: string,
        opts: { name?: string; description?: string; active?: boolean },
        cmd: Command,
      ) => {
        const id = parseInt(idStr, 10)
        if (isNaN(id)) {
          process.stderr.write('Érvénytelen azonosító.\n')
          process.exitCode = 2
          return
        }
        const body: Partial<Omit<BookingResource, 'id'>> = {}
        if (opts.name !== undefined) body.name = opts.name
        if (opts.description !== undefined) body.description = opts.description
        if (opts.active !== undefined) body.active = opts.active

        if (Object.keys(body).length === 0) {
          process.stderr.write('Legalább egy módosítandó mezőt adj meg.\n')
          process.exitCode = 2
          return
        }
        try {
          const result = await client.booking.updateResource(id, body)
          if (getJsonFlag(cmd)) {
            printJson(result)
            return
          }
          process.stdout.write(`Erőforrás #${id} frissítve:\n${fmtResource(result)}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )

  resource
    .command('remove <id>')
    .description('Erőforrás törlése (soft-delete)')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) {
        process.stderr.write('Érvénytelen azonosító.\n')
        process.exitCode = 2
        return
      }
      try {
        const result = await client.booking.deleteResource(id)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        process.stdout.write(`Erőforrás #${id} törölve.\n`)
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking hours set ──────────────────────────────────────────────

  const hours = booking
    .command('hours')
    .description('Nyitvatartás beállítása')

  hours
    .command('set <forrás>')
    .description(
      'Nyitvatartás teljes felülírása JSON fájlból vagy stdin-ről\n' +
        '  Formátum: { "hours": [{ "day": "mon", "open": "09:00", "close": "17:00" }, …] }\n' +
        '  Zárva tartás jelzése: "open": null, "close": null',
    )
    .action(async (source: string, _opts: Record<string, unknown>, cmd: Command) => {
      try {
        const rawText = await readStdinOrFile(source)
        const parsed = parseJson<{ hours?: BookingDayHours[] } | BookingDayHours[]>(
          rawText,
          source,
        )
        const hoursArray: BookingDayHours[] = Array.isArray(parsed)
          ? parsed
          : (parsed.hours ?? (parsed as unknown as BookingDayHours[]))

        if (!Array.isArray(hoursArray) || hoursArray.length === 0) {
          process.stderr.write(
            'Érvénytelen formátum. Elvárt: { "hours": [...] } vagy [{ "day": ..., "open": ..., "close": ... }]\n',
          )
          process.exitCode = 2
          return
        }
        const result = await client.booking.setHours(hoursArray)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        process.stdout.write('Nyitvatartás beállítva:\n')
        for (const h of Array.isArray(result) ? result : hoursArray) {
          const time = h.open && h.close ? `${h.open} – ${h.close}` : 'zárva'
          process.stdout.write(`  ${h.day.padEnd(4)}  ${time}\n`)
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking closure ────────────────────────────────────────────────

  const closure = booking
    .command('closure')
    .description('Zárások és kivételek kezelése')

  closure
    .command('add')
    .description('Zárás / kivétel nap hozzáadása')
    .requiredOption('--date <ÉÉÉÉ-HH-NN>', 'Dátum (ISO-8601)')
    .option('--label <szöveg>', 'Felirat (pl. „Állami ünnep")')
    .option('--open <ÓÓ:PP>', 'Különleges nyitvatartás kezdete (üresen = zárva)')
    .option('--close <ÓÓ:PP>', 'Különleges nyitvatartás vége')
    .action(
      async (
        opts: { date: string; label?: string; open?: string; close?: string },
        cmd: Command,
      ) => {
        try {
          const result = await client.booking.addClosure({
            date: opts.date,
            label: opts.label ?? null,
            open: opts.open ?? null,
            close: opts.close ?? null,
          })
          if (getJsonFlag(cmd)) {
            printJson(result)
            return
          }
          const time = result.open && result.close ? `${result.open} – ${result.close}` : 'zárva'
          process.stdout.write(
            `Zárás/kivétel hozzáadva: #${result.id}  ${result.date}  ${time}${result.label ? `  (${result.label})` : ''}\n`,
          )
        } catch (err) {
          handleError(err)
        }
      },
    )

  closure
    .command('remove <id>')
    .description('Zárás / kivétel törlése')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) {
        process.stderr.write('Érvénytelen azonosító.\n')
        process.exitCode = 2
        return
      }
      try {
        const result = await client.booking.removeClosure(id)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        process.stdout.write(`Zárás/kivétel #${id} törölve.\n`)
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking publish / unpublish ────────────────────────────────────

  booking
    .command('publish')
    .description('Foglalási oldal közzététele (--yes kötelező)')
    .option('--yes', 'Megerősítés')
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        process.stderr.write(
          'A közzétételhez add meg a --yes kapcsolót: haszno booking publish --yes\n',
        )
        process.exitCode = 1
        return
      }
      try {
        const result = await client.booking.publish(true)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        process.stdout.write(
          result.published
            ? 'Foglalási oldal közzétéve.\n'
            : 'A közzététel sikertelen (ellenőrizd az ellenőrzőlistát: haszno booking status).\n',
        )
      } catch (err) {
        handleError(err)
      }
    })

  booking
    .command('unpublish')
    .description('Foglalási oldal visszavonása (--yes kötelező)')
    .option('--yes', 'Megerősítés')
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      if (!opts.yes) {
        process.stderr.write(
          'A visszavonáshoz add meg a --yes kapcsolót: haszno booking unpublish --yes\n',
        )
        process.exitCode = 1
        return
      }
      try {
        const result = await client.booking.publish(false)
        if (getJsonFlag(cmd)) {
          printJson(result)
          return
        }
        process.stdout.write(result.published ? 'Még mindig közzétéve.\n' : 'Foglalási oldal visszavonva.\n')
      } catch (err) {
        handleError(err)
      }
    })

  // ── haszno booking appointments ───────────────────────────────────────────

  booking
    .command('appointments')
    .description('Időpontok listája (--from és --to kötelező)')
    .requiredOption('--from <ÉÉÉÉ-HH-NN>', 'Kezdő dátum (ISO-8601)')
    .requiredOption('--to <ÉÉÉÉ-HH-NN>', 'Záró dátum (ISO-8601)')
    .action(async (opts: { from: string; to: string }, cmd: Command) => {
      try {
        const appointments = await client.booking.listAppointments({ from: opts.from, to: opts.to })
        if (getJsonFlag(cmd)) {
          printJson(appointments)
          return
        }
        if (appointments.length === 0) {
          process.stdout.write('Nincs időpont a megadott időszakban.\n')
          return
        }
        process.stdout.write(
          `Időpontok (${opts.from} – ${opts.to}): ${appointments.length} db\n\n`,
        )
        for (const a of appointments) {
          process.stdout.write(fmtAppointment(a) + '\n')
          if (a.customerPhone) process.stdout.write(`         Tel: ${a.customerPhone}\n`)
          if (a.notes) process.stdout.write(`         Megjegyzés: ${a.notes}\n`)
        }
      } catch (err) {
        handleError(err)
      }
    })
}
