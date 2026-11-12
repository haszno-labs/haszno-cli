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
```

### Global flags

| Flag | Description |
|---|---|
| `--json` | Machine-readable JSON output |
| `--api-url <url>` | Override API URL (env: `HASZNO_API_URL`) |
| `--api-key <token>` | Override Bearer token (env: `HASZNO_API_TOKEN`) |

### Commands overview

| Command | Description | Shop token |
|---|---|---|
| `haszno products list` | List products with margin | ✅ |
| `haszno products show <id>` | Product detail | ✅ |
| `haszno products apply-prices --yes` | Apply recommended prices | ❌ session only |
| `haszno proposals list` | List **pending** proposals | ✅ |
| `haszno proposals create --product-id N --price N --reason "..." --yes` | Create a pending proposal | ✅ |
| `haszno proposals approve --yes` | Approve proposals | ❌ session only |
| `haszno proposals reject --ids N --yes` | Reject proposals | ❌ session only |
| `haszno proposals rollback --batch B --yes` | Roll back a batch | ❌ session only |
| `haszno orders list` | Last 20 orders | ✅ |
| `haszno orders show <id>` | Order with line items | ✅ |
| `haszno orders ship <id> --yes` | Mark as shipped | ❌ session only |
| `haszno rules list` | List automation rules | ✅ |
| `haszno rules run <id> --yes` | Run a rule manually | ❌ session only |
| `haszno feeds import-supplier ...` | Import supplier feed | ❌ session only |
| `haszno ideas list` | AI product ideas | ✅ |

> **Shop token** = works with a per-shop Bearer token from Haszno → Integráció → API-kulcsok.
> Session-only operations require logging in via the web and using `HASZNO_BASIC` (HTTP Basic).

---

## Configuration

### Priority order (highest to lowest)

1. `--api-key <token>` command-line flag → sent as `Authorization: Bearer <token>`
2. `HASZNO_API_TOKEN` environment variable — per-shop Bearer token (**canonical**; create at Haszno → Integráció → API-kulcsok)
3. `HASZNO_API_KEY` — legacy alias for `HASZNO_API_TOKEN` (silent migration; treated identically)
4. `HASZNO_BASIC` — HTTP Basic auth (session-based endpoints only)
5. `~/.config/haszno/config.json` (written by `haszno login`)
6. `ARFUTAR_API_KEY` / `ARFUTAR_API_URL` (backward-compatible fallback)
7. `~/.config/arfutar/config.json` (backward-compatible fallback)

### Creating a shop token

1. Log in to [haszno.com](https://haszno.com) → **Integráció → API-kulcsok**
2. Click **Új API-kulcs**, give it a name, select the **agent** scope
3. Copy the `haszno_…` token — shown only once
4. `export HASZNO_API_TOKEN=haszno_…`

> **Approval is human-only by design.** Shop tokens can read products/orders/proposals
> and create pending proposals. Approve / reject / rollback require a session token
> and are only available through the Haszno web dashboard.

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
