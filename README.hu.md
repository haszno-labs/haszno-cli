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

## Bejelentkezés

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
| `--api-key <token>` | Bearer token felülírása (env: `HASZNO_API_TOKEN`) |

### Parancsok áttekintése

| Parancs | Leírás | Bolt token |
|---|---|---|
| `haszno products list` | Termékek listázása marginnal | ✅ |
| `haszno products show <id>` | Termék részletei | ✅ |
| `haszno products apply-prices --yes` | Ajánlott árak alkalmazása | ❌ session |
| `haszno proposals list` | **Függő** javaslatok listája | ✅ |
| `haszno proposals create --product-id N --price N --reason "..." --yes` | Új pending javaslat | ✅ |
| `haszno proposals approve --yes` | Javaslatok jóváhagyása | ❌ session |
| `haszno proposals reject --ids N --yes` | Javaslatok elutasítása | ❌ session |
| `haszno proposals rollback --batch B --yes` | Köteg visszavonása | ❌ session |
| `haszno orders list` | Utolsó 20 rendelés | ✅ |
| `haszno orders show <id>` | Rendelés tételekkel | ✅ |
| `haszno orders ship <id> --yes` | Szállítottnak jelöl | ❌ session |
| `haszno rules list` | Automatizálási szabályok | ✅ |
| `haszno rules run <id> --yes` | Szabály manuális futtatása | ❌ session |
| `haszno feeds import-supplier ...` | Szállítói feed import | ❌ session |
| `haszno ideas list` | AI termékötletek | ✅ |

> **Bolt token** = per-bolt Bearer token (Haszno → Integráció → API-kulcsok).
> Session-only műveletek `HASZNO_BASIC` (HTTP Basic) autentikációt igényelnek.

---

## Konfiguráció

### Prioritási sorrend (magasabbtól alacsonyabbig)

1. `--api-key <token>` parancssori jelző → `Authorization: Bearer <token>`-ként küldődik
2. `HASZNO_API_TOKEN` — per-bolt Bearer token (**elsődleges**; létrehozás: Haszno → Integráció → API-kulcsok)
3. `HASZNO_API_KEY` — `HASZNO_API_TOKEN` örökös aliasza (csendes migráció; azonos kezelés)
4. `HASZNO_BASIC` — HTTP Basic auth (csak session-alapú végpontokhoz)
5. `~/.config/haszno/config.json` konfigurációs fájl (írja a `haszno login`)
6. `ARFUTAR_API_KEY` / `ARFUTAR_API_URL` (visszafelé kompatibilis fallback)
7. `~/.config/arfutar/config.json` (visszafelé kompatibilis fallback)

### API-kulcs létrehozása

1. Lépj be a [haszno.com](https://haszno.com) → **Integráció → API-kulcsok** oldalra
2. Kattints az **Új API-kulcs** gombra, adj nevet, válaszd az **agent** hatáskört
3. Másold ki a `haszno_…` tokent — csak egyszer látható
4. `export HASZNO_API_TOKEN=haszno_…`

> **A jóváhagyás szándékosan emberi feladat.** A bolt token olvashatja a termékeket,
> rendeléseket és javaslatokat, és létrehozhat pending javaslatot. A jóváhagyás /
> elutasítás / visszagörgetés csak webes felületen érhető el.

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
