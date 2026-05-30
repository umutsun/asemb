"""WS3 parity harness — proves the VectorStore primitives are behaviour-preserving.

This is the GATE for the WS3 engine-binding step (ADR-0001). Wiring
`semantic_search_service.py` to call `self.store.*` is blocked until this is green
against a real Postgres + populated corpus.

What it checks
--------------
For each logical collection it runs TWO queries with the SAME probe embedding:

  REFERENCE  — the engine's CURRENT inline SQL, copied verbatim from
               semantic_search_service.vector_search (with line refs below). This is the
               behaviour we must not regress.
  STORE      — PgvectorStore.similarity_search(collection, probe, limit).

It then asserts they return the SAME rows, in the SAME order, with the SAME
similarity_score. Same for bm25_search. Any divergence is a hard fail.

Scope: only the per-collection STORE PRIMITIVE is under test. The engine's orchestration
(dedup via seen_ids/seen_source_ids, similarity_threshold, source-table weighting, RRF,
rerank) stays in the engine and is unchanged by wiring — so it is deliberately OUT of scope
here. We compare the RAW per-collection rows, pre-dedup / pre-threshold.

Usage
-----
    cd backend/python-services
    python -m eval.parity                 # all collections + bm25, limit 25
    python -m eval.parity --limit 50
    python -m eval.parity --only unified

Exit codes: 0 = parity green, 1 = could not run (empty corpus / no probe), 2 = MISMATCH.

Why a copied REFERENCE instead of calling the engine directly: the engine's `vector_search`
bundles all collections + dedup + threshold into one method, so there is no clean
per-collection primitive to call. Copying the inline SQL here (snapshotted at wiring time)
makes drift between the two implementations a *failing test* — which is exactly the signal
the wiring step needs.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Any, Dict, List, Optional

# Engine import path (run as `python -m eval.parity` from backend/python-services).
from services.database import get_db
from services.vector_store import get_vector_store

# ── REFERENCE SQL — copied verbatim from semantic_search_service.vector_search ──────────
# Keep these byte-identical to the engine. If the engine changes one, parity must fail until
# PgvectorStore is updated to match. Line refs are to semantic_search_service.py @ eb9be718.

_REF_UNIFIED = """
    SELECT
        id, content, source_table, source_type, source_id, metadata,
        1 - (embedding <=> $1::vector) as similarity_score,
        'unified' as search_source
    FROM unified_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
"""  # engine:933-942

_REF_DOCUMENTS = """
    SELECT
        id, chunk_text as content,
        'document_embeddings' as source_table,
        'document' as source_type,
        document_id as source_id, metadata,
        1 - (embedding <=> $1::vector) as similarity_score,
        'documents' as search_source
    FROM document_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
"""  # engine:1005-1017

_REF_SCRAPES = """
    SELECT
        id, content,
        'scrape_embeddings' as source_table,
        'web' as source_type,
        id::text as source_id, metadata,
        1 - (embedding <=> $1::vector) as similarity_score,
        'scrapes' as search_source
    FROM scrape_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
"""  # engine:1037-1049

_REF_MESSAGES = """
    SELECT
        id, content,
        'message_embeddings' as source_table,
        'chat' as source_type,
        message_id::text as source_id, metadata,
        1 - (embedding <=> $1::vector) as similarity_score,
        'messages' as search_source
    FROM message_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1::vector
    LIMIT $2
"""  # engine:1067-1079

_REF_BM25 = """
    SELECT id, LEFT(content, $3) as content, source_table, source_type,
           source_id, metadata,
           ts_rank_cd(search_vector, plainto_tsquery($4::regconfig, $1), 32) as bm25_score
    FROM unified_embeddings
    WHERE search_vector @@ plainto_tsquery($4::regconfig, $1)
    ORDER BY bm25_score DESC
    LIMIT $2
"""  # engine:1461-1471

_REFERENCE_SQL = {
    "unified": _REF_UNIFIED,
    "documents": _REF_DOCUMENTS,
    "scrapes": _REF_SCRAPES,
    "messages": _REF_MESSAGES,
}

# Tables to probe for a sample embedding, in preference order.
_PROBE_TABLES = ("unified_embeddings", "document_embeddings", "scrape_embeddings", "message_embeddings")

# Rounding for the float similarity compare (pgvector <=> is deterministic for a fixed vector,
# so this only guards against textual float-repr noise between the two identical queries).
_SCORE_NDIGITS = 9


def _vec_literal(embedding: List[float]) -> str:
    # Mirrors the engine's embedding_str: f"[{','.join(map(str, emb))}]"
    return "[" + ",".join(map(str, embedding)) + "]"


def _parse_vec(text: str) -> List[float]:
    return [float(x) for x in text.strip().lstrip("[").rstrip("]").split(",") if x != ""]


def _key(rows: List[Dict[str, Any]]) -> List[tuple]:
    """Reduce a result set to the retrieval-critical invariant: (id, rounded score) in order."""
    out = []
    for r in rows:
        score = r.get("similarity_score")
        if score is None:
            score = r.get("bm25_score")
        out.append((r.get("id"), round(float(score), _SCORE_NDIGITS) if score is not None else None))
    return out


async def _fetch_probe(pool) -> Optional[tuple]:
    """Return (vector_literal, source_table_it_came_from) or None if the corpus is empty."""
    for tbl in _PROBE_TABLES:
        try:
            txt = await pool.fetchval(
                f"SELECT embedding::text FROM {tbl} WHERE embedding IS NOT NULL LIMIT 1"
            )
        except Exception:
            txt = None
        if txt:
            return _vec_literal(_parse_vec(txt)), tbl
    return None


async def _check_vector(pool, store, collection: str, probe_vec: str, limit: int) -> Dict[str, Any]:
    ref_sql = _REFERENCE_SQL[collection]
    # REFERENCE: engine inline SQL.
    try:
        ref_rows = [dict(r) for r in await pool.fetch(ref_sql, probe_vec, limit)]
    except Exception as e:
        return {"collection": collection, "status": "ERROR", "detail": f"reference SQL failed: {e}"}
    # STORE: primitive under test. PgvectorStore takes a list[float], not the literal.
    probe_list = _parse_vec(probe_vec)
    try:
        store_rows = await store.similarity_search(collection, probe_list, limit)
    except Exception as e:
        return {"collection": collection, "status": "ERROR", "detail": f"store call failed: {e}"}

    if not ref_rows and not store_rows:
        return {"collection": collection, "status": "SKIP", "detail": "empty (no rows either side)"}

    ref_k, store_k = _key(ref_rows), _key(store_rows)
    if ref_k == store_k:
        return {"collection": collection, "status": "PASS", "detail": f"{len(ref_k)} rows identical"}

    # Diagnose the first divergence.
    first_diff = next(
        (i for i, (a, b) in enumerate(zip(ref_k, store_k)) if a != b),
        min(len(ref_k), len(store_k)),
    )
    return {
        "collection": collection,
        "status": "MISMATCH",
        "detail": (
            f"ref={len(ref_k)} rows store={len(store_k)} rows; first diff @ idx {first_diff}: "
            f"ref={ref_k[first_diff] if first_diff < len(ref_k) else '<none>'} "
            f"store={store_k[first_diff] if first_diff < len(store_k) else '<none>'}"
        ),
    }


async def _check_bm25(pool, store, limit: int, fts_language: str = "turkish") -> Dict[str, Any]:
    # Use a high-frequency token from the corpus as the probe so the query returns rows.
    probe_word = await pool.fetchval(
        "SELECT split_part(content, ' ', 1) FROM unified_embeddings "
        "WHERE content IS NOT NULL AND length(content) > 0 LIMIT 1"
    )
    if not probe_word:
        return {"collection": "bm25", "status": "SKIP", "detail": "no content to probe"}
    try:
        ref_rows = [dict(r) for r in await pool.fetch(_REF_BM25, probe_word, limit, 1500, fts_language)]
    except Exception as e:
        return {"collection": "bm25", "status": "ERROR", "detail": f"reference BM25 failed: {e}"}
    try:
        store_rows = await store.bm25_search(probe_word, limit, max_excerpt=1500, fts_language=fts_language)
    except Exception as e:
        return {"collection": "bm25", "status": "ERROR", "detail": f"store bm25 failed: {e}"}

    if not ref_rows and not store_rows:
        return {"collection": "bm25", "status": "SKIP", "detail": "search_vector absent or no match"}
    if _key(ref_rows) == _key(store_rows):
        return {"collection": "bm25", "status": "PASS", "detail": f"{len(ref_rows)} rows identical (q={probe_word!r})"}
    return {
        "collection": "bm25",
        "status": "MISMATCH",
        "detail": f"ref={len(ref_rows)} store={len(store_rows)} for q={probe_word!r}",
    }


async def run(limit: int, only: Optional[str]) -> int:
    pool = await get_db()
    store = get_vector_store("pgvector")

    probe = await _fetch_probe(pool)
    if probe is None:
        sys.stderr.write("Could not run: no embeddings found in any collection (empty corpus).\n")
        return 1
    probe_vec, probe_src = probe
    print(f"Probe embedding sourced from {probe_src} (dim={len(_parse_vec(probe_vec))})\n")

    collections = ["unified", "documents", "scrapes", "messages"]
    if only and only != "bm25":
        collections = [only]

    results: List[Dict[str, Any]] = []
    for c in collections:
        results.append(await _check_vector(pool, store, c, probe_vec, limit))
    if not only or only == "bm25":
        results.append(await _check_bm25(pool, store, limit))

    print(f"{'COLLECTION':<12} {'STATUS':<10} DETAIL")
    print("-" * 78)
    for r in results:
        print(f"{r['collection']:<12} {r['status']:<10} {r['detail']}")

    statuses = {r["status"] for r in results}
    if "MISMATCH" in statuses or "ERROR" in statuses:
        print("\nPARITY: ❌ FAIL — engine wiring is BLOCKED until this is green.")
        return 2
    print("\nPARITY: ✅ GREEN — PgvectorStore is behaviour-preserving. Engine wiring unblocked.")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--limit", type=int, default=25, help="rows per collection (default 25)")
    p.add_argument("--only", help="run a single collection (unified|documents|scrapes|messages|bm25)")
    args = p.parse_args()
    return asyncio.run(run(args.limit, args.only))


if __name__ == "__main__":
    raise SystemExit(main())
