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

## Authentication — two modes

The CLI selects its mode automatically based on the credential you provide.

### Mode 1 — Shop token (agent access, `haszno_` prefix)

Shop tokens start with `haszno_` and grant read access to products and orders plus
the ability to **submit price proposals**. Everything else (approve/reject/rollback
proposals, automation rules, settings, feeds, catalog management, …) is blocked and
returns an error immediately with no HTTP call.

Shop tokens are issued in the Haszno web app → **API-kulcsok**:
- Scopes: `read` (GET) and/or `write` (submit proposals)
- Expiry: 90 days; renewal requires human approval
- Human-only approval: the shop owner must accept each token request in the web app

Set the token with the **preferred** env var:

```bash
export HASZNO_API_TOKEN=haszno_xxxxxxxxxxxxxxxxxxxx
haszno proposals list        # reads /api/agent/proposals
haszno proposals propose --product-id 42 --price 4990 --reason "piaci igazítás"
```

### Mode 2 — Legacy API key (full access)

Any credential that does **not** start with `haszno_` is forwarded via `x-api-key`
exactly as before. All commands and operations are available.

### Login (saves to config file)

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
| `--api-key <key>` | Override API key (env: `HASZNO_API_KEY` or `HASZNO_API_TOKEN`) |

### Commands overview

| Command | Mode | Description |
|---|---|---|
| `haszno login` | both | Authenticate and save config |
| `haszno account ping` | both | Check API connection |
| `haszno account stats` | legacy | Dashboard summary |
| `haszno account impact` | legacy | Profit impact meter |
| `haszno products list` | both | List products |
| `haszno products apply-prices --yes` | legacy | Apply recommended prices |
| `haszno proposals list` | both | List pricing proposals |
| `haszno proposals propose ...` | shop token | Submit a new price proposal |
| `haszno proposals approve --yes` | legacy | Approve all pending proposals |
| `haszno proposals reject ...` | legacy | Reject proposals |
| `haszno proposals rollback ...` | legacy | Roll back a proposal batch |
| `haszno rules list` | legacy | List automation rules |
| `haszno rules run <id> --yes` | legacy | Run a rule manually |
| `haszno feeds import-supplier ...` | legacy | Import supplier feed |
| `haszno ideas list` | legacy | AI product ideas |
| `haszno orders list` | both | List orders |

---

## Configuration

### Priority order (highest to lowest)

1. `--api-url` / `--api-key` command-line flags
2. `HASZNO_API_TOKEN` environment variable (preferred for shop tokens)
3. `HASZNO_API_URL` / `HASZNO_API_KEY` environment variables
4. `ARFUTAR_API_URL` / `ARFUTAR_API_KEY` (backward-compatible fallback)
5. `~/.config/haszno/config.json` (written by `haszno login`)
6. `~/.config/arfutar/config.json` (backward-compatible fallback)

The config file is only consulted when no credentials come from a flag or the environment — the same rule the MCP server follows. Saved credentials are sent only to the URL they were saved for: if `--api-url` or `HASZNO_API_URL` points to a different server, pass the key for that server explicitly.

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
