# lsemb-mcp — remote monitoring & control MCP server

An MCP (Model Context Protocol) server that lets you **remotely watch and steer
the LSEMB scrape (web-crawl) and embed pipelines** from any MCP client (Claude
Code, etc.). It speaks **Streamable HTTP** so it can run on the VPS next to the
data and be reached over Tailscale, guarded by an `X-API-Key`.

It is **self-contained**: it owns its own Postgres / Redis / Celery clients and
does **not** import the main `python-services` package, so it can live in its own
lightweight virtualenv without disturbing the pinned service deps.

## How it gets the data

| Concern | Source |
|---|---|
| Job-state counts (media_assets, unified_embeddings, import_jobs, scraped_pages) | **Postgres** (direct, read-only) |
| Live embed progress, crawl batch status | **Redis** (same app DB the stack uses) |
| Worker queue (active/reserved/scheduled) | **Celery** `inspect` |
| Control: reingest media, batch crawl | proxy → **Python** service `:8004` |
| Control: pause/stop/resume embed | proxy → **Node** backend `:8083` |

Control tools proxy to the *existing* endpoints on purpose — they reuse the
already-correct side effects (DB rows, background tasks, Redis flags) instead of
re-implementing them.

## Tools

**Read (safe):** `health`, `scrape_overview`, `get_crawl_job`, `embed_overview`,
`embed_table_stats`, `legislation_overview`, `legislation_search`, `media_overview`,
`get_media_asset`, `celery_tasks`, `recent_errors`.

`legislation_overview` / `legislation_search` give MCP visibility into the UAE
legislation RAG corpus (chunk/law counts by language, Arabic-BM25 readiness, and a
read-only BM25 keyword search that routes Arabic queries to `search_vector_ar`).

**Control (mutating):** `reingest_media`, `trigger_batch_crawl`,
`pause_embedding`, `resume_embedding`, `stop_embedding`, `revoke_celery_task`.

## Install (own venv)

```bash
cd backend/python-services
python3 -m venv .venv-mcp
.venv-mcp/bin/pip install -r mcp_server/requirements.mcp.txt   # Windows: .venv-mcp\Scripts\pip
```

Config is read from the repo-root `.env.lsemb` (same file the rest of the stack
uses): `DATABASE_URL`, `REDIS_*`, `CELERY_BROKER_URL`, `INTERNAL_API_KEY`,
`PYTHON_SERVICE_URL`. MCP-specific overrides:

| Var | Default | Meaning |
|---|---|---|
| `MCP_HOST` | `0.0.0.0` | bind address (use Tailscale IP or `127.0.0.1` to lock down) |
| `MCP_PORT` | `8765` | listen port |
| `MCP_PATH` | `/mcp` | streamable-HTTP path |
| `MCP_API_KEY` | = `INTERNAL_API_KEY` | env key clients may send as `X-API-Key` |
| `MCP_SETTINGS_KEY` | `security.mcpBearerKey` | settings-table key also accepted (DB-driven) |
| `MCP_AUTH_ENABLED` | `true` | set `false` only for trusted local use |
| `MCP_BACKEND_URL` | `http://localhost:8083` | Node backend (embed control) |

**Two accepted credentials.** The `X-API-Key` gate accepts **either** the env
`MCP_API_KEY` (defaults to `INTERNAL_API_KEY`) **or** the DB-driven value in
`settings[security.mcpBearerKey]` — set/rotate it from the dashboard **Settings →
Security → MCP Bearer Key** (it's masked like other secrets). The settings value
is cached ~30s, so rotation takes effect without a restart. Blank settings value
= the env key remains the working credential.

## Run

```bash
cd backend/python-services
.venv-mcp/bin/python run_mcp.py        # or: python -m mcp_server
```

Under PM2 (recommended on the VPS):

```bash
pm2 start backend/python-services/mcp_server/ecosystem.mcp.config.js
pm2 save
```

Health probe (no key required): `GET http://<host>:8765/healthz`.

## Connect from Claude Code

The server runs on the VPS; reach it over Tailscale (replace the host with the
VPS Tailscale IP/name) and pass the key as a header:

```bash
claude mcp add lsemb-monitor \
  --transport http \
  --header "X-API-Key: $INTERNAL_API_KEY" \
  http://<vps-tailscale-ip>:8765/mcp
```

Then in Claude Code:

```
> use lsemb-monitor to show embed_overview and recent_errors
```

Verify the connection with `claude mcp list` (or `/mcp` inside a session).

## Security notes

- The `X-API-Key` gate is the only auth — keep `MCP_AUTH_ENABLED=true` and bind to
  the Tailscale interface (or front it with nginx + TLS) rather than exposing
  `0.0.0.0` on a public interface.
- Read tools are side-effect free; control tools change live pipeline state.
