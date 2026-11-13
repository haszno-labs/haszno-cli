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
 *   haszno shop post-bulk <fájl|könyvtár>  Tömeges hirdetésfeladás CSV vagy könyvtárból
 *   haszno shop my                      Saját hirdetések
 *   haszno shop edit <id>               Hirdetés szerkesztése
 *   haszno shop pause <id>              Hirdetés szüneteltetése
 *   haszno shop activate <id>           Hirdetés aktiválása
 *   haszno shop sold <id>               Hirdetés eladottnak jelölése
 *   haszno shop renew <id>              Hirdetés megújítása
 *   haszno shop delete <id>             Hirdetés törlése
 *   haszno shop inquiries               Beérkezett üzenetek listája
 *   haszno shop inquire <adId>          Üzenet küldése eladónak
 *   haszno shop inquiry reply <id>      Válasz küldése érdeklődőnek (eladóként)
 *   haszno shop favorite <adId>         Hirdetés mentése kedvencekbe
 *   haszno shop unfavorite <adId>       Hirdetés eltávolítása kedvencekből
 *   haszno shop favorites               Kedvenc hirdetések listája
 *   haszno shop watch <adId>            Áresés-értesítő feliratkozás hirdetésre
 *   haszno shop unwatch <adId>          Áresés-értesítő leiratkozás
 *   haszno shop saved-search list       Mentett keresések listája
 *   haszno shop saved-search add        Új mentett keresés
 *   haszno shop saved-search remove <id>  Mentett keresés törlése
 *   haszno shop import-url <url>        Hirdetés importálása URL-ből
 *   haszno shop draft show              Vázlat megjelenítése
 *   haszno shop draft save              Vázlat mentése (JSON stdin)
 *   haszno shop draft clear             Vázlat törlése
 *   haszno shop reserve <adId>          Hirdetés lefoglalása
 *   haszno shop reservations            Foglalásaim listája
 *   haszno shop reservation accept <id>         Foglalás elfogadása (eladóként)
 *   haszno shop reservation decline <id>        Foglalás elutasítása (eladóként)
 *   haszno shop reservation cancel <id>         Foglalás lemondása (vevőként)
 *   haszno shop reservation complete <id>       Foglalás teljesítése (eladóként)
 *   haszno shop reservation counter <id>        Ellenajánlat (eladóként)
 *   haszno shop reservation accept-counter <id> Ellenajánlat elfogadása (vevőként)
 *   haszno shop reservation messages <id>       Foglalás üzenetei
 *   haszno shop reservation message <id>        Üzenet küldése a foglaláson
 *   haszno shop reservation review <id>         Értékelés leadása
 *
 * Note: reserving is free — payment happens directly between buyer and seller.
 */

import { createInterface } from 'node:readline'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import type { Command } from 'commander'
import type { HttpOptions } from '../client/http.js'
import type {
  ShopHasznoClient,
  ShopMyAd,
  ShopReservation,
  ShopReservationSimple,
  ShopSavedSearchFilters,
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

function printAdTable(ads: Array<{ id: number; priceGross: number | null; status?: string; reserved: boolean; title: string }>): void {
  if (ads.length === 0) {
    process.stdout.write('Nincs találat.\n')
    return
  }
  for (const ad of ads) {
    const rawStatus = ad.status ?? ''
    const status = rawStatus === 'aktiv' ? 'aktív' : rawStatus
    const reserved = ad.reserved ? ' [foglalt]' : ''
    process.stdout.write(
      `  #${String(ad.id).padStart(5)}  ${fmt(ad.priceGross ?? 0).padStart(12)}  ${status.padEnd(10)}${reserved}  ${ad.title}\n`,
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
  if (r.offerPriceGross) {
    process.stdout.write(`    Ajánlott ár:    ${fmt(r.offerPriceGross)}\n`)
  }
  if (r.counterPriceGross) {
    process.stdout.write(`    Ellenajánlat:   ${fmt(r.counterPriceGross)}\n`)
  }
  if (r.agreedPriceGross) {
    process.stdout.write(`    Elfogadott ár:  ${fmt(r.agreedPriceGross)}\n`)
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
  if (full.sellerName) {
    process.stdout.write(`    Eladó neve:  ${full.sellerName}\n`)
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
            process.stdout.write(`${cat.key}  ${cat.label}\n`)
            for (const sub of cat.subcategories ?? []) {
              const reqAttrs = sub.attrs?.filter((a) => a.required).map((a) => a.key).join(', ') ?? ''
              process.stdout.write(
                `  └─ ${sub.key.padEnd(30)} ${sub.label}${reqAttrs ? `  [köt.: ${reqAttrs}]` : ''}\n`,
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
          process.stdout.write(`  Ár:        ${fmt(ad.priceGross ?? 0)}${ad.negotiable ? ' (alku)' : ''}\n`)
          process.stdout.write(`  Állapot:   ${ad.status}${ad.reserved ? ' [foglalt]' : ''}\n`)
          if (ad.condition) process.stdout.write(`  Állapot:   ${ad.condition}\n`)
          if (ad.county || ad.city) {
            process.stdout.write(`  Helyszín:  ${[ad.county, ad.city].filter(Boolean).join(', ')}\n`)
          }
          if (ad.description) {
            process.stdout.write(`  Leírás:\n${ad.description.split('\n').map((l) => `    ${l}`).join('\n')}\n`)
          }
          if (Object.keys(ad.attrs ?? {}).length > 0) {
            process.stdout.write('  Attribútumok:\n')
            for (const [k, v] of Object.entries(ad.attrs)) {
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
          category: opts.category,
          subcategory: opts.subcategory,
        })
        if (getJsonFlag(cmd)) {
          printJson(hint)
        } else {
          if (!hint) {
            process.stdout.write('Nincs elegendő adat az árjavaslathoz.\n')
          } else {
            process.stdout.write('Árjavaslat:\n')
            process.stdout.write(`  25. percentilis: ${fmt(hint.p25)}\n`)
            process.stdout.write(`  75. percentilis: ${fmt(hint.p75)}\n`)
            process.stdout.write(`  Mintaalap: ${hint.count} hirdetés\n`)
          }
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
    .option('--category <kulcs>', 'Kategória kulcsa (pl. elekt)')
    .option('--subcategory <kulcs>', 'Alkategória kulcsa')
    .option('--price <Ft>', 'Vételár (bruttó Ft, üresen = ár nélkül)')
    .option('--negotiable', 'Alkuképes')
    .option('--condition <állapot>', 'Állapot: uj | ujszeru | hasznalt | serult')
    .option('--description <leírás>', 'Hirdetés leírása')
    .option('--county <megye>', 'Megye')
    .option('--city <város>', 'Város')
    .option('--contact-name <név>', 'Kapcsolattartó neve')
    .option('--contact-phone <telefon>', 'Kapcsolattartó telefonszáma')
    .option('--contact-email <email>', 'Kapcsolattartó e-mail-cím (kötelező)')
    .option('--show-phone', 'Telefonszám megjelenítése')
    .option('--resellable', 'Viszonteladói jogok engedélyezése')
    .option('--commission-pct <szám>', 'Viszonteladói jutalék (%)', '0')
    .option('--attr <kulcs=érték>', 'Attribútum (megismételhető)', (v: string, a: string[]) => [...a, v], [] as string[])
    .option('--image <fájl>', 'Képfájl feltöltése (megismételhető)', (v: string, a: string[]) => [...a, v], [] as string[])
    .option('--from-photos', 'AI-javaslatot kér a feltöltött képek alapján')
    .option('--remove-bg', 'Háttér eltávolítása a feltöltött képekről (AI)')
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
          contactName?: string
          contactPhone?: string
          contactEmail?: string
          showPhone?: boolean
          resellable?: boolean
          commissionPct?: string
          attr: string[]
          image: string[]
          fromPhotos?: boolean
          removeBg?: boolean
          dryRun?: boolean
          yes?: boolean
        },
        cmd: Command,
      ) => {
        try {
          // Upload images first; track both url strings (for ad body) and
          // numeric ids (for fromPhotos)
          const imageUrls: string[] = []
          const imageNumericIds: number[] = []
          if (opts.image.length > 0) {
            process.stderr.write(`${opts.image.length} kép feltöltése...\n`)
            for (const filePath of opts.image) {
              const uploaded = await shopClient.myAds.uploadImage(filePath)
              let result = uploaded
              if (opts.removeBg) {
                process.stderr.write(`Háttér eltávolítása: kép #${uploaded.id}...\n`)
                try {
                  result = await shopClient.images.removeBg(uploaded.id)
                } catch (err) {
                  process.stderr.write(`Figyelmeztetés: háttér-eltávolítás sikertelen (${err instanceof Error ? err.message : String(err)}), eredeti kép használata.\n`)
                  result = uploaded
                }
              }
              imageUrls.push(result.url)
              imageNumericIds.push(result.id)
            }
          }

          // AI suggest from photos if requested
          let aiSuggest: Record<string, unknown> = {}
          if (opts.fromPhotos && imageNumericIds.length > 0) {
            process.stderr.write('AI-javaslat kérése a képekből...\n')
            aiSuggest = await shopClient.myAds.fromPhotos(imageNumericIds) as Record<string, unknown>
            process.stdout.write('AI-javaslat:\n')
            printJson(aiSuggest)
          }

          const attrs = parseAttrs(opts.attr)

          const title = opts.title ?? (aiSuggest.title as string | undefined) ?? ''
          const category = opts.category ?? (aiSuggest.categoryId as string | undefined) ?? ''
          const condition = opts.condition ?? (aiSuggest.condition as string | undefined) ?? ''
          const county = opts.county ?? ''
          const city = opts.city ?? ''
          const contactEmail = opts.contactEmail ?? ''

          const body = {
            title,
            category,
            subcategory: opts.subcategory ?? (aiSuggest.subcategoryId as string | undefined) ?? null,
            priceGross:
              opts.price != null
                ? parseInt(opts.price, 10)
                : (aiSuggest.suggestedPriceGross as number | undefined) ?? null,
            negotiable: opts.negotiable ?? false,
            condition,
            description: opts.description ?? (aiSuggest.description as string | undefined) ?? '',
            county,
            city,
            attrs: { ...(aiSuggest.attrs as Record<string, string | number | boolean> | undefined), ...attrs },
            images: imageUrls,
            contactName: opts.contactName ?? '',
            contactPhone: opts.contactPhone ?? null,
            contactEmail,
            showPhone: opts.showPhone ?? false,
            resellable: opts.resellable ?? false,
            partnerCommissionPct: opts.commissionPct ? parseFloat(opts.commissionPct) : 0,
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

          // Validate required fields before sending
          const missing: string[] = []
          if (!body.category) missing.push('--category')
          if (!body.condition) missing.push('--condition')
          if (!body.county) missing.push('--county')
          if (!body.city) missing.push('--city')
          if (!body.contactName) missing.push('--contact-name')
          if (!body.contactEmail) missing.push('--contact-email')
          if (missing.length > 0) {
            process.stderr.write(`Hiányzó kötelező mező${missing.length > 1 ? 'k' : ''}: ${missing.join(', ')}\n`)
            process.exit(2)
            return
          }

          if (!opts.yes) {
            process.stdout.write('Hirdetés tervezett adatai:\n')
            printJson(body)
            const ok = await askConfirm('Feladjuk így?')
            if (!ok) {
              process.stdout.write('Megszakítva.\n')
              process.exit(0)
              return
            }
          }

          const ad = await shopClient.myAds.post(body as Parameters<typeof shopClient.myAds.post>[0])
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
    .option('--condition <állapot>', 'Állapot: uj | ujszeru | hasznalt | serult')
    .option('--description <leírás>', 'Leírás')
    .option('--county <megye>', 'Megye')
    .option('--city <város>', 'Város')
    .option('--attr <kulcs=érték>', 'Attribútum', (v: string, a: string[]) => [...a, v], [] as string[])
    .option('--contact-name <név>', 'Kapcsolattartó neve')
    .option('--contact-phone <telefon>', 'Kapcsolattartó telefonszáma')
    .option('--contact-email <email>', 'Kapcsolattartó e-mail-cím')
    .option('--show-phone', 'Telefonszám megjelenítése')
    .option('--resellable', 'Viszonteladói jogok engedélyezése')
    .option('--commission-pct <szám>', 'Viszonteladói jutalék (%)')
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
          contactEmail?: string
          showPhone?: boolean
          resellable?: boolean
          commissionPct?: string
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
          if (Object.keys(attrs).length > 0) body.attrs = attrs
          if (opts.contactName) body.contactName = opts.contactName
          if (opts.contactPhone) body.contactPhone = opts.contactPhone
          if (opts.contactEmail) body.contactEmail = opts.contactEmail
          if (opts.showPhone !== undefined) body.showPhone = opts.showPhone
          if (opts.resellable !== undefined) body.resellable = opts.resellable
          if (opts.commissionPct) body.partnerCommissionPct = parseFloat(opts.commissionPct)

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
            process.stdout.write(`  #${item.id}${read}  Hirdetés #${item.adId}  ${item.name}\n`)
            process.stdout.write(`    ${item.message.slice(0, 80)}\n`)
          }
        }
      } catch (err) { handleError(err) }
    })

  // ── inquire ──────────────────────────────────────────────────────────────────
  shop
    .command('inquire <adId>')
    .description('Üzenet küldése eladónak')
    .option('--name <név>', 'A feladó neve (kötelező)')
    .option('--email <email>', 'A feladó e-mail-cím (kötelező)')
    .option('--phone <telefon>', 'A feladó telefonszáma (opcionális)')
    .option('--message <szöveg>', 'Üzenet szövege (kötelező)')
    .action(async (adIdStr: string, opts: { name?: string; email?: string; phone?: string; message?: string }, cmd: Command) => {
      const adId = parseInt(adIdStr, 10)
      if (isNaN(adId)) { process.stderr.write('Érvénytelen hirdetés-azonosító.\n'); process.exit(2); return }
      if (!opts.name) { process.stderr.write('--name megadása kötelező.\n'); process.exit(2); return }
      if (!opts.email) { process.stderr.write('--email megadása kötelező.\n'); process.exit(2); return }
      if (!opts.message) { process.stderr.write('--message megadása kötelező.\n'); process.exit(2); return }
      try {
        const body: { name: string; email: string; phone?: string; message: string } = {
          name: opts.name,
          email: opts.email,
          message: opts.message,
        }
        if (opts.phone) body.phone = opts.phone
        const result = await shopClient.inquiries.send(adId, body)
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
        else process.stdout.write(`Foglalás #${id} visszavonva.\n`)
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

  // ── reservation counter ───────────────────────────────────────────────────
  reservation
    .command('counter <id>')
    .description('Ellenajánlat küldése (eladóként, amíg a foglalás függőben van)')
    .requiredOption('--price <Ft>', 'Ellenajánlott ár (bruttó Ft)')
    .action(async (idStr: string, opts: { price: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      const price = parseInt(opts.price, 10)
      if (isNaN(price) || price <= 0) { process.stderr.write('Érvénytelen ár.\n'); process.exit(2); return }
      try {
        const { reservation: r } = await shopClient.reservations.counter(id, price)
        if (getJsonFlag(cmd)) printJson(r)
        else process.stdout.write(`Ellenajánlat elküldve: ${fmt(price)} (foglalás #${id}).\n`)
      } catch (err) { handleError(err) }
    })

  // ── reservation accept-counter ─────────────────────────────────────────────
  reservation
    .command('accept-counter <id>')
    .description('Eladói ellenajánlat elfogadása (vevőként)')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const { reservation: r } = await shopClient.reservations.acceptCounter(id)
        if (getJsonFlag(cmd)) printJson(r)
        else process.stdout.write(`Ellenajánlat elfogadva (foglalás #${id}).\n`)
      } catch (err) { handleError(err) }
    })

  // ── reservation messages ──────────────────────────────────────────────────
  reservation
    .command('messages <id>')
    .description('Foglalás üzenetei')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const { items } = await shopClient.reservations.messages(id)
        if (getJsonFlag(cmd)) {
          printJson(items)
        } else {
          if (items.length === 0) { process.stdout.write('Nincs üzenet.\n'); return }
          for (const m of items) {
            const who = m.author === 'buyer' ? 'Vevő' : 'Eladó'
            process.stdout.write(`  [${m.createdAt.slice(0, 16)}] ${who}: ${m.body}\n`)
          }
        }
      } catch (err) { handleError(err) }
    })

  // ── reservation message ───────────────────────────────────────────────────
  reservation
    .command('message <id>')
    .description('Üzenet küldése a foglaláson')
    .requiredOption('--text <szöveg>', 'Üzenet szövege (1–2000 karakter)')
    .action(async (idStr: string, opts: { text: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      if (!opts.text.trim()) { process.stderr.write('--text megadása kötelező.\n'); process.exit(2); return }
      try {
        const { message: m } = await shopClient.reservations.message(id, opts.text)
        if (getJsonFlag(cmd)) printJson(m)
        else process.stdout.write(`Üzenet elküldve (#${m.id}).\n`)
      } catch (err) { handleError(err) }
    })

  // ── reservation review ────────────────────────────────────────────────────
  reservation
    .command('review <id>')
    .description('Értékelés leadása teljesített foglalásra')
    .requiredOption('--rating <1-5>', 'Értékelés (1–5 csillag)')
    .option('--comment <szöveg>', 'Szöveges megjegyzés (max. 1000 karakter)')
    .action(async (idStr: string, opts: { rating: string; comment?: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      const rating = parseInt(opts.rating, 10)
      if (isNaN(rating) || rating < 1 || rating > 5) {
        process.stderr.write('--rating értéke 1 és 5 közé kell essen.\n')
        process.exit(2)
        return
      }
      try {
        const { review } = await shopClient.reservations.review(id, rating, opts.comment)
        if (getJsonFlag(cmd)) printJson(review)
        else process.stdout.write(`Értékelés leadva: ${rating} csillag (foglalás #${id}).\n`)
      } catch (err) { handleError(err) }
    })

  // ── inquiry reply ─────────────────────────────────────────────────────────
  const inquiry = shop
    .command('inquiry')
    .description('Érdeklődés kezelése (eladóként)')

  inquiry
    .command('reply <id>')
    .description('Válasz küldése érdeklődőnek (eladóként)')
    .requiredOption('--message <szöveg>', 'Válasz szövege (1–2000 karakter)')
    .action(async (idStr: string, opts: { message: string }, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      if (!opts.message.trim()) { process.stderr.write('--message megadása kötelező.\n'); process.exit(2); return }
      try {
        const { reply } = await shopClient.inquiries.reply(id, opts.message)
        if (getJsonFlag(cmd)) printJson(reply)
        else process.stdout.write(`Válasz elküldve az érdeklődőnek (érdeklődés #${reply.inquiryId}).\n`)
      } catch (err) { handleError(err) }
    })

  // ── saved-search ──────────────────────────────────────────────────────────
  const savedSearch = shop
    .command('saved-search')
    .description('Mentett keresések kezelése')

  savedSearch
    .command('list')
    .description('Mentett keresések listája')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const items = await shopClient.savedSearches.list()
        if (getJsonFlag(cmd)) {
          printJson(items)
        } else {
          if (items.length === 0) { process.stdout.write('Nincs mentett keresés.\n'); return }
          for (const s of items) {
            const alert = s.alertEnabled ? ' [értesítő: be]' : ''
            process.stdout.write(`  #${s.id}  ${s.name}${alert}\n`)
            const f = s.filters
            const parts: string[] = []
            if (f.q) parts.push(`„${f.q}"`)
            if (f.cat) parts.push(`kat:${f.cat}`)
            if (f.sub) parts.push(`alkat:${f.sub}`)
            if (f.min != null) parts.push(`min ${fmt(f.min)}`)
            if (f.max != null) parts.push(`max ${fmt(f.max)}`)
            if (f.county) parts.push(f.county)
            if (f.cond) parts.push(f.cond)
            if (parts.length > 0) process.stdout.write(`       ${parts.join(', ')}\n`)
          }
        }
      } catch (err) { handleError(err) }
    })

  savedSearch
    .command('add')
    .description('Új mentett keresés (ugyanazok a szűrők, mint a "search" parancsnál)')
    .requiredOption('--name <név>', 'A mentett keresés neve')
    .option('--query <szöveg>', 'Keresőszöveg')
    .option('--category <id>', 'Kategória')
    .option('--subcategory <id>', 'Alkategória')
    .option('--min-price <Ft>', 'Minimum ár')
    .option('--max-price <Ft>', 'Maximum ár')
    .option('--county <megye>', 'Megye')
    .option('--condition <állapot>', 'Állapot: uj | ujszeru | hasznalt | serult')
    .option('--no-alert', 'E-mail értesítő kikapcsolása (alapért.: be)')
    .action(async (opts: {
      name: string
      query?: string
      category?: string
      subcategory?: string
      minPrice?: string
      maxPrice?: string
      county?: string
      condition?: string
      alert: boolean
    }, cmd: Command) => {
      const filters: ShopSavedSearchFilters = {}
      if (opts.query) filters.q = opts.query
      if (opts.category) filters.cat = opts.category
      if (opts.subcategory) filters.sub = opts.subcategory
      if (opts.minPrice) filters.min = parseInt(opts.minPrice, 10)
      if (opts.maxPrice) filters.max = parseInt(opts.maxPrice, 10)
      if (opts.county) filters.county = opts.county
      if (opts.condition) filters.cond = opts.condition
      try {
        const s = await shopClient.savedSearches.add({ name: opts.name, filters, alertEnabled: opts.alert !== false })
        if (getJsonFlag(cmd)) printJson(s)
        else process.stdout.write(`Mentett keresés létrehozva: #${s.id}  ${s.name}\n`)
      } catch (err) { handleError(err) }
    })

  savedSearch
    .command('remove <id>')
    .description('Mentett keresés törlése')
    .action(async (idStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const id = parseInt(idStr, 10)
      if (isNaN(id)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const result = await shopClient.savedSearches.remove(id)
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write(`Mentett keresés #${id} törölve.\n`)
      } catch (err) { handleError(err) }
    })

  // ── watch / unwatch ───────────────────────────────────────────────────────
  shop
    .command('watch <adId>')
    .description('Feliratkozás áresés-értesítőre egy hirdetésnél')
    .action(async (adIdStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const adId = parseInt(adIdStr, 10)
      if (isNaN(adId)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const result = await shopClient.watch.watch(adId)
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write(`Hirdetés #${adId} áresés-értesítőre feliratkozva.\n`)
      } catch (err) { handleError(err) }
    })

  shop
    .command('unwatch <adId>')
    .description('Leiratkozás áresés-értesítőről')
    .action(async (adIdStr: string, _opts: Record<string, unknown>, cmd: Command) => {
      const adId = parseInt(adIdStr, 10)
      if (isNaN(adId)) { process.stderr.write('Érvénytelen azonosító.\n'); process.exit(2); return }
      try {
        const result = await shopClient.watch.unwatch(adId)
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write(`Hirdetés #${adId} áresés-értesítőről leiratkozva.\n`)
      } catch (err) { handleError(err) }
    })

  // ── import-url ────────────────────────────────────────────────────────────
  shop
    .command('import-url <url>')
    .description('Hirdetés importálása URL-ből (kinyeri a metaadatokat)')
    .option('--post', 'Importált adatok alapján hirdetést ad fel (interaktív)')
    .option('--yes', 'Megerősítés kihagyása (csak --post-tal)')
    .action(async (url: string, opts: { post?: boolean; yes?: boolean }, cmd: Command) => {
      try {
        process.stderr.write('URL elemzése...\n')
        const data = await shopClient.urlImport.importUrl(url)
        if (getJsonFlag(cmd)) {
          printJson(data)
          return
        }
        process.stdout.write('Kinyert adatok:\n')
        if (data.title) process.stdout.write(`  Cím:      ${data.title}\n`)
        if (data.price) process.stdout.write(`  Ár:       ${fmt(data.price)}\n`)
        if (data.description) {
          process.stdout.write(`  Leírás:   ${data.description.slice(0, 120)}${data.description.length > 120 ? '…' : ''}\n`)
        }
        if (data.images.length > 0) {
          process.stdout.write(`  Képek:    ${data.images.length} db\n`)
        }
        if (Object.keys(data.parsed).length > 0) {
          process.stdout.write('  Elemzett:\n')
          for (const [k, v] of Object.entries(data.parsed)) {
            process.stdout.write(`    ${k}: ${v}\n`)
          }
        }
        if (opts.post) {
          if (!opts.yes) {
            const ok = await askConfirm('Hirdetést adsz fel ezekkel az adatokkal?')
            if (!ok) { process.stdout.write('Megszakítva.\n'); process.exit(0); return }
          }
          // Build body from extracted data and post
          const body: Record<string, unknown> = {
            title: data.title ?? '',
            description: data.description ?? '',
            priceGross: data.price ?? null,
            negotiable: false,
            condition: 'hasznalt',
            county: '',
            city: '',
            category: '',
            images: data.images,
            attrs: {},
            contactName: '',
            contactPhone: null,
            contactEmail: '',
            showPhone: false,
            resellable: false,
            partnerCommissionPct: 0,
          }
          if (!body.title) {
            process.stderr.write('Nem sikerült automatikusan feladni: cím hiányzik. Adj meg --title és a kötelező mezőket kézzel a "haszno shop post" paranccsal.\n')
            process.exit(2)
            return
          }
          const ad = await shopClient.myAds.post(body as unknown as Parameters<typeof shopClient.myAds.post>[0])
          process.stdout.write(`Hirdetés feladva: #${ad.id}  ${ad.title}\n`)
        }
      } catch (err) { handleError(err) }
    })

  // ── draft ─────────────────────────────────────────────────────────────────
  const draft = shop
    .command('draft')
    .description('Hirdetésvázlat kezelése (szerver oldal)')

  draft
    .command('show')
    .description('Aktuális vázlat megjelenítése')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const d = await shopClient.draft.show()
        if (getJsonFlag(cmd)) {
          printJson(d)
        } else {
          if (!d) { process.stdout.write('Nincs mentett vázlat.\n'); return }
          process.stdout.write(`Vázlat (mentve: ${d.updatedAt}):\n`)
          printJson(d.payload)
        }
      } catch (err) { handleError(err) }
    })

  draft
    .command('save')
    .description('Vázlat mentése (JSON a stdin-ről)')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        process.stderr.write('JSON beolvasása (stdin)...\n')
        const chunks: Buffer[] = []
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
        const rawText = Buffer.concat(chunks).toString('utf8').trim()
        if (!rawText) { process.stderr.write('Üres bemenet.\n'); process.exit(2); return }
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(rawText) as Record<string, unknown>
        } catch {
          process.stderr.write('Érvénytelen JSON.\n')
          process.exit(2)
          return
        }
        const d = await shopClient.draft.save(payload)
        if (getJsonFlag(cmd)) printJson(d)
        else process.stdout.write(`Vázlat mentve (${d.updatedAt}).\n`)
      } catch (err) { handleError(err) }
    })

  draft
    .command('clear')
    .description('Vázlat törlése')
    .action(async (_opts: Record<string, unknown>, cmd: Command) => {
      try {
        const result = await shopClient.draft.clear()
        if (getJsonFlag(cmd)) printJson(result)
        else process.stdout.write('Vázlat törölve.\n')
      } catch (err) { handleError(err) }
    })

  // ── post-bulk ─────────────────────────────────────────────────────────────
  shop
    .command('post-bulk <forrás>')
    .description('Tömeges hirdetésfeladás CSV fájlból vagy könyvtárból')
    .option('--from-photos', 'Könyvtár mód: alkönyvtáranként egy hirdetés, AI-javaslat képekből')
    .option('--dry-run', 'Csak előnézet, nem ad fel')
    .option('--yes', 'Megerősítés kihagyása (kötelező az éles feltöltéshez)')
    .action(async (source: string, opts: { fromPhotos?: boolean; dryRun?: boolean; yes?: boolean }, cmd: Command) => {
      try {
        type BulkAdRow = {
          title: string
          category: string
          subcategory?: string
          price?: string
          negotiable?: string
          condition: string
          description?: string
          county: string
          city: string
          contact_name: string
          contact_phone?: string
          contact_email: string
          show_phone?: string
          images?: string
        }
        let rows: BulkAdRow[] = []

        // Determine if source is a directory or CSV file
        let isDirectory = false
        try { isDirectory = statSync(source).isDirectory() } catch { /* will error below */ }

        if (opts.fromPhotos || isDirectory) {
          // Directory mode: each subdirectory is one ad's photos
          let entries: string[]
          try {
            entries = readdirSync(source).filter((e) => {
              try { return statSync(join(source, e)).isDirectory() } catch { return false }
            })
          } catch (err) {
            process.stderr.write(`Nem sikerült beolvasni a könyvtárat: ${err instanceof Error ? err.message : String(err)}\n`)
            process.exit(2)
            return
          }
          if (entries.length === 0) {
            process.stderr.write('Nincs alkönyvtár a megadott könyvtárban.\n')
            process.exit(2)
            return
          }
          // Build placeholder rows for each subdirectory (actual data from AI)
          rows = entries.map((e) => ({
            title: e,
            category: '',
            condition: 'hasznalt',
            county: '',
            city: '',
            contact_name: '',
            contact_email: '',
            images: join(source, e),
          }))
        } else {
          // CSV mode
          let csvText: string
          try {
            csvText = readFileSync(source, 'utf8')
          } catch (err) {
            process.stderr.write(`Nem sikerült beolvasni a CSV fájlt: ${err instanceof Error ? err.message : String(err)}\n`)
            process.exit(2)
            return
          }
          const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean)
          if (lines.length < 2) {
            process.stderr.write('A CSV fájl üres vagy csak fejlécet tartalmaz.\n')
            process.exit(2)
            return
          }
          const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
          rows = lines.slice(1).map((line) => {
            // Simple CSV parsing (no quoted fields with commas)
            const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
            const obj: Record<string, string> = {}
            headers.forEach((h, i) => { obj[h] = values[i] ?? '' })
            return obj as unknown as BulkAdRow
          })
        }

        // Print preview table
        process.stdout.write(`\nElőnézet — ${rows.length} hirdetés:\n`)
        process.stdout.write('  #   Cím'.padEnd(45) + '  Kategória  Ár\n')
        process.stdout.write('  ' + '-'.repeat(60) + '\n')
        rows.forEach((r, i) => {
          const price = r.price ? fmt(parseInt(r.price, 10)) : '—'
          process.stdout.write(`  ${String(i + 1).padStart(3)}  ${r.title.slice(0, 36).padEnd(36)}  ${(r.category || '—').padEnd(10)}  ${price}\n`)
        })

        if (opts.dryRun) {
          process.stdout.write('\n(dry-run: nem lett feladva)\n')
          return
        }

        if (!opts.yes) {
          const ok = await askConfirm(`\nFeladod mind a ${rows.length} hirdetést?`)
          if (!ok) { process.stdout.write('Megszakítva.\n'); process.exit(0); return }
        }

        let posted = 0
        for (const row of rows) {
          try {
            if (opts.fromPhotos || isDirectory) {
              // Directory mode: upload photos from subdirectory, then use AI to generate data
              const dirPath = row.images ?? ''
              let imageFiles: string[] = []
              try {
                imageFiles = readdirSync(dirPath)
                  .filter((f) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(f).toLowerCase()))
                  .map((f) => join(dirPath, f))
              } catch { /* no images */ }

              const imageUrls: string[] = []
              const imageIds: number[] = []
              for (const imgFile of imageFiles) {
                const uploaded = await shopClient.myAds.uploadImage(imgFile)
                imageUrls.push(uploaded.url)
                imageIds.push(uploaded.id)
              }

              let aiSuggest: Record<string, unknown> = {}
              if (imageIds.length > 0) {
                process.stderr.write(`AI-javaslat kérése (${row.title})...\n`)
                aiSuggest = await shopClient.myAds.fromPhotos(imageIds) as Record<string, unknown>
              }

              const title = aiSuggest.title as string || row.title
              const body = {
                title,
                category: (aiSuggest.categoryId as string) || row.category || 'egyeb',
                subcategory: (aiSuggest.subcategoryId as string | undefined) ?? null,
                priceGross: aiSuggest.suggestedPriceGross as number | null ?? null,
                negotiable: false,
                condition: (aiSuggest.condition as string) || row.condition || 'hasznalt',
                county: row.county || '',
                city: row.city || '',
                description: (aiSuggest.description as string) || row.description || '',
                images: imageUrls,
                attrs: (aiSuggest.attrs as Record<string, string | number | boolean>) || {},
                contactName: row.contact_name || '',
                contactPhone: row.contact_phone || null,
                contactEmail: row.contact_email || '',
                showPhone: false,
                resellable: false,
                partnerCommissionPct: 0,
              }
              const ad = await shopClient.myAds.post(body as Parameters<typeof shopClient.myAds.post>[0])
              process.stdout.write(`  ✓ Feladva: #${ad.id}  ${ad.title}\n`)
            } else {
              // CSV mode
              const body = {
                title: row.title,
                category: row.category,
                subcategory: row.subcategory || null,
                priceGross: row.price ? parseInt(row.price, 10) : null,
                negotiable: row.negotiable === 'true' || row.negotiable === '1',
                condition: row.condition || 'hasznalt',
                county: row.county,
                city: row.city,
                description: row.description || '',
                images: [],
                attrs: {},
                contactName: row.contact_name,
                contactPhone: row.contact_phone || null,
                contactEmail: row.contact_email,
                showPhone: row.show_phone === 'true' || row.show_phone === '1',
                resellable: false,
                partnerCommissionPct: 0,
              }
              const ad = await shopClient.myAds.post(body as Parameters<typeof shopClient.myAds.post>[0])
              process.stdout.write(`  ✓ Feladva: #${ad.id}  ${ad.title}\n`)
            }
            posted++
          } catch (err) {
            const msg = err instanceof HasznoApiError ? `HTTP ${err.status}: ${err.message}` : String(err)
            process.stdout.write(`  ✗ Hiba (${row.title}): ${msg}\n`)
            process.stdout.write(`\nMegállás az első hibánál. Feladva: ${posted}/${rows.length}\n`)
            process.exit(1)
            return
          }
        }
        process.stdout.write(`\nKész. Feladva: ${posted}/${rows.length} hirdetés.\n`)
      } catch (err) { handleError(err) }
    })
}
