# haszno-cli

[English](README.md) | **Magyar**

**Haszno** parancssori felület — kezeld a dropshipping adataidat a terminalból.

> Egyszeri bejelentkezés konfigurálja a CLI-t **és** az MCP szervert egyaránt.  
> Webhely: [haszno.com](https://haszno.com)

---

## Telepítés

### Ajánlott: megosztott telepítő (CLI + MCP + skill egyszerre)

```bash
# A három haszno-labs csomag egyszerre telepíthető a megosztott installer szkripttel:
npx haszno-install
```

### Kézi telepítés

```bash
npm install -g github:haszno-labs/haszno-cli
```

## Hitelesítés — kétféle mód

A CLI automatikusan választja ki a módot a megadott credential alapján.

### 1. mód — Bolt-token (ügynök-hozzáférés, `haszno_` előtag)

A bolt-tokenek `haszno_` előtaggal kezdődnek, és olvasási hozzáférést adnak a
termékekhez és megrendelésekhez, valamint lehetővé teszik **árjavaslatok beküldését**.
Minden más (javaslatok jóváhagyása/elutasítása/visszavonása, automatikák, beállítások,
feedek, katalóguskezelés, …) azonnal hibát ad, HTTP-hívás nélkül.

Bolt-tokent a Haszno webalkalmazásban lehet igényelni: **API-kulcsok**:
- Hatókörök: `read` (GET) és/vagy `write` (javaslat beküldése)
- Lejárat: 90 nap; a megújítás emberi jóváhagyást igényel
- Emberi jóváhagyás kötelező: a bolt tulajdonosának el kell fogadnia minden token-kérelmet

A tokent az **ajánlott** környezeti változóval adja meg:

```bash
export HASZNO_API_TOKEN=haszno_xxxxxxxxxxxxxxxxxxxx
haszno proposals list
haszno proposals propose --product-id 42 --price 4990 --reason "piaci igazítás"
```

### 2. mód — Hagyományos API-kulcs (teljes hozzáférés)

Minden `haszno_` előtag nélküli credential `x-api-key` fejlécként kerül
továbbításra, pontosan a korábbi módnak megfelelően. Minden parancs elérhető.

### Bejelentkezés (konfig fájlba menti)

```bash
haszno login
```

Ez elmenti az API kulcsot és az URL-t a `~/.config/haszno/config.json` fájlba.  
**A fájl formátuma:**

```json
{
  "apiUrl": "https://haszno.com",
  "apiKey": "haszno_live_..."
}
```

> **Fontos:** Az MCP szerver (`haszno-mcp`) ugyanezt a fájlt olvassa.  
> Elegendő egyszer futtatni a `haszno login` parancsot — a CLI és az MCP szerver
> is azonnal konfigurálva lesz.

---

## Haszno Shop

A `haszno shop` parancscsoporttal hirdetéseket adhatsz fel, kereshetsz és foglalhatsz le a Haszno másodpiacon. A Shop teljesen ingyenes — a feladás és a foglalás sem kerül pénzbe, a fizetés és az átadás közvetlenül a vevő és az eladó között zajlik.

### Gyors kezdés

```bash
# 1. Bejelentkezés (token elmentése a ~/.config/haszno/config.json fájlba)
haszno login

# 2. Hirdetés feladása (AI kitölti a leírást a képek alapján)
haszno shop post --from-photos --image ./foto1.jpg --price 15000

# 3. Hirdetések keresése
haszno shop search kerékpár --county Budapest --max-price 50000

# 4. Hirdetés lefoglalása (ingyenes — a fizetés az eladóval zajlik)
haszno shop reserve 42 --message "Érdeklődöm, lehet-e személyesen megnézni?"

# 5. Foglalásaim megtekintése
haszno shop reservations
```

### Shop parancsok áttekintése

| Parancs | Leírás |
|---|---|
| `haszno login` | Bejelentkezés e-mail + jelszóval; token mentése |
| `haszno logout` | Mentett token törlése |
| `haszno whoami` | Aktuális felhasználó megjelenítése |
| `haszno shop categories` | Kategóriák és kötelező attribútumok böngészése |
| `haszno shop search [keresőszó]` | Hirdetések keresése (--category, --county, --min-price, …) |
| `haszno shop show <id>` | Hirdetés részletei |
| `haszno shop price-hint` | Ajánlott árhatárok egy kategóriához |
| `haszno shop post` | Új hirdetés feladása (--title, --price, --image, --from-photos, …) |
| `haszno shop my` | Saját hirdetések listája |
| `haszno shop edit <id>` | Hirdetés szerkesztése |
| `haszno shop pause <id>` | Hirdetés szüneteltetése |
| `haszno shop activate <id>` | Szüneteltetett hirdetés aktiválása |
| `haszno shop sold <id>` | Hirdetés eladottnak jelölése |
| `haszno shop renew <id>` | Hirdetés megújítása |
| `haszno shop delete <id>` | Hirdetés törlése |
| `haszno shop inquiries` | Beérkezett üzenetek a hirdetéseimre |
| `haszno shop inquire <adId>` | Üzenet küldése az eladónak |
| `haszno shop favorite <adId>` | Hirdetés kedvencekhez adása |
| `haszno shop unfavorite <adId>` | Hirdetés eltávolítása a kedvencekből |
| `haszno shop favorites` | Kedvenc hirdetések listája |
| `haszno shop reserve <adId>` | Hirdetés lefoglalása (ingyenes) |
| `haszno shop reservations` | Foglalásaim listája |
| `haszno shop reservation accept <id>` | Foglalás elfogadása (eladóként) |
| `haszno shop reservation decline <id>` | Foglalás elutasítása (eladóként) |
| `haszno shop reservation cancel <id>` | Foglalás lemondása (vevőként) |
| `haszno shop reservation complete <id>` | Foglalás teljesítése (eladóként) |
| `haszno shop reservation counter <id> --price <Ft>` | Ellenajánlat küldése (eladóként) |
| `haszno shop reservation accept-counter <id>` | Ellenajánlat elfogadása (vevőként) |
| `haszno shop reservation messages <id>` | Foglaláshoz tartozó üzenetek listája |
| `haszno shop reservation message <id> --text <szöveg>` | Üzenet küldése a foglaláshoz |
| `haszno shop reservation review <id> --rating <1-5>` | Értékelés leadása a foglaláshoz |
| `haszno shop inquiry reply <id> --message <szöveg>` | Válasz küldése egy érdeklődőnek |
| `haszno shop saved-search list` | Mentett keresések listázása |
| `haszno shop saved-search add --name <név>` | Keresési feltétel mentése (--query, --category, …) |
| `haszno shop saved-search remove <id>` | Mentett keresés törlése |
| `haszno shop watch <adId>` | Hirdetés figyelése (ár-/státuszváltozás) |
| `haszno shop unwatch <adId>` | Hirdetés figyelésének leállítása |
| `haszno shop import-url <url>` | Hirdetés adatainak importálása egy URL-ről (AI-segítség) |
| `haszno shop draft show` | Szerveren tárolt vázlat megjelenítése |
| `haszno shop draft save` | Vázlat mentése (JSON stdin-ről) |
| `haszno shop draft clear` | Vázlat törlése |
| `haszno shop post --remove-bg` | Hirdetés feladása háttéreltávolítással |
| `haszno shop post-bulk <forrás>` | Tömeges feladás CSV-ből vagy könyvtárból (--dry-run, --yes) |
| `haszno tokens list` | Aktív API-tokenek listázása (session-hitelesítés) |
| `haszno tokens revoke <id>` | API-token visszavonása (session-hitelesítés) |
| `haszno logout` | Mentett token visszavonása a szerveren és törlése helyben |

---

## Használat

```bash
# Súgó
haszno --help
haszno account --help

# Kapcsolat ellenőrzése
haszno account ping

# Termékek listázása (veszteségesek szűrve)
haszno products list --losing

# Javaslatok jóváhagyása
haszno proposals approve --ids 1,2,3 --yes

# Szabályok futtatása
haszno rules run 2 --yes

# JSON kimenet gépi feldolgozáshoz
haszno products list --json | jq '.[] | .name'
```

### Globális kapcsolók

| Kapcsoló | Leírás |
|---|---|
| `--json` | Gépi olvasható JSON kimenet |
| `--api-url <url>` | API URL felülírása (env: `HASZNO_API_URL`) |
| `--api-key <key>` | API kulcs felülírása (env: `HASZNO_API_KEY` vagy `HASZNO_API_TOKEN`) |

A `haszno account doctor --json` külön mutatja az API elérhetőségét (`api.status`), a hitelesítés eredményét és a token hatókörét (`auth`), valamint a hosztolt MCP kézfogását (`mcp.status`). MCP-próba csak ellenőrzött bolt-tokennel fut, és nem hív eszközt. A korábbi `apiOk` mező továbbra is az azonosítás sikerét jelzi.

`--json` esetén a parancshibák az stderr-re kerülnek `error` és `code` mezővel, HTTP-hibánál az elérhető `status`, `requestId` és `hint` mezőkkel. A kilépési kódok változatlanok.

### Parancsok áttekintése

| Parancs | Mód | Leírás |
|---|---|---|
| `haszno login` | mindkét | Bejelentkezés, konfig mentése |
| `haszno account ping` | mindkét | API kapcsolat ellenőrzése |
| `haszno account stats` | hagyományos | Irányítópult összefoglaló |
| `haszno account impact` | hagyományos | Haszon-mérő |
| `haszno products list` | mindkét | Termékek listázása |
| `haszno products apply-prices --yes` | hagyományos | Ajánlott árak alkalmazása |
| `haszno proposals list` | mindkét | Árazási javaslatok |
| `haszno proposals propose ...` | bolt-token | Új árjavaslat beküldése |
| `haszno proposals approve --yes` | hagyományos | Összes függő javaslat jóváhagyása |
| `haszno proposals reject ...` | hagyományos | Javaslatok elutasítása |
| `haszno proposals rollback ...` | hagyományos | Köteg visszavonása |
| `haszno rules list` | hagyományos | Automatizálási szabályok |
| `haszno rules run <id> --yes` | hagyományos | Szabály manuális futtatása |
| `haszno feeds import-supplier ...` | hagyományos | Szállítói feed import |
| `haszno ideas list` | hagyományos | AI termékötletek |
| `haszno orders list` | mindkét | Rendelések |
| `haszno booking status` | bolt-token | Foglalási ellenőrzőlista + következő lépés |
| `haszno booking export` | bolt-token | Teljes foglalási konfiguráció JSON-ban |
| `haszno booking apply <fájl\|->` | bolt-token | Konfig alkalmazása (alapért. dry-run; `--yes` a mentéshez) |
| `haszno booking theme set ...` | bolt-token (write) | Foglalási oldal megjelenésének testreszabása |
| `haszno booking service list` | bolt-token | Szolgáltatások listája |
| `haszno booking service add ...` | bolt-token (write) | Új szolgáltatás |
| `haszno booking service update <id>` | bolt-token (write) | Szolgáltatás módosítása |
| `haszno booking service remove <id>` | bolt-token (write) | Szolgáltatás törlése |
| `haszno booking resource list` | bolt-token | Erőforrások listája |
| `haszno booking resource add ...` | bolt-token (write) | Új erőforrás |
| `haszno booking resource update <id>` | bolt-token (write) | Erőforrás módosítása |
| `haszno booking resource remove <id>` | bolt-token (write) | Erőforrás törlése |
| `haszno booking hours set <fájl\|->` | bolt-token (write) | Nyitvatartás beállítása JSON-ból |
| `haszno booking closure add ...` | bolt-token (write) | Zárás / kivétel nap hozzáadása |
| `haszno booking closure remove <id>` | bolt-token (write) | Zárás törlése |
| `haszno booking publish --yes` | bolt-token (write) | Foglalási oldal közzététele |
| `haszno booking unpublish --yes` | bolt-token (write) | Foglalási oldal visszavonása |
| `haszno booking appointments --from --to` | bolt-token | Időpontok listája dátumtartományra |

---

## Konfiguráció

### Prioritási sorrend (magasabbtól alacsonyabbig)

1. `--api-url` / `--api-key` parancssori jelzők
2. `HASZNO_API_TOKEN` környezeti változó (bolt-tokenek ajánlott helye)
3. `HASZNO_API_URL` / `HASZNO_API_KEY` környezeti változók
4. `ARFUTAR_API_URL` / `ARFUTAR_API_KEY` (visszafelé kompatibilis fallback)
5. `~/.config/haszno/config.json` konfigurációs fájl (írja a `haszno login`)
6. `~/.config/arfutar/config.json` (visszafelé kompatibilis fallback)

A konfigurációs fájlt a CLI csak akkor olvassa be, ha sem jelző, sem környezeti változó nem ad hitelesítési adatot — ugyanez a szabály érvényes az MCP-szerverre is. A mentett hitelesítési adatokat a CLI csak arra az URL-re küldi el, amelyhez mentetted őket: ha a `--api-url` vagy a `HASZNO_API_URL` másik szerverre mutat, ahhoz külön add meg a kulcsot.

### Konfigurációs fájl formátuma

```json
{
  "apiUrl": "https://haszno.com",
  "apiKey": "haszno_live_..."
}
```

A fájl `chmod 600` jogosultsággal íródik — csak a te felhasználód olvashatja.

---

## Étteremoldal

A `haszno restaurant site --json` a Haszno MCP-n keresztül olvassa ki a bejelentkezett bolt saját éttermét, a közzététel állapotát, a rendelési és admincímet, valamint az étlapot. Bolt-token kell hozzá, adatot nem módosít. A rendelési cím közzétételig `null`. Munchi-integráció nélkül a listázás címe is `null`; a megadott cím önmagában nem jelenti, hogy a listázás már él.

## Webshop-szerkesztő — oldalak, widgetek, márka

A `haszno webshop …` a hosztolt webshop oldalszerkesztőjét vezérli terminálból vagy szkriptből. Minden parancs a
hosztolt Haszno MCP szerver megfelelő eszközét hívja, így a CLI és az MCP-kliens ugyanúgy viselkedik. Az író
parancsokhoz írási jogú bolt-kulcs (`haszno_…`) kell.

```bash
haszno webshop list                              # a fiók webshopjai
haszno webshop pages                             # a vázlat oldalai + draftVersion
haszno webshop inspect rolunk                    # egy oldal a widgetjeivel (argumentum nélkül a teljes vázlat)
haszno webshop widgets                           # widgetkatalógus; egy widget: `haszno webshop widget hero`
haszno webshop batch --ops @ops.json --base-version 7      # oldalműveletek egy mentésben
haszno webshop brand --primary '#0f766e' --font Inter --base-version 8
haszno webshop validate
haszno webshop preview --page rolunk
haszno webshop undo
haszno webshop publish --yes                     # élesíti a vázlatot — csak ha a tulajdonos kérte
haszno webshop guide                             # az oldalépítő útmutató
haszno webshop tool haszno_webshop_get_theme     # bármelyik haszno_webshop_* eszköz nyersen (--args '<json>')
```

Több webshop esetén add meg a `--slug <slug>` kapcsolót; `--json` egysoros JSON kimenetet ad.

**Több ügynök egy bolton.** Minden íráshoz add meg a `--base-version` értéket (a legutóbb olvasott `draftVersion`,
vagy az előző írásod `version` értéke). A `batch` csak azokat az oldalakat hasonlítja össze, amelyeket a műveletei
írnak, így a saját oldalukon dolgozó ügynökök nem ütköznek; ha elutasít, a saját oldalad változott — olvasd be
újra, és küldd újra. A `brand` és a többi teljes dokumentumot író parancs bármilyen újabb mentésre elutasít: ezeket
az oldalankénti munka előtt vagy után futtasd.

## Vászon — a saját Claude Code-od a chatpanelen

A Vászon oldal (haszno.com/app/vaszon) chatpanelje a gépeden futó Claude Code-ot is tudja
vezérelni, a **saját Claude-bejelentkezéseddel** — API-kulcs nélkül. Ehhez a CLI egy helyi hidat
indít, amely az [ACP-adapteren](https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp)
keresztül beszél a Claude Code-dal, és odaadja neki a Haszno MCP-szerverét.

```bash
npm install -g @agentclientprotocol/claude-agent-acp   # egyszer: az adapter
haszno login                                            # egyszer: bolt-token
haszno vaszon --open                                    # híd indítása + párosító link megnyitása
```

A panel állapotai: **indul**, **kész**, **bejelentkezés kell** (`claude-agent-acp --cli auth login --claudeai`),
**nincs telepítve** (a telepítőparanccsal).

Biztonság:

- A híd csak a `127.0.0.1`-en figyel; minden kéréshez kell a párosító token (a linkben), és csak a
  Haszno weboldaláról fogad kérést.
- A Claude Code munkamenete **beépített eszközök nélkül** indul (nincs shell, nincs fájlhozzáférés),
  a saját Claude Code-beállításaid és MCP-szervereid nélkül: csak a Haszno eszközeit éri el.
- A módosító hívásokhoz a panel jóváhagyást kér; az olvasó hívások maguktól futnak.
- Kulcsot nem kezel: a Claude Code a saját bejelentkezésével fut, a bolt-token a gépeden marad.

| Kapcsoló | Leírás |
|---|---|
| `--port <port>` | helyi port (alapértelmezés: 47600) |
| `--open` | a párosító link megnyitása a böngészőben |
| `--allow-origin <origin...>` | további engedélyezett webes eredet (fejlesztéshez) |

## Kapcsolódó repók

Ez a három repó együtt alkotja a Haszno agent SDK-t:

| Repó | Csomag | Leírás |
|---|---|---|
| [haszno-labs/haszno-cli](https://github.com/haszno-labs/haszno-cli) | `@haszno/cli` (bin: `haszno`) | **Ez a repó** — parancssori felület |
| [haszno-labs/haszno-mcp](https://github.com/haszno-labs/haszno-mcp) | `@haszno/mcp` (bin: `haszno-mcp`) | MCP szerver Claude Code-hoz |
| [haszno-labs/haszno-skill](https://github.com/haszno-labs/haszno-skill) | — | Claude agent skill (SKILL.md) |

### Hogyan működnek együtt

- A **skill** (`haszno-skill`) megmondja Claude-nak, mikor és hogyan használja a
  Haszno eszközöket. Ha az MCP szerver elérhető, az MCP eszközöket hívja; ha nincs,
  a CLI-t futtatja fallbackként.
- A **CLI** és az **MCP szerver** ugyanazt az API kulcsot és konfigurációs fájlt
  (`~/.config/haszno/config.json`) használják — egyszeri `haszno login` mindkettőt
  konfigurálja.
- A **CLI** telepítve van globálisan (`npm i -g github:haszno-labs/haszno-cli`), az **MCP szerver**
  `npx`-en keresztül fut (`claude mcp add haszno -- npx -y github:haszno-labs/haszno-mcp`).

---

## Fejlesztés

```bash
npm install
npm run build
npm test
npm run typecheck
```

Fejlesztői dokumentáció: [https://docs.haszno.com](https://docs.haszno.com)

---

## Licenc

MIT — lásd a [LICENSE](./LICENSE) fájlt.
