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
