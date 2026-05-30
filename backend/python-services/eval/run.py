"""RAG quality eval — runner.

Loads golden_queries.json, hits the chatbot endpoint for each, writes a snapshot.

Usage:
    python -m eval.run                        # write snapshots/proposed.json
    python -m eval.run --out snapshots/golden.json
    python -m eval.run --only q1-singlehop-en
    python -m eval.run --tenant gx10

Env:
    CHATBOT_URL   default http://localhost:3001/api/chatbot/query  (Node backend)
    CHATBOT_AUTH  optional bearer token
    EMBED_URL     default http://localhost:8002/embedding/embed    (Python service)

Hard rules:
- temperature=0 always (eval is deterministic; the runner refuses to proceed otherwise)
- OPENAI_API_KEY / ANTHROPIC_API_KEY in env => REFUSE (eval must run against local models only)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

EVAL_DIR = Path(__file__).resolve().parent
GOLDEN_PATH = EVAL_DIR / "golden_queries.json"
SNAPSHOTS_DIR = EVAL_DIR / "snapshots"

CLOUD_KEYS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "COHERE_API_KEY")


def _refuse_if_cloud_keys_present() -> None:
    leaked = [k for k in CLOUD_KEYS if os.environ.get(k)]
    if leaked:
        sys.stderr.write(
            f"REFUSED: cloud API keys present in env ({', '.join(leaked)}). "
            "Eval must run against local models only. Unset them and retry.\n"
        )
        sys.exit(2)


async def _call_chatbot(client: httpx.AsyncClient, query: dict[str, Any]) -> dict[str, Any]:
    url = os.environ.get("CHATBOT_URL", "http://localhost:3001/api/chatbot/query")
    headers = {}
    if tok := os.environ.get("CHATBOT_AUTH"):
        headers["Authorization"] = f"Bearer {tok}"

    payload = {
        "query": query["query"],
        "tenant": query.get("tenant", "gx10"),
        "language": query.get("lang", "en"),
        "temperature": 0,
        "stream": False,
    }

    t0 = time.perf_counter()
    try:
        r = await client.post(url, json=payload, headers=headers, timeout=60.0)
        r.raise_for_status()
        body = r.json()
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "answer": body.get("answer", ""),
            "citations": body.get("citations", []),
            "refusal": bool(body.get("refusal", False)) or _looks_like_refusal(body.get("answer", "")),
            "model": body.get("model"),
            "latency_ms": latency_ms,
            "raw": body,
        }
    except (httpx.HTTPError, ValueError) as e:
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "latency_ms": int((time.perf_counter() - t0) * 1000),
        }


_REFUSAL_MARKERS = (
    "i don't know",
    "i cannot answer",
    "no information",
    "not found in the provided",
    "bilmiyorum",
    "veri bulunamadı",
)


def _looks_like_refusal(answer: str) -> bool:
    a = (answer or "").lower()
    return any(m in a for m in _REFUSAL_MARKERS)


async def run(out_path: Path, only: str | None, tenant: str | None) -> int:
    _refuse_if_cloud_keys_present()

    with GOLDEN_PATH.open("r", encoding="utf-8") as f:
        golden = json.load(f)

    queries = golden["queries"]
    if only:
        queries = [q for q in queries if q["id"] == only]
    if tenant:
        queries = [q for q in queries if q.get("tenant") == tenant]
    if not queries:
        sys.stderr.write("No queries matched the filters.\n")
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []

    async with httpx.AsyncClient() as client:
        for q in queries:
            print(f"  → {q['id']} ({q.get('lang')}/{q.get('tenant')})", flush=True)
            res = await _call_chatbot(client, q)
            results.append({"query_id": q["id"], "input": q, "output": res})

    snapshot = {
        "version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "chatbot_url": os.environ.get("CHATBOT_URL", "http://localhost:3001/api/chatbot/query"),
        "git_sha": _git_sha(),
        "results": results,
    }
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {out_path} ({len(results)} queries)")
    return 0


def _git_sha() -> str | None:
    import subprocess
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=EVAL_DIR, text=True
        ).strip()
    except Exception:
        return None


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", default=str(SNAPSHOTS_DIR / "proposed.json"))
    p.add_argument("--only", help="Run a single query by id")
    p.add_argument("--tenant", help="Filter to one tenant")
    args = p.parse_args()
    return asyncio.run(run(Path(args.out), args.only, args.tenant))


if __name__ == "__main__":
    raise SystemExit(main())
