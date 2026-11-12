# haszno-cli

**English** | [Magyar](README.hu.md)

**Haszno** command-line interface — manage your dropshipping data from the terminal.

> A single `haszno login` configures both the CLI **and** the MCP server.  
> Website: [haszno.com](https://haszno.com)

---

## Installation

### Recommended: shared installer (CLI + MCP + skill in one step)

```bash
# Install all three haszno-labs packages at once with the shared installer:
npx haszno-install
```

### Manual installation

```bash
npm install -g github:haszno-labs/haszno-cli
```

## Authentication

```bash
haszno login
```

This saves your API key and URL to `~/.config/haszno/config.json`.  
**Config file format:**

```json
{
  "apiUrl": "https://haszno.com",
  "apiKey": "haszno_live_..."
}
```

> **Note:** The MCP server (`haszno-mcp`) reads the same file.  
> Running `haszno login` once configures both the CLI and the MCP server.

---

## Usage

```bash
# Help
haszno --help
haszno account --help

# Check connection
haszno account ping

# List products (filter losing ones)
haszno products list --losing

# Approve proposals
haszno proposals approve --ids 1,2,3 --yes

# Run a rule
haszno rules run 2 --yes

# JSON output for scripting
haszno products list --json | jq '.[] | .name'

# Daily market report (latest)
haszno report

# Daily report for a specific day
haszno report --day 2026-11-10

# Research brief — fókusz-termékek és kutatási kérdések AI ügynöknek
haszno research brief

# Post research findings from a JSON file
haszno research post findings.json

# Post findings from stdin (pipe from an agent)
cat findings.json | haszno research post -

# List agent actions (default: all, limit 50)
haszno actions list
haszno actions list --status javasolt

# Propose a new action (approval happens in the web UI)
haszno actions propose --type ar --product-id 42 --price 180000 --reason "Piaci áremelkedés"
haszno actions propose --type felvetel --product-id 55 --reason "Trending termék"
haszno actions propose --type import --network-product-id 99 --reason "Jó margin"
```

### Global flags

| Flag | Description |
|---|---|
| `--json` | Machine-readable JSON output |
| `--api-url <url>` | Override API URL (env: `HASZNO_API_URL`) |
| `--api-key <key>` | Override API key (env: `HASZNO_API_KEY`) |

### Commands overview

| Command | Description |
|---|---|
| `haszno login` | Authenticate and save config |
| `haszno account ping` | Check API connection |
| `haszno account stats` | Dashboard summary |
| `haszno account impact` | Profit impact meter |
| `haszno products list` | List products |
| `haszno products apply-prices --yes` | Apply recommended prices |
| `haszno proposals list` | List pricing proposals |
| `haszno proposals approve --yes` | Approve all pending proposals |
| `haszno rules list` | List automation rules |
| `haszno rules run <id> --yes` | Run a rule manually |
| `haszno feeds import-supplier ...` | Import supplier feed |
| `haszno ideas list` | AI product ideas |
| `haszno orders list` | List orders |

#### Haszno Manager — napi jelentés és agent-műveletek

| Command | Description |
|---|---|
| `haszno report [--day YYYY-MM-DD]` | Print the daily market report (latest by default) |
| `haszno research brief` | Fetch the research brief for today (focus products + questions for the agent) |
| `haszno research post <file\|->` | Post `FindingsInput` JSON from a file or stdin; `--day YYYY-MM-DD` to target a specific day |
| `haszno actions list [--status <s>] [--limit <n>]` | List agent actions (newest first) |
| `haszno actions propose --type <type> … --reason <text>` | Propose a new agent action; approval happens in the web UI at `/app` |

**`haszno actions propose` flags:**

| Flag | Required for | Description |
|---|---|---|
| `--type <type>` | always | `felvetel` / `levetel` / `ar` / `import` |
| `--product-id <id>` | felvetel, levetel, ar | Product ID |
| `--network-product-id <id>` | import | Network product ID |
| `--price <gross>` | ar | New gross price in HUF |
| `--reason <text>` | always | Justification (5–500 characters) |
| `--report-item <id>` | — | Optional: link to a report item |

> **Note:** Approving and undoing actions is intentionally NOT available in the CLI.
> These are human-only operations and must be done in the web UI at `/app`.

---

## Configuration

### Priority order (highest to lowest)

1. `--api-url` / `--api-key` command-line flags
2. `HASZNO_API_URL` / `HASZNO_API_KEY` environment variables
3. `~/.config/haszno/config.json` (written by `haszno login`)
4. `ARFUTAR_API_URL` / `ARFUTAR_API_KEY` (backward-compatible fallback)
5. `~/.config/arfutar/config.json` (backward-compatible fallback)

### Config file format

```json
{
  "apiUrl": "https://haszno.com",
  "apiKey": "haszno_live_..."
}
```

The file is written with `chmod 600` — readable only by your user.

---

## Related repositories

These three repositories together form the Haszno agent SDK:

| Repo | Package | Description |
|---|---|---|
| [haszno-labs/haszno-cli](https://github.com/haszno-labs/haszno-cli) | `@haszno/cli` (bin: `haszno`) | **This repo** — command-line interface |
| [haszno-labs/haszno-mcp](https://github.com/haszno-labs/haszno-mcp) | `@haszno/mcp` (bin: `haszno-mcp`) | MCP server for Claude Code |
| [haszno-labs/haszno-skill](https://github.com/haszno-labs/haszno-skill) | — | Claude agent skill (SKILL.md) |

### How they work together

- The **skill** (`haszno-skill`) tells Claude when and how to use Haszno tools.
  When the MCP server is available it calls MCP tools; otherwise it falls back to
  the CLI.
- The **CLI** and the **MCP server** share the same API key and config file
  (`~/.config/haszno/config.json`) — one `haszno login` configures both.
- The **CLI** is installed globally (`npm i -g github:haszno-labs/haszno-cli`);
  the **MCP server** runs via `npx`
  (`claude mcp add haszno -- npx -y github:haszno-labs/haszno-mcp`).

---

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

Developer docs: [https://docs.haszno.com/en/](https://docs.haszno.com/en/)

---

## License

MIT — see the [LICENSE](./LICENSE) file.
