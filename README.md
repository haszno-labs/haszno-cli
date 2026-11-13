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

## Haszno Shop

The `haszno shop` command group lets you post, search and reserve secondhand ads in the Haszno marketplace. The Shop is completely free — posting and reserving cost nothing, and payment happens directly between buyer and seller.

### Quick start

```bash
# 1. Log in (saves token to ~/.config/haszno/config.json)
haszno login

# 2. Post an ad (AI fills title/description from photos)
haszno shop post --from-photos --image ./photo1.jpg --price 15000

# 3. Search for ads
haszno shop search kerékpár --county Budapest --max-price 50000

# 4. Reserve an ad (free — payment handled directly with the seller)
haszno shop reserve 42 --message "Érdeklődöm, lehet-e személyesen megnézni?"

# 5. Check your reservations
haszno shop reservations
```

### Shop commands overview

| Command | Description |
|---|---|
| `haszno login` | Log in with e-mail + password; saves token |
| `haszno logout` | Remove saved token |
| `haszno whoami` | Show current user info |
| `haszno shop categories` | Browse ad categories and required attributes |
| `haszno shop search [query]` | Search ads (--category, --county, --min-price, …) |
| `haszno shop show <id>` | Show ad details |
| `haszno shop price-hint` | Suggested price range for a category |
| `haszno shop post` | Post a new ad (--title, --price, --image, --from-photos, …) |
| `haszno shop my` | List your own ads |
| `haszno shop edit <id>` | Edit an ad |
| `haszno shop pause <id>` | Pause an ad |
| `haszno shop activate <id>` | Re-activate a paused ad |
| `haszno shop sold <id>` | Mark an ad as sold |
| `haszno shop renew <id>` | Renew an expiring ad |
| `haszno shop delete <id>` | Delete an ad |
| `haszno shop inquiries` | List messages received on your ads |
| `haszno shop inquire <adId>` | Send a message to the seller |
| `haszno shop favorite <adId>` | Save ad to favorites |
| `haszno shop unfavorite <adId>` | Remove from favorites |
| `haszno shop favorites` | List your favorite ads |
| `haszno shop reserve <adId>` | Reserve an ad (free) |
| `haszno shop reservations` | List your reservations |
| `haszno shop reservation accept <id>` | Accept a reservation (as seller) |
| `haszno shop reservation decline <id>` | Decline a reservation (as seller) |
| `haszno shop reservation cancel <id>` | Cancel a reservation (as buyer) |
| `haszno shop reservation complete <id>` | Mark a reservation as complete (as seller) |
| `haszno shop reservation counter <id> --price <Ft>` | Send a counter-offer (as seller) |
| `haszno shop reservation accept-counter <id>` | Accept seller's counter-offer (as buyer) |
| `haszno shop reservation messages <id>` | List messages on a reservation |
| `haszno shop reservation message <id> --text <text>` | Send a message on a reservation |
| `haszno shop reservation review <id> --rating <1-5>` | Leave a review for a completed reservation |
| `haszno shop inquiry reply <id> --message <text>` | Reply to an inquiry (as seller) |
| `haszno shop saved-search list` | List saved searches |
| `haszno shop saved-search add --name <name>` | Save a search (--query, --category, …) |
| `haszno shop saved-search remove <id>` | Delete a saved search |
| `haszno shop watch <adId>` | Subscribe to price-drop alerts for an ad |
| `haszno shop unwatch <adId>` | Unsubscribe from price-drop alerts |
| `haszno shop import-url <url>` | Import ad data from a URL (AI-assisted) |
| `haszno shop draft show` | Show server-side ad draft |
| `haszno shop draft save` | Save draft (JSON from stdin) |
| `haszno shop draft clear` | Delete draft |
| `haszno shop post --remove-bg` | Post ad with AI background removal on images |
| `haszno shop post-bulk <source>` | Bulk post from CSV or photo directory (--dry-run, --yes) |
| `haszno tokens list` | List active API tokens (session auth required) |
| `haszno tokens revoke <id>` | Revoke an API token (session auth required) |
| `haszno logout` | Revoke token server-side and remove from local config |

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
