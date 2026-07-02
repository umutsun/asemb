"""
LSEMB MCP server — remote monitoring & control of scrape / embed operations.

Transport: Streamable HTTP (reachable over Tailscale), guarded by an X-API-Key
ASGI gate. Read tools pull straight from Postgres / Redis / Celery; control tools
proxy to the existing Python (:8004) and Node (:8083) endpoints so they reuse the
already-correct side effects instead of re-implementing flag semantics.

Run:  python -m mcp_server      (from backend/python-services)
"""

import json
import logging
import time
from typing import Optional

from mcp.server.fastmcp import FastMCP

from . import config, infra

log = logging.getLogger("server")

mcp = FastMCP(
    "lsemb-monitor",
    host=config.MCP_HOST,
    port=config.MCP_PORT,
    streamable_http_path=config.MCP_PATH,
    instructions=(
        "Monitor and control the LSEMB semantic-bridge scrape (web crawl) and "
        "embed pipelines. Read tools (health, *_overview, *_stats, get_*, "
        "recent_errors, celery_tasks) are safe and side-effect free. Control "
        "tools (reingest_media, trigger_batch_crawl, pause/stop/resume_embedding, "
        "revoke_celery_task) change live state — confirm intent before calling."
    ),
)


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
async def _safe_fetch(query: str, *args) -> list[dict]:
    try:
        return await infra.fetch(query, *args)
    except Exception as e:
        log.warning("query failed: %s", e)
        return []


async def _safe_val(query: str, *args):
    try:
        return await infra.fetchval(query, *args)
    except Exception as e:
        log.debug("scalar query failed: %s", e)
        return None


async def _setting(key: str):
    try:
        if not await infra.table_exists("settings"):
            return None
        return await infra.fetchval("SELECT value FROM settings WHERE key = $1 LIMIT 1", key)
    except Exception:
        return None


# =========================================================================== #
# MONITORING (read-only)
# =========================================================================== #
@mcp.tool()
async def health() -> dict:
    """Overall health of the monitored stack: Postgres, Redis, Celery workers,
    the multimodal media feature flag, and the embedding worker heartbeat."""
    out: dict = {"service": "lsemb-mcp"}

    out["postgres"] = {"ok": (await _safe_val("SELECT 1")) == 1}

    r = await infra.get_redis()
    out["redis"] = {"ok": r is not None, "db": config.REDIS_DB}

    ping = await infra.celery_inspect("ping")
    out["celery"] = {
        "ok": bool(ping),
        "workers": sorted(ping.keys()) if ping else [],
        "worker_count": len(ping) if ping else 0,
    }

    out["media_embedding_enabled"] = str(await _setting("mediaEmbedding.enabled")).lower() in ("true", "1")

    # Auth key sources (booleans only — never the secret values)
    settings_key = await infra.get_setting(config.MCP_SETTINGS_KEY, ttl=config.MCP_SETTINGS_CACHE_TTL)
    out["auth"] = {
        "enabled": config.MCP_AUTH_ENABLED,
        "env_key_set": bool(config.MCP_API_KEY),
        "settings_key_configured": bool(settings_key),
        "settings_key_name": config.MCP_SETTINGS_KEY,
    }

    # Embedding worker liveness (Python EmbeddingWorker heartbeat)
    if r is not None:
        try:
            hb = await r.get("embedding_worker:heartbeat")
            status = await r.get("embedding:status")
            age = (time.time() - float(hb)) if hb else None
            out["embedding_worker"] = {
                "status": status,
                "heartbeat_age_sec": round(age, 1) if age is not None else None,
                "stale": (age is not None and age > 60),
            }
        except Exception as e:
            out["embedding_worker"] = {"error": str(e)}

    return out


@mcp.tool()
async def scrape_overview() -> dict:
    """Snapshot of scrape/crawl activity: cached scraped pages, scrape-embedding
    processing states, Google-Drive import jobs, and recent batch-crawl jobs."""
    out: dict = {}

    if await infra.table_exists("scraped_pages"):
        out["scraped_pages"] = {
            "total": await _safe_val("SELECT COUNT(*) FROM scraped_pages"),
            "last_24h": await _safe_val(
                "SELECT COUNT(*) FROM scraped_pages WHERE created_at > now() - interval '24 hours'"
            ),
            "recent": await _safe_fetch(
                "SELECT url, title, content_length, chunk_count, scraping_mode, created_at "
                "FROM scraped_pages ORDER BY created_at DESC LIMIT 10"
            ),
        }

    for tbl in ("scrape_embeddings", "scraped_embeddings"):
        if await infra.table_exists(tbl):
            has_status = await _safe_val(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = $1 AND column_name = 'processing_status'", tbl
            )
            if has_status:
                out[tbl] = {
                    "by_status": await _safe_fetch(
                        f"SELECT processing_status AS status, COUNT(*) AS count "
                        f"FROM {tbl} GROUP BY processing_status ORDER BY count DESC"
                    )
                }
            else:
                out[tbl] = {"total": await _safe_val(f"SELECT COUNT(*) FROM {tbl}")}

    if await infra.table_exists("import_jobs"):
        out["import_jobs"] = {
            "by_status": await _safe_fetch(
                "SELECT status, COUNT(*) AS count FROM import_jobs GROUP BY status ORDER BY count DESC"
            ),
            "active": await _safe_fetch(
                "SELECT id, job_type, status, progress, processed_files, total_files, "
                "successful_files, failed_files, started_at "
                "FROM import_jobs WHERE status IN ('pending','in_progress') ORDER BY id DESC LIMIT 10"
            ),
        }

    out["batch_crawl_jobs"] = await _list_crawl_batches()
    return out


async def _list_crawl_batches(limit: int = 25) -> list[dict]:
    client = await infra.get_redis()
    if not client:
        return []
    jobs: list[dict] = []
    try:
        async for key in client.scan_iter(match="crawl:batch:*:status", count=100):
            job_id = key.split(":")[2] if len(key.split(":")) >= 4 else key
            status = await client.get(key)
            ttl = await client.ttl(key)
            jobs.append({"job_id": job_id, "status": status, "ttl_sec": ttl})
            if len(jobs) >= limit:
                break
    except Exception as e:
        log.warning("crawl batch scan failed: %s", e)
    return jobs


@mcp.tool()
async def get_crawl_job(job_id: str) -> dict:
    """Detailed status of one batch-crawl job (results when completed, error when
    failed). job_id is the UUID returned by trigger_batch_crawl / POST /crawl/batch."""
    status = await infra.redis_get_json(f"crawl:batch:{job_id}:status")
    if status is None:
        return {"job_id": job_id, "found": False, "note": "no Redis entry (expired after 1h TTL or wrong id)"}
    out: dict = {"job_id": job_id, "found": True, "status": status}
    if status == "completed":
        results = await infra.redis_get_json(f"crawl:batch:{job_id}:results")
        out["result_count"] = len(results) if isinstance(results, list) else None
        out["results"] = results
    elif status == "failed":
        out["error"] = await infra.redis_get_json(f"crawl:batch:{job_id}:error")
    return out


@mcp.tool()
async def embed_overview() -> dict:
    """Live embedding progress (current job snapshot from Redis) plus corpus
    totals from unified_embeddings broken down by embedding model."""
    out: dict = {}

    client = await infra.get_redis()
    if client:
        out["live"] = {
            "progress": await infra.redis_get_json("embedding:progress"),
            "status": await infra.redis_get_json("embedding:status"),
        }
        try:
            state = await client.hgetall("embedding_worker:state")
            out["live"]["worker_state"] = state or None
        except Exception:
            pass

    if await infra.table_exists("unified_embeddings"):
        out["corpus"] = {
            "total": await _safe_val("SELECT COUNT(*) FROM unified_embeddings"),
            "source_tables": await _safe_val(
                "SELECT COUNT(DISTINCT source_table) FROM unified_embeddings"
            ),
            "by_model": await _safe_fetch(
                "SELECT model_used, COUNT(*) AS count, SUM(tokens_used) AS tokens "
                "FROM unified_embeddings GROUP BY model_used ORDER BY count DESC LIMIT 10"
            ),
            "last_24h": await _safe_val(
                "SELECT COUNT(*) FROM unified_embeddings WHERE created_at > now() - interval '24 hours'"
            ),
        }
    return out


@mcp.tool()
async def embed_table_stats() -> dict:
    """Per-source-table embedding counts (rows, distinct documents, tokens, last
    activity) from unified_embeddings — useful to see which tables are embedded."""
    if not await infra.table_exists("unified_embeddings"):
        return {"error": "unified_embeddings table not found"}
    return {
        "tables": await _safe_fetch(
            "SELECT source_table, source_type, COUNT(*) AS rows, "
            "COUNT(DISTINCT source_id) AS documents, SUM(tokens_used) AS tokens, "
            "MAX(created_at) AS last_embedded "
            "FROM unified_embeddings GROUP BY source_table, source_type "
            "ORDER BY rows DESC"
        )
    }


@mcp.tool()
async def legislation_overview(source_table: str = "uae_legislation", limit: int = 50) -> dict:
    """Legal-corpus snapshot for the RAG dataset: chunk counts in `source_table`
    broken down by language (metadata.lang), per-law row counts, and whether the
    Arabic BM25 column (search_vector_ar) is present. Read-only; use it to see how
    the Arabic/English legislation dataset is built up over time."""
    if not await infra.table_exists("unified_embeddings"):
        return {"error": "unified_embeddings table not found"}
    limit = max(1, min(limit, 500))
    ar_col = await _safe_val(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name = 'unified_embeddings' AND column_name = 'search_vector_ar'"
    )
    return {
        "source_table": source_table,
        "total_chunks": await _safe_val(
            "SELECT COUNT(*) FROM unified_embeddings WHERE source_table = $1", source_table
        ),
        "total_laws": await _safe_val(
            "SELECT COUNT(DISTINCT source_name) FROM unified_embeddings WHERE source_table = $1", source_table
        ),
        "by_lang": await _safe_fetch(
            "SELECT COALESCE(metadata->>'lang','?') AS lang, COUNT(*) AS chunks, "
            "COUNT(DISTINCT source_name) AS laws "
            "FROM unified_embeddings WHERE source_table = $1 GROUP BY 1 ORDER BY 1", source_table
        ),
        "laws": await _safe_fetch(
            "SELECT source_name, COALESCE(metadata->>'lang','?') AS lang, COUNT(*) AS chunks "
            "FROM unified_embeddings WHERE source_table = $1 "
            "GROUP BY source_name, 2 ORDER BY chunks DESC LIMIT $2", source_table, limit
        ),
        "arabic_bm25_ready": bool(ar_col and ar_col > 0),
    }


@mcp.tool()
async def legislation_search(query: str, source_table: str = "uae_legislation", limit: int = 5) -> dict:
    """Quick BM25 keyword search over the legal corpus to sanity-check retrieval via
    MCP (read-only, no embeddings). Arabic-script queries are routed to the Arabic
    column (search_vector_ar / 'arabic' regconfig) when present; otherwise the default
    search_vector / 'english' is used. Returns ranked source_name + lang + snippet."""
    if not await infra.table_exists("unified_embeddings"):
        return {"error": "unified_embeddings table not found"}
    limit = max(1, min(limit, 25))
    is_arabic = any("؀" <= ch <= "ۿ" for ch in (query or ""))
    ar_col = await _safe_val(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name = 'unified_embeddings' AND column_name = 'search_vector_ar'"
    )
    en_col = await _safe_val(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name = 'unified_embeddings' AND column_name = 'search_vector_en'"
    )
    if is_arabic and ar_col and ar_col > 0:
        col, regconfig = "search_vector_ar", "arabic"
    elif (not is_arabic) and en_col and en_col > 0:
        col, regconfig = "search_vector_en", "english"
    else:
        col, regconfig = "search_vector", ("arabic" if is_arabic else "english")
    rows = await _safe_fetch(
        f"SELECT source_name, COALESCE(metadata->>'lang','?') AS lang, "
        f"  round(ts_rank_cd({col}, plainto_tsquery($2::regconfig, $1), 32)::numeric, 4) AS bm25, "
        f"  left(regexp_replace(content, '\\s+', ' ', 'g'), 160) AS snippet "
        f"FROM unified_embeddings "
        f"WHERE source_table = $3 AND {col} @@ plainto_tsquery($2::regconfig, $1) "
        f"ORDER BY bm25 DESC LIMIT $4",
        query, regconfig, source_table, limit,
    )
    return {"query": query, "is_arabic": is_arabic, "column": col, "regconfig": regconfig,
            "result_count": len(rows), "results": rows}


@mcp.tool()
async def media_overview(status: Optional[str] = None, limit: int = 25) -> dict:
    """Multimodal media-ingest status: media_assets counts by status, the most
    recent assets (optionally filtered by status), and total CLIP embeddings."""
    if not await infra.table_exists("media_assets"):
        return {"error": "media_assets table not found (multimodal not migrated)"}
    limit = max(1, min(limit, 200))
    out: dict = {
        "by_status": await _safe_fetch(
            "SELECT status, COUNT(*) AS count FROM media_assets GROUP BY status ORDER BY count DESC"
        ),
        "by_type": await _safe_fetch(
            "SELECT asset_type, COUNT(*) AS count FROM media_assets GROUP BY asset_type ORDER BY count DESC"
        ),
    }
    if status:
        out["recent"] = await _safe_fetch(
            "SELECT id, asset_type, status, segment_count, error, created_at, updated_at "
            "FROM media_assets WHERE status = $1 ORDER BY id DESC LIMIT $2", status, limit
        )
    else:
        out["recent"] = await _safe_fetch(
            "SELECT id, asset_type, status, segment_count, error, created_at, updated_at "
            "FROM media_assets ORDER BY id DESC LIMIT $1", limit
        )
    if await infra.table_exists("media_embeddings"):
        out["clip_embeddings_total"] = await _safe_val("SELECT COUNT(*) FROM media_embeddings")
    return out


@mcp.tool()
async def get_media_asset(asset_id: int) -> dict:
    """Full record for one media asset plus its stored CLIP segment count."""
    row = await infra.fetchrow("SELECT * FROM media_assets WHERE id = $1", asset_id)
    if not row:
        return {"asset_id": asset_id, "found": False}
    seg = await _safe_val("SELECT COUNT(*) FROM media_embeddings WHERE asset_id = $1", asset_id)
    return {"asset_id": asset_id, "found": True, "asset": row, "embedding_segments": seg}


@mcp.tool()
async def celery_tasks() -> dict:
    """Current Celery activity across workers: active, reserved, and scheduled
    tasks, plus the registered task names. Source of truth for the worker queue."""
    active = await infra.celery_inspect("active")
    reserved = await infra.celery_inspect("reserved")
    scheduled = await infra.celery_inspect("scheduled")
    registered = await infra.celery_inspect("registered")

    def _count(d):
        return sum(len(v) for v in d.values()) if isinstance(d, dict) else 0

    return {
        "active": infra.clean(active),
        "reserved": infra.clean(reserved),
        "scheduled": infra.clean(scheduled),
        "registered": infra.clean(registered),
        "summary": {
            "active": _count(active),
            "reserved": _count(reserved),
            "scheduled": _count(scheduled),
        },
    }


@mcp.tool()
async def recent_errors(limit: int = 20) -> dict:
    """Recent failures across the pipelines: failed media assets, errored scrape
    embeddings, and failed import jobs — a fast triage view."""
    limit = max(1, min(limit, 100))
    out: dict = {}

    if await infra.table_exists("media_assets"):
        out["media_failed"] = await _safe_fetch(
            "SELECT id, asset_type, error, updated_at FROM media_assets "
            "WHERE status = 'failed' ORDER BY updated_at DESC NULLS LAST LIMIT $1", limit
        )

    for tbl in ("scrape_embeddings", "scraped_embeddings"):
        if await infra.table_exists(tbl):
            has_status = await _safe_val(
                "SELECT COUNT(*) FROM information_schema.columns "
                "WHERE table_name = $1 AND column_name = 'processing_status'", tbl
            )
            if has_status:
                out[f"{tbl}_errors"] = await _safe_fetch(
                    f"SELECT id, source_url, processing_errors, updated_at FROM {tbl} "
                    f"WHERE processing_status = 'error' ORDER BY updated_at DESC LIMIT $1", limit
                )
            break

    if await infra.table_exists("import_jobs"):
        out["import_failed"] = await _safe_fetch(
            "SELECT id, job_type, status, failed_files, metadata, completed_at FROM import_jobs "
            "WHERE status = 'failed' ORDER BY id DESC LIMIT $1", limit
        )

    return out


def _data_health_defaults():
    """In-code fallbacks for the dataHealth.* settings keys.

    The single source of truth for these defaults is services/data_health.py
    (Hard Rule #2: default in one place). The import is guarded because the MCP
    server may run in a lightweight venv; when it fails we degrade to
    settings-rows-only (no duplicated dict here).
    """
    try:
        from services.data_health import (
            DEFAULT_METADATA_FIELDS, DEFAULT_PAIRING, DEFAULT_SELF_SOURCED_TABLES,
        )
        return DEFAULT_METADATA_FIELDS, DEFAULT_PAIRING, DEFAULT_SELF_SOURCED_TABLES
    except Exception:
        return None, None, None


async def _json_setting(key: str, fallback):
    """settings-table JSON value for `key`, or `fallback` when the row is
    absent/malformed. Returns (value, source) with source in
    settings|default|missing."""
    raw = await infra.get_setting(key)
    if raw is not None:
        try:
            return json.loads(raw), "settings"
        except (json.JSONDecodeError, TypeError) as e:
            log.warning("settings row %s is not valid JSON (%s) - using default", key, e)
    if fallback is not None:
        return fallback, "default"
    return None, "missing"


@mcp.tool()
async def data_health_summary() -> dict:
    """Read-only data-health summary for the RAG corpus (system DB only):
    per-table required-metadata coverage (dataHealth.metadataFields), pairing
    gaps such as laws missing their EN or AR version (dataHealth.pairing),
    knowledge-graph resolution / entity-extraction coverage, and plain-English
    recommendations. Configuration comes from the settings table with in-code
    defaults from services/data_health.py."""
    if not await infra.table_exists("unified_embeddings"):
        return {"error": "unified_embeddings table not found"}

    default_fields, default_pairing, _default_self = _data_health_defaults()
    metadata_fields, fields_source = await _json_setting("dataHealth.metadataFields", default_fields)
    pairing, pairing_source = await _json_setting("dataHealth.pairing", default_pairing)

    out: dict = {
        "config_sources": {
            "dataHealth.metadataFields": fields_source,
            "dataHealth.pairing": pairing_source,
        },
        "totals": {
            "embeddings": await _safe_val("SELECT COUNT(*) FROM unified_embeddings"),
            "by_table": await _safe_fetch(
                "SELECT source_table, COUNT(*) AS rows FROM unified_embeddings "
                "GROUP BY source_table ORDER BY rows DESC LIMIT 15"
            ),
        },
    }
    recommendations: list[str] = []

    # Required-metadata coverage per configured table+field
    coverage: dict = {}
    for table, fields in (metadata_fields or {}).items():
        if table == "default":
            continue
        total = await _safe_val(
            "SELECT COUNT(*) FROM unified_embeddings WHERE LOWER(source_table) = LOWER($1)", table
        )
        if not total:
            continue
        field_stats = {}
        for field in fields:
            cnt = await _safe_val(
                "SELECT COUNT(*) FROM unified_embeddings "
                "WHERE LOWER(source_table) = LOWER($1) AND metadata ? $2", table, str(field)
            ) or 0
            pct = round(cnt / total * 100, 2)
            field_stats[str(field)] = {"count": cnt, "pct": pct}
            if pct < 50:
                recommendations.append(
                    f"Metadata key '{field}' covers only {pct}% of '{table}' rows - "
                    "run the metadata backfill."
                )
        coverage[table] = {"total_rows": total, "fields": field_stats}
    out["metadata_coverage"] = coverage

    # Pairing gaps (e.g. law_key groups missing one of lang en/ar)
    if pairing and pairing.get("enabled"):
        grp = str(pairing.get("groupField", "law_key"))
        dim = str(pairing.get("dimensionField", "lang"))
        expected = [str(v) for v in pairing.get("expected", ["en", "ar"])]
        src = str(pairing.get("sourceTable", "uae_legislation"))
        gaps = await _safe_fetch(
            "SELECT grp, dims FROM ("
            "  SELECT metadata->>$2 AS grp, array_agg(DISTINCT metadata->>$3) AS dims"
            "  FROM unified_embeddings"
            "  WHERE LOWER(source_table) = LOWER($1)"
            "    AND metadata->>$2 IS NOT NULL AND metadata->>$3 IS NOT NULL"
            "  GROUP BY 1"
            ") g WHERE NOT (dims @> $4::text[]) ORDER BY grp",
            src, grp, dim, expected,
        )
        out["pairing_gaps"] = {
            "enabled": True,
            "source_table": src,
            "group_field": grp,
            "expected": expected,
            "gap_count": len(gaps),
            "examples": [
                {"group": g["grp"], "present": g["dims"],
                 "missing": sorted(set(expected) - set(g["dims"] or []))}
                for g in gaps[:10]
            ],
        }
        if gaps:
            recommendations.append(
                f"{len(gaps)} {grp} groups in '{src}' are missing one of {expected} - "
                "ingest the missing language versions."
            )
    else:
        out["pairing_gaps"] = {"enabled": False}

    # Knowledge-graph health
    graph: dict = {"available": False}
    if await infra.table_exists("chunk_relationships"):
        graph["available"] = True
        total_rel = await _safe_val("SELECT COUNT(*) FROM chunk_relationships") or 0
        resolved = await _safe_val(
            "SELECT COUNT(*) FROM chunk_relationships WHERE target_chunk_id IS NOT NULL"
        ) or 0
        rate = round(resolved / total_rel, 4) if total_rel else None
        graph["relationships"] = {"total": total_rel, "resolved": resolved, "resolution_rate": rate}
        if total_rel and rate is not None and rate < 0.5:
            recommendations.append(
                f"Only {rate:.0%} of chunk_relationships are resolved - run the reference resolver."
            )
    if await infra.table_exists("chunk_entities"):
        graph["available"] = True
        tables = [t.lower() for t in (metadata_fields or {}).keys() if t != "default"]
        if tables:
            total_chunks = await _safe_val(
                "SELECT COUNT(*) FROM unified_embeddings WHERE LOWER(source_table) = ANY($1::text[])",
                tables,
            ) or 0
            covered = await _safe_val(
                "SELECT COUNT(DISTINCT ue.id) FROM unified_embeddings ue "
                "JOIN chunk_entities ce ON ce.chunk_id = ue.id "
                "WHERE LOWER(ue.source_table) = ANY($1::text[])",
                tables,
            ) or 0
            cov = round(covered / total_chunks * 100, 2) if total_chunks else None
            graph["extraction"] = {
                "source_tables": tables,
                "total_chunks": total_chunks,
                "chunks_with_entities": covered,
                "coverage_pct": cov,
            }
            if total_chunks and cov is not None and cov < 50:
                recommendations.append(
                    f"Entity extraction covers only {cov}% of chunks - run/resume the extraction job."
                )
    out["graph_health"] = graph

    if not recommendations:
        recommendations.append("Data health looks good.")
    out["recommendations"] = recommendations
    return out


def _parse_summary(value):
    """eval_runs.summary arrives as a JSON string from asyncpg (no codec set)."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None
    return value if isinstance(value, dict) else None


def _numeric_leaves(obj, prefix: str = "") -> dict:
    """Flatten numeric leaves of a nested summary dict ('overall.recall_at_5': 0.8)."""
    out: dict = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v, bool):
                continue
            if isinstance(v, (int, float)):
                out[key] = v
            elif isinstance(v, dict):
                out.update(_numeric_leaves(v, key))
    return out


@mcp.tool()
async def eval_overview(limit: int = 5) -> dict:
    """Summaries of the last N eval runs (eval_runs / eval_results tables) with
    pass counts and a metric delta vs the previous run of the same kind.
    Read-only; returns a note when the eval tables are not migrated yet."""
    if not await infra.table_exists("eval_runs"):
        return {
            "available": False,
            "note": "eval_runs table not found - apply "
                    "backend/database/migrations/20260702_eval_runs.sql",
        }
    limit = max(1, min(limit, 25))
    runs = await _safe_fetch(
        "SELECT id, kind, golden_set, git_sha, started_at, finished_at, summary, total_cost_usd "
        "FROM eval_runs ORDER BY started_at DESC NULLS LAST LIMIT $1", limit
    )
    out: dict = {"available": True, "run_count": len(runs), "runs": []}
    for r in runs:
        entry = dict(r)
        entry["summary"] = _parse_summary(r.get("summary"))
        if await infra.table_exists("eval_results"):
            counts = await _safe_fetch(
                "SELECT passed, COUNT(*) AS n FROM eval_results "
                "WHERE run_id = $1::uuid GROUP BY passed", r["id"]
            )
            entry["results"] = {
                "passed": sum(c["n"] for c in counts if c["passed"] is True),
                "failed": sum(c["n"] for c in counts if c["passed"] is False),
                "unknown": sum(c["n"] for c in counts if c["passed"] is None),
            }
        # Delta vs the previous run of the same kind (numeric summary leaves).
        # started_at arrives ISO-serialized from infra.clean, hence the text cast.
        prev = []
        if r.get("started_at"):
            prev = await _safe_fetch(
                "SELECT summary FROM eval_runs "
                "WHERE kind = $1 AND started_at < $2::text::timestamptz "
                "ORDER BY started_at DESC LIMIT 1", r.get("kind"), str(r.get("started_at"))
            )
        if prev:
            cur_m = _numeric_leaves(entry["summary"] or {})
            prev_m = _numeric_leaves(_parse_summary(prev[0].get("summary")) or {})
            entry["delta_vs_previous"] = {
                k: round(cur_m[k] - prev_m[k], 4)
                for k in sorted(set(cur_m) & set(prev_m))
                if cur_m[k] != prev_m[k]
            }
        out["runs"].append(entry)
    return out


# =========================================================================== #
# CONTROL (mutating) — proxy to the existing service endpoints
# =========================================================================== #
@mcp.tool()
async def reingest_media(asset_id: int, language: str = "tr") -> dict:
    """Re-run ingestion for an existing media asset (re-embed image/audio/video).
    Dispatches the Celery media.process_asset task via the Python service. The
    asset must exist and mediaEmbedding.enabled must be true."""
    return await infra.python_post(
        f"/api/python/media/reingest/{asset_id}", form={"language": language}
    )


@mcp.tool()
async def trigger_batch_crawl(
    urls: list[str],
    mode: str = "auto",
    extraction_prompt: Optional[str] = None,
    parallel: bool = True,
) -> dict:
    """Queue a batch web crawl (1-50 URLs). mode is 'auto' (default), 'llm'
    (needs extraction_prompt), or 'schema'. Returns a job_id — poll it with
    get_crawl_job. Runs as a background task in the Python service."""
    if not urls:
        return {"ok": False, "error": "at least one URL is required"}
    if len(urls) > 50:
        return {"ok": False, "error": "max 50 URLs per batch"}
    if mode not in ("auto", "llm", "schema"):
        return {"ok": False, "error": "mode must be auto, llm, or schema"}
    body = {"urls": urls, "mode": mode, "parallel": parallel}
    if extraction_prompt:
        body["extraction_prompt"] = extraction_prompt
    return await infra.python_post("/api/python/crawl/batch", json_body=body)


@mcp.tool()
async def pause_embedding() -> dict:
    """Pause the currently running embedding job (Node backend
    POST /api/v2/embeddings/pause). Progress is preserved for resume."""
    return await infra.backend_post("/api/v2/embeddings/pause")


@mcp.tool()
async def resume_embedding() -> dict:
    """Resume a paused embedding job (Node backend POST /api/v2/embeddings/auto-resume)."""
    return await infra.backend_post("/api/v2/embeddings/auto-resume")


@mcp.tool()
async def stop_embedding() -> dict:
    """Stop the currently running embedding job (Node backend
    POST /api/v2/embeddings/stop). Unlike pause, this ends the run."""
    return await infra.backend_post("/api/v2/embeddings/stop")


@mcp.tool()
async def revoke_celery_task(task_id: str, terminate: bool = False) -> dict:
    """Revoke a queued/running Celery task by id. terminate=true sends SIGTERM to
    a running task; otherwise it is just removed from the queue. Get ids from
    celery_tasks."""
    return await infra.celery_revoke(task_id, terminate=terminate)


# =========================================================================== #
# transport: X-API-Key ASGI gate + entrypoint
# =========================================================================== #
def _bearer(value: Optional[str]) -> Optional[str]:
    if value and value.lower().startswith("bearer "):
        return value[7:].strip()
    return None


class ApiKeyASGI:
    """Pure-ASGI middleware (safe for streaming/SSE) enforcing X-API-Key.

    A request is accepted if its key matches EITHER the env key (MCP_API_KEY /
    INTERNAL_API_KEY) OR the DB-driven value in settings[mcp.bearerKey]. The
    settings value is cached briefly so rotation from the UI takes effect without
    a restart.
    """

    def __init__(self, app):
        self.app = app

    async def _accepts(self, provided: Optional[str]) -> bool:
        if not provided:
            return False
        if config.MCP_API_KEY and provided == config.MCP_API_KEY:
            return True
        settings_key = await infra.get_setting(
            config.MCP_SETTINGS_KEY, ttl=config.MCP_SETTINGS_CACHE_TTL
        )
        return bool(settings_key) and provided == settings_key

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not config.MCP_AUTH_ENABLED:
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        if path.rstrip("/").endswith("/healthz"):
            return await self.app(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        provided = headers.get("x-api-key") or _bearer(headers.get("authorization"))
        if not await self._accepts(provided):
            await send({"type": "http.response.start", "status": 401,
                        "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body",
                        "body": b'{"error":"invalid or missing X-API-Key"}'})
            return
        return await self.app(scope, receive, send)


try:  # health probe that doesn't require the API key
    from starlette.responses import JSONResponse

    @mcp.custom_route("/healthz", methods=["GET"])
    async def _healthz(_request):
        return JSONResponse({"ok": True, "service": "lsemb-mcp"})
except Exception as e:  # pragma: no cover - older SDKs
    log.warning("could not register /healthz: %s", e)


def build_app():
    return ApiKeyASGI(mcp.streamable_http_app())


def main():
    import uvicorn

    if config.MCP_AUTH_ENABLED and not config.MCP_API_KEY:
        log.warning("MCP_AUTH_ENABLED but no env MCP_API_KEY/INTERNAL_API_KEY set — "
                    "requests will only be accepted once settings[%s] is configured. "
                    "Set MCP_API_KEY, configure the settings key, or MCP_AUTH_ENABLED=false.",
                    config.MCP_SETTINGS_KEY)
    log.info("Starting lsemb-mcp on %s:%s%s (auth=%s)",
             config.MCP_HOST, config.MCP_PORT, config.MCP_PATH, config.MCP_AUTH_ENABLED)
    uvicorn.run(build_app(), host=config.MCP_HOST, port=config.MCP_PORT,
                log_level=config.LOG_LEVEL.lower())


if __name__ == "__main__":
    main()
