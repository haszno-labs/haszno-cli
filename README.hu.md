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
| `--api-key <key>` | API kulcs felülírása (env: `HASZNO_API_KEY`) |

### Parancsok áttekintése

| Parancs | Leírás |
|---|---|
| `haszno login` | Bejelentkezés, konfig mentése |
| `haszno account ping` | API kapcsolat ellenőrzése |
| `haszno account stats` | Irányítópult összefoglaló |
| `haszno account impact` | Haszon-mérő |
| `haszno products list` | Termékek listázása |
| `haszno products apply-prices --yes` | Ajánlott árak alkalmazása |
| `haszno proposals list` | Árazási javaslatok |
| `haszno proposals approve --yes` | Összes függő javaslat jóváhagyása |
| `haszno rules list` | Automatizálási szabályok |
| `haszno rules run <id> --yes` | Szabály manuális futtatása |
| `haszno feeds import-supplier ...` | Szállítói feed import |
| `haszno ideas list` | AI termékötletek |
| `haszno orders list` | Rendelések |

---

## Konfiguráció

### Prioritási sorrend (magasabbtól alacsonyabbig)

1. `--api-url` / `--api-key` parancssori jelzők
2. `HASZNO_API_URL` / `HASZNO_API_KEY` környezeti változók
3. `ARFUTAR_API_URL` / `ARFUTAR_API_KEY` (visszafelé kompatibilis fallback)
4. `~/.config/haszno/config.json` konfigurációs fájl (írja a `haszno login`)
5. `~/.config/arfutar/config.json` (visszafelé kompatibilis fallback)

A konfigurációs fájlt a CLI csak akkor olvassa be, ha sem jelző, sem környezeti változó nem ad hitelesítési adatot — ugyanez a szabály érvényes az MCP-szerverre is.

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
