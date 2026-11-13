/**
 * CLI commands — Haszno Shop marketplace.
 *
 * Command group: haszno shop
 *
 *   haszno shop categories              Hirdetési kategóriák és kötelező attribútumok
 *   haszno shop search [query]          Hirdetések keresése
 *   haszno shop show <id>               Hirdetés részletei
 *   haszno shop price-hint              Árjavaslat kategória alapján
 *   haszno shop post                    Új hirdetés feladása
 *   haszno shop my                      Saját hirdetések
 *   haszno shop edit <id>               Hirdetés szerkesztése
 *   haszno shop pause <id>              Hirdetés szüneteltetése
 *   haszno shop activate <id>           Hirdetés aktiválása
 *   haszno shop sold <id>               Hirdetés eladottnak jelölése
 *   haszno shop renew <id>              Hirdetés megújítása
 *   haszno shop delete <id>             Hirdetés törlése
 *   haszno shop inquiries               Beérkezett üzenetek listája
 *   haszno shop inquire <adId>          Üzenet küldése eladónak
 *   haszno shop favorite <adId>         Hirdetés mentése kedvencekbe
 *   haszno shop unfavorite <adId>       Hirdetés eltávolítása kedvencekből
 *   haszno shop favorites               Kedvenc hirdetések listája
 *   haszno shop reserve <adId>          Hirdetés lefoglalása
 *   haszno shop reservations            Foglalásaim listája
 *   haszno shop reservation accept <id>    Foglalás elfogadása (eladóként)
 *   haszno shop reservation decline <id>   Foglalás elutasítása (eladóként)
 *   haszno shop reservation cancel <id>    Foglalás lemondása (vevőként)
 *   haszno shop reservation complete <id>  Foglalás teljesítése (eladóként)
 *
 * Note: reserving is free — payment happens directly between buyer and seller.
 */

import { createInterface } from 'node:readline'
import type { Command } from 'commander'
import type { HttpOptions } from '../client/http.js'
import type {
  ShopHasznoClient,
  ShopAd,
  ShopReservation,
  ShopReservationSimple,
} from '../client/shop.js'
import { handleError, printJson } from './account.js'
import { HasznoApiError } from '../client/index.js'

// ── Output helpers ────────────────────────────────────────────────────────────

function getJsonFlag(cmd: Command): boolean {
  try {
    return (cmd.optsWithGlobals() as { json?: boolean }).json === true
  } catch {
    return false
  }
}

function fmt(n: number): string {
  return n.toLocaleString('hu-HU') + ' Ft'
}

function printAdTable(ads: ShopAd[]): void {
  if (ads.length === 0) {
    process.stdout.write('Nincs találat.\n')
    return
  }
  for (const ad of ads) {
    const status = ad.status === 'aktiv' ? 'aktív' : ad.status
    const reserved = ad.reserved ? ' [foglalt]' : ''
    process.stdout.write(
      `  #${String(ad.id).padStart(5)}  ${fmt(ad.priceGross).padStart(12)}  ${status.padEnd(10)}${reserved}  ${ad.title}\n`,
    )
  }
}

function printReservation(r: ShopReservation | ShopReservationSimple): void {
  const full = r as ShopReservation
  process.stdout.write(`  Foglalás #${r.id}\n`)
  if (full.ad) {
    process.stdout.write(`    Hirdetés:  #${full.adId} ${full.ad.title}\n`)
  } else {
    process.stdout.write(`    Hirdetés:  #${r.adId}\n`)
  }
  process.stdout.write(`    Állapot:   ${r.status}\n`)
  if (r.heldUntil) {
    process.stdout.write(`    Határidő:  ${r.heldUntil}\n`)
  }
  if (full.message) {
    process.stdout.write(`    Üzenet:    ${full.message}\n`)
  }
  if (full.offerPriceGross) {
    process.stdout.write(`    Ajánlott ár: ${fmt(full.offerPriceGross)}\n`)
  }
  if (full.buyerPhone) {
    process.stdout.write(`    Vevő tel.:  ${full.buyerPhone}\n`)
  }
  if (full.buyerEmail) {
    process.stdout.write(`    Vevő e-mail: ${full.buyerEmail}\n`)
  }
  if (full.sellerPhone) {
    process.stdout.write(`    Eladó tel.:  ${full.sellerPhone}\n`)
  }
  if (full.sellerEmail) {
    process.stdout.write(`    Eladó e-mail: ${full.sellerEmail}\n`)
  }
  process.stdout.write(`    Létrehozva: ${r.createdAt}\n`)
}

async function askConfirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise<boolean>((resolve) => {
    rl.question(`${message} [y/N] `, (ans) => {
      rl.close()
      resolve(ans.toLowerCase() === 'y' || ans.toLowerCase() === 'igen')
    })
  })
}

// ── Attribute parsing ─────────────────────────────────────────────────────────

function parseAttrs(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 1) {
      process.stderr.write(`Érvénytelen --attr érték: "${pair}" (formátum: kulcs=érték)\n`)
      process.exit(2)
    }
    result[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return result
}

function validateRequiredAttrs(
  attrs: Record<string, string>,
  required: Array<{ key: string; label: string }>,
): void {
  const missing = required.filter((a) => !attrs[a.key])
  if (missing.length > 0) {
    const names = missing.map((a) => `"${a.key}" (${a.label})`).join(', ')
    process.stderr.write(
      `Hiányzó kötelező attribútum${missing.length > 1 ? 'ok' : ''}: ${names}\n` +
        'Add meg: --attr kulcs=érték\n',
    )
    process.exit(2)
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

export function registerShopCommands(
  program: Command,
  shopClient: ShopHasznoClient,
  _opts?: HttpOptions,
): void {
  const shop = program.command('shop').description('Haszno Shop hirdetési piac')

  // ── categories ──────────────────────────────────────────────────────────────
  shop
    .command('categories')
    .description('Hirdetési kategóriák és kötelező attribútumok')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const cats = await shopClient.categories.list()
        if (getJsonFlag(cmd)) {
          printJson(cats)
        } else {
          for (const cat of cats) {
            process.stdout.write(`${cat.id}  ${cat.name}\n`)
            for (const sub of cat.subcategories ?? []) {
              const attrs = sub.requiredAttributes?.map((a) => a.key).join(', ') ?? ''
              process.stdout.write(
                `  └─ ${sub.id.padEnd(30)} ${sub.name}${attrs ? `  [köt.: ${attrs}]` : ''}\n`,
              )
            }
          }
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── search ───────────────────────────────────────────────────────────────────
  shop
    .command('search [query]')
    .description('Hirdetések keresése')
    .option('--category <id>', 'Kategória szűrő')
    .option('--subcategory <id>', 'Alkategória szűrő')
    .option('--min-price <Ft>', 'Minimum ár (bruttó Ft)')
    .option('--max-price <Ft>', 'Maximum ár (bruttó Ft)')
    .option('--county <megye>', 'Megye szűrő')
    .option('--city <város>', 'Város szűrő')
    .option('--sort <mód>', 'Rendezés: newest, price_asc, price_desc', 'newest')
    .option('--page <n>', 'Oldalszám', '1')
    .action(
      async (
        query: string | undefined,
        opts: {
          category?: string
          subcategory?: string
          minPrice?: string
          maxPrice?: string
          county?: string
          city?: string
          sort?: string
          page?: string
        },
        cmd: Command,
      ) => {
        try {
          const result = await shopClient.ads.search({
            q: query,
            category: opts.category,
            subcategory: opts.subcategory,
            minPrice: opts.minPrice ? parseInt(opts.minPrice, 10) : undefined,
            maxPrice: opts.maxPrice ? parseInt(opts.maxPrice, 10) : undefined,
            county: opts.county,
            city: opts.city,
            sort: opts.sort as 'newest' | 'price_asc' | 'price_desc' | undefined,
            page: opts.page ? parseInt(opts.page, 10) : undefined,
          })
          if (getJsonFlag(cmd)) {
            printJson(result)
          } else {
            const ads = Array.isArray(result) ? result : result.items ?? []
            printAdTable(ads)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── show ─────────────────────────────────────────────────────────────────────
  shop
    .command('show <id>')
    .description('Hirdetés részletei')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) {
        process.stderr.write('Érvénytelen hirdetés-azonosító.\n')
        process.exit(2)
        return
      }
      try {
        const ad = await shopClient.ads.get(id)
        if (getJsonFlag(cmd)) {
          printJson(ad)
        } else {
          process.stdout.write(`#${ad.id}  ${ad.title}\n`)
          process.stdout.write(`  Ár:        ${fmt(ad.priceGross)}${ad.negotiable ? ' (alku)' : ''}\n`)
          process.stdout.write(`  Állapot:   ${ad.status}${ad.reserved ? ' [foglalt]' : ''}\n`)
          if (ad.condition) process.stdout.write(`  Állapot:   ${ad.condition}\n`)
          if (ad.county || ad.city) {
            process.stdout.write(`  Helyszín:  ${[ad.county, ad.city].filter(Boolean).join(', ')}\n`)
          }
          if (ad.description) {
            process.stdout.write(`  Leírás:\n${ad.description.split('\n').map((l) => `    ${l}`).join('\n')}\n`)
          }
          if (Object.keys(ad.attributes ?? {}).length > 0) {
            process.stdout.write('  Attribútumok:\n')
            for (const [k, v] of Object.entries(ad.attributes)) {
              process.stdout.write(`    ${k}: ${v}\n`)
            }
          }
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── price-hint ───────────────────────────────────────────────────────────────
  shop
    .command('price-hint')
    .description('Árjavaslat kategória alapján')
    .option('--category <id>', 'Kategória')
    .option('--subcategory <id>', 'Alkategória')
    .action(async (opts: { category?: string; subcategory?: string }, cmd: Command) => {
      try {
        const hint = await shopClient.ads.priceHint({
          categoryId: opts.category,
          subcategoryId: opts.subcategory,
        })
        if (getJsonFlag(cmd)) {
          printJson(hint)
        } else {
          process.stdout.write('Árjavaslat:\n')
          if (hint.suggestedMin != null) {
            process.stdout.write(`  Min: ${fmt(hint.suggestedMin)}\n`)
          }
          if (hint.suggestedMid != null) {
            process.stdout.write(`  Közép: ${fmt(hint.suggestedMid)}\n`)
          }
          if (hint.suggestedMax != null) {
            process.stdout.write(`  Max: ${fmt(hint.suggestedMax)}\n`)
          }
          process.stdout.write(`  Mintaalap: ${hint.recentCount} hirdetés\n`)
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── post ─────────────────────────────────────────────────────────────────────
  shop
    .command('post')
    .description('Új hirdetés feladása')
    .option('--title <cím>', 'Hirdetés címe')
    .option('--category <id>', 'Kategória')
    .option('--subcategory <id>', 'Alkategória')
    .option('--price <Ft>', 'Vételár (bruttó Ft)')
    .option('--negotiable', 'Alkuképes')
    .option('--condition <állapot>', 'Termék állapota')
    .option('--description <leírás>', 'Hirdetés leírása')
    .option('--county <megye>', 'Megye')
    .option('--city <város>', 'Város')
    .option('--attr <kulcs=érték>', 'Attribútum (megismételhető)', (v: string, a: string[]) => [...a, v], [] as string[])
    .option('--image <fájl>', 'Képfájl feltöltése (megismételhető)', (v: string, a: string[]) => [...a, v], [] as string[])
    .option('--contact-name <név>', 'Kapcsolattartó neve')
    .option('--contact-phone <telefon>', 'Kapcsolattartó telefonszáma')
    .option('--show-phone', 'Telefonszám megjelenítése')
    .option('--from-photos', 'AI-javaslatot kér a feltöltött képek alapján')
    .option('--dry-run', 'Csak megjeleníti a kérést, nem küldi el')
    .option('--yes', 'Megerősítés kihagyása')
    .action(
      async (
        opts: {
          title?: string
          category?: string
          subcategory?: string
          price?: string
          negotiable?: boolean
          condition?: string
          description?: string
          county?: string
          city?: string
          attr: string[]
          image: string[]
          contactName?: string
          contactPhone?: string
          showPhone?: boolean
          fromPhotos?: boolean
          dryRun?: boolean
          yes?: boolean
        },
        cmd: Command,
      ) => {
        try {
          // Upload images first
          let imageIds: string[] = []
          if (opts.image.length > 0) {
            process.stderr.write(`${opts.image.length} kép feltöltése...\n`)
            for (const filePath of opts.image) {
              const result = await shopClient.myAds.uploadImage(filePath)
              imageIds.push(result.imageId)
            }
          }

          // AI suggest from photos if requested
          let aiSuggest: Record<string, unknown> = {}
          if (opts.fromPhotos && imageIds.length > 0) {
            process.stderr.write('AI-javaslat kérése a képekből...\n')
            aiSuggest = await shopClient.myAds.fromPhotos(imageIds) as Record<string, unknown>
            process.stdout.write('AI-javaslat:\n')
            printJson(aiSuggest)
          }

          const attrs = parseAttrs(opts.attr)

          // Validate required attributes if category+subcategory known
          // (client-side only if we have taxonomy data; skip if not)

          const body = {
            title: opts.title ?? (aiSuggest.title as string | undefined) ?? '',
            categoryId: opts.category ?? (aiSuggest.categoryId as string | undefined),
            subcategoryId: opts.subcategory ?? (aiSuggest.subcategoryId as string | undefined),
            priceGross:
              opts.price != null
                ? parseInt(opts.price, 10)
                : (aiSuggest.suggestedPriceGross as number | undefined) ?? 0,
            negotiable: opts.negotiable ?? false,
            condition: opts.condition ?? (aiSuggest.condition as string | undefined),
            description: opts.description ?? (aiSuggest.description as string | undefined),
            county: opts.county,
            city: opts.city,
            attributes: { ...(aiSuggest.attributes as Record<string, string> | undefined), ...attrs },
            imageIds,
            contactName: opts.contactName,
            contactPhone: opts.contactPhone,
            showPhone: opts.showPhone ?? false,
          }

          if (!body.title) {
            process.stderr.write('A --title megadása kötelező (vagy --from-photos az AI-javaslathoz).\n')
            process.exit(2)
            return
          }

          if (opts.dryRun) {
            process.stdout.write('Kérés (dry-run, NEM LETT ELKÜLDVE):\n')
            printJson(body)
            return
          }

          if (opts.fromPhotos && !opts.yes) {
            process.stdout.write('Hirdetés tervezett adatai:\n')
            printJson(body)
            const ok = await askConfirm('Feladjuk így?')
            if (!ok) {
              process.stdout.write('Megszakítva.\n')
              process.exit(0)
              return
            }
          }

          const ad = await shopClient.myAds.post(body)
          if (getJsonFlag(cmd)) {
            printJson(ad)
          } else {
            process.stdout.write(`Hirdetés feladva: #${ad.id}  ${ad.title}\n`)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── my ───────────────────────────────────────────────────────────────────────
  shop
    .command('my')
    .description('Saját hirdetések listája')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const ads = await shopClient.myAds.list()
        if (getJsonFlag(cmd)) {
          printJson(ads)
        } else {
          printAdTable(Array.isArray(ads) ? ads : [])
        }
      } catch (err) {
        handleError(err)
      }
    })

  // ── edit ─────────────────────────────────────────────────────────────────────
  shop
    .command('edit <id>')
    .description('Hirdetés szerkesztése')
    .option('--title <cím>', 'Új cím')
    .option('--price <Ft>', 'Új ár (bruttó Ft)')
    .option('--negotiable', 'Alkuképes')
    .option('--condition <állapot>', 'Termék állapota')
    .option('--description <leírás>', 'Leírás')
    .option('--county <megye>', 'Megye')
    .option('--city <város>', 'Város')
    .option('--attr <kulcs=érték>', 'Attribútum', (v: string, a: string[]) => [...a, v], [] as string[])
    .option('--contact-name <név>', 'Kapcsolattartó neve')
    .option('--contact-phone <telefon>', 'Kapcsolattartó telefonszáma')
    .option('--show-phone', 'Telefonszám megjelenítése')
    .action(
      async (
        idStr: string,
        opts: {
          title?: string
          price?: string
          negotiable?: boolean
          condition?: string
          description?: string
          county?: string
          city?: string
          attr: string[]
          contactName?: string
          contactPhone?: string
          showPhone?: boolean
        },
        cmd: Command,
      ) => {
        const id = parseInt(idStr, 10)
        if (isNaN(id)) {
          process.stderr.write('Érvénytelen azonosító.\n')
          process.exit(2)
          return
        }
        try {
          const attrs = parseAttrs(opts.attr)
          const body: Record<string, unknown> = {}
          if (opts.title) body.title = opts.title
          if (opts.price) body.priceGross = parseInt(opts.price, 10)
          if (opts.negotiable !== undefined) body.negotiable = opts.negotiable
          if (opts.condition) body.condition = opts.condition
          if (opts.description) body.description = opts.description
          if (opts.county) body.county = opts.county
          if (opts.city) body.city = opts.city
          if (Object.keys(attrs).length > 0) body.attributes = attrs
          if (opts.contactName) body.contactName = opts.contactName
          if (opts.contactPhone) body.contactPhone = opts.contactPhone
          if (opts.showPhone !== undefined) body.showPhone = opts.showPhone

          const ad = await shopClient.myAds.edit(id, body)
          if (getJsonFlag(cmd)) {
            printJson(ad)
          } else {
            process.stdout.write(`Hirdetés #${ad.id} frissítve.\n`)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── pause ────────────────────────────────────────────────────────────────────
  shop
    .command('pause <id>')
    .description('Hirdetés szüneteltetése')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const ad = await shopClient.myAds.pause(id)
        if (getJsonFlag(cmd)) printJson(ad)
        else process.stdout.write(`Hirdetés #${id} szüneteltetve.\n`)
      } catch (err) { handleError(err) }
    })

  // ── activate ─────────────────────────────────────────────────────────────────
  shop
    .command('activate <id>')
    .description('Hirdetés aktiválása')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const ad = await shopClient.myAds.activate(id)
        if (getJsonFlag(cmd)) printJson(ad)
        else process.stdout.write(`Hirdetés #${id} aktiválva.\n`)
      } catch (err) { handleError(err) }
    })

  // ── sold ─────────────────────────────────────────────────────────────────────
  shop
    .command('sold <id>')
    .description('Hirdetés eladottnak jelölése')
    .option('--price <Ft>', 'Tényleges eladási ár (bruttó Ft)')
    .action(async (idStr: string, opts: { price?: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const body = opts.price ? { soldPriceGross: parseInt(opts.price, 10) } : {}
        const ad = await shopClient.myAds.sold(id, body)
        if (getJsonFlag(cmd)) printJson(ad)
        else process.stdout.write(`Hirdetés #${id} eladottnak jelölve.\n`)
      } catch (err) { handleError(err) }
    })

  // ── renew ────────────────────────────────────────────────────────────────────
  shop
    .command('renew <id>')
    .description('Hirdetés megújítása')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const ad = await shopClient.myAds.renew(id)
        if (getJsonFlag(cmd)) printJson(ad)
        else process.stdout.write(`Hirdetés #${id} megújítva.\n`)
      } catch (err) { handleError(err) }
    })

  // ── delete ───────────────────────────────────────────────────────────────────
  shop
    .command('delete <id>')
    .description('Hirdetés törlése')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const result = await shopClient.myAds.delete(id)
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write(`Hirdetés #${id} törölve.\n`)
      } catch (err) { handleError(err) }
    })

  // ── inquiries ────────────────────────────────────────────────────────────────
  shop
    .command('inquiries')
    .description('Beérkezett üzenetek listája')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const items = await shopClient.inquiries.listReceived()
        if (getJsonFlag(cmd)) {
          printJson(items)
        } else {
          if (!Array.isArray(items) || items.length === 0) {
            process.stdout.write('Nincs beérkezett üzenet.\n')
            return
          }
          for (const item of items) {
            const read = item.readAt ? '' : ' [új]'
            process.stdout.write(`  #${item.id}${read}  Hirdetés #${item.adId}  ${item.senderName}\n`)
            process.stdout.write(`    ${item.message.slice(0, 80)}\n`)
          }
        }
      } catch (err) { handleError(err) }
    })

  // ── inquire ──────────────────────────────────────────────────────────────────
  shop
    .command('inquire <adId>')
    .description('Üzenet küldése eladónak')
    .option('--message <szöveg>', 'Üzenet szövege')
    .action(async (adIdStr: string, opts: { message?: string }, cmd: Command) => {
      const adId = parseInt(adIdStr, 10)
      if (isNaN(adId)) { process.stderr.write('Érvénytelen hirdetés-azonosító.\n'); process.exit(2); return }
      if (!opts.message) { process.stderr.write('--message megadása kötelező.\n'); process.exit(2); return }
      try {
        const result = await shopClient.inquiries.send(adId, { message: opts.message })
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write('Üzenet elküldve.\n')
      } catch (err) { handleError(err) }
    })

  // ── favorite ─────────────────────────────────────────────────────────────────
  shop
    .command('favorite <adId>')
    .description('Hirdetés mentése kedvencekbe')
    .action(async (adIdStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const adId = parseInt(adIdStr, 10)
      if (isNaN(adId)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const result = await shopClient.favorites.add(adId)
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write(`Hirdetés #${adId} hozzáadva a kedvencekhez.\n`)
      } catch (err) { handleError(err) }
    })

  // ── unfavorite ───────────────────────────────────────────────────────────────
  shop
    .command('unfavorite <adId>')
    .description('Hirdetés eltávolítása kedvencekből')
    .action(async (adIdStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const adId = parseInt(adIdStr, 10)
      if (isNaN(adId)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const result = await shopClient.favorites.remove(adId)
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write(`Hirdetés #${adId} eltávolítva a kedvencekből.\n`)
      } catch (err) { handleError(err) }
    })

  // ── favorites ────────────────────────────────────────────────────────────────
  shop
    .command('favorites')
    .description('Kedvenc hirdetések listája')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const ads = await shopClient.favorites.list()
        if (getJsonFlag(cmd)) {
          printJson(ads)
        } else {
          printAdTable(Array.isArray(ads) ? ads : [])
        }
      } catch (err) { handleError(err) }
    })

  // ── reserve ──────────────────────────────────────────────────────────────────
  shop
    .command('reserve <adId>')
    .description('Hirdetés lefoglalása (ingyenes — a fizetés közvetlenül az eladóval zajlik)')
    .option('--message <szöveg>', 'Üzenet az eladónak (max. 1000 karakter)')
    .option('--offer <Ft>', 'Ajánlott ár (bruttó Ft, ellenjavaslat)')
    .option('--phone <telefon>', 'Telefonszám (az eladónak átadva elfogadáskor, max. 50 kar.)')
    .option('--yes', 'Megerősítés kihagyása')
    .action(
      async (
        adIdStr: string,
        opts: { message?: string; offer?: string; phone?: string; yes?: boolean },
        cmd: Command,
      ) => {
        const adId = parseInt(adIdStr, 10)
        if (isNaN(adId)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }

        if (!opts.yes) {
          process.stdout.write(
            'A foglalás INGYENES — a fizetés és az átadás közvetlenül az eladóval történik.\n',
          )
          const ok = await askConfirm(`Lefoglalod a #${adId} hirdetést?`)
          if (!ok) { process.stdout.write('Megszakítva.\n'); process.exit(0); return }
        }

        try {
          const body: { message?: string; offerPriceGross?: number; phone?: string } = {}
          if (opts.message) body.message = opts.message
          if (opts.offer) body.offerPriceGross = parseInt(opts.offer, 10)
          if (opts.phone) body.phone = opts.phone

          const { reservation } = await shopClient.reservations.create(adId, body)
          if (getJsonFlag(cmd)) {
            printJson(reservation)
          } else {
            process.stdout.write('Foglalás létrehozva:\n')
            printReservation(reservation)
          }
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── reservations ─────────────────────────────────────────────────────────────
  shop
    .command('reservations')
    .description('Foglalásaim listája')
    .option('--as <buyer|seller>', 'Szerep: buyer (vevő, alapért.) vagy seller (eladó)', 'buyer')
    .option('--status <állapot>', 'Állapot szűrő')
    .option('--page <n>', 'Oldalszám', '1')
    .action(
      async (
        opts: { as?: string; status?: string; page?: string },
        cmd: Command,
      ) => {
        try {
          const result = await shopClient.reservations.list({
            role: (opts.as ?? 'buyer') as 'buyer' | 'seller',
            status: opts.status,
            page: opts.page ? parseInt(opts.page, 10) : undefined,
          })
          if (getJsonFlag(cmd)) {
            printJson(result)
          } else {
            const items = result.items ?? []
            if (items.length === 0) {
              process.stdout.write('Nincs foglalás.\n')
              return
            }
            for (const r of items) {
              printReservation(r)
              process.stdout.write('\n')
            }
          }
        } catch (err) {
          handleError(err)
        }
      },
    )

  // ── reservation sub-group ────────────────────────────────────────────────────
  const reservation = shop
    .command('reservation')
    .description('Foglalás kezelése (elfogad / elutasít / lemond / teljesít)')

  reservation
    .command('accept <id>')
    .description('Foglalás elfogadása (eladóként)')
    .option('--held-until <ISO>', 'Határidő a vevőnek (ISO-8601 dátum/idő)')
    .action(async (idStr: string, opts: { heldUntil?: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const { reservation: r } = await shopClient.reservations.accept(id, { heldUntil: opts.heldUntil })
        if (getJsonFlag(cmd)) printJson(r)
        else process.stdout.write(`Foglalás #${id} elfogadva (állapot: ${r.status}).\n`)
      } catch (err) { handleError(err) }
    })

  reservation
    .command('decline <id>')
    .description('Foglalás elutasítása (eladóként)')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const { reservation: r } = await shopClient.reservations.decline(id)
        if (getJsonFlag(cmd)) printJson(r)
        else process.stdout.write(`Foglalás #${id} elutasítva.\n`)
      } catch (err) { handleError(err) }
    })

  reservation
    .command('cancel <id>')
    .description('Foglalás lemondása (vevőként)')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const { reservation: r } = await shopClient.reservations.cancel(id)
        if (getJsonFlag(cmd)) printJson(r)
        else process.stdout.write(`Foglalás #${id} lemondva.\n`)
      } catch (err) { handleError(err) }
    })

  reservation
    .command('complete <id>')
    .description('Foglalás teljesítése (eladóként)')
    .option('--price <Ft>', 'Tényleges eladási ár (bruttó Ft)')
    .action(async (idStr: string, opts: { price?: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const body = opts.price ? { soldPriceGross: parseInt(opts.price, 10) } : {}
        const { reservation: r } = await shopClient.reservations.complete(id, body)
        if (getJsonFlag(cmd)) printJson(r)
        else process.stdout.write(`Foglalás #${id} teljesítve.\n`)
      } catch (err) { handleError(err) }
    })
}
