"""Answer-level eval runner — hits the real chat endpoint.

Sends each golden question to the Node backend chat endpoint
(evalSettings.chatUrl, default http://localhost:8083/api/v2/chat; env
EVAL_CHAT_URL overrides) with temperature=0 and stream=false, captures the
answer + sources into a snapshot artifact, and applies the deterministic
per-item checks (answer_must_contain / answer_must_not_contain /
expect_refusal). The LLM-judge groundedness scoring is a separate, later stage.

This project runs on OpenAI (key in settings 'openai.apiKey'); the old
local-models-only refusal on cloud API keys is intentionally gone.

The endpoint requires a JWT (authenticateToken) — pass it via env
EVAL_CHAT_TOKEN. Retrieval quality is evaluated separately and in-process by
`python -m eval.run_retrieval` (no HTTP, no auth needed).

Exit codes: 0 pass, 1 soft fail, 2 hard fail (unchanged convention).

Usage (from backend/python-services, PYTHONUTF8=1):
    EVAL_CHAT_TOKEN=<jwt> python -m eval.run [--golden PATH] [--only ID] [--lang en|ar]
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
from typing import Any, Dict, List, Optional

import httpx

from eval.config import ARTIFACTS_DIR, GOLDEN_DIR, load_eval_config

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Deterministic refusal markers (English + Arabic). The evidence gate phrasing is
# settings-driven; these markers cover the default refusal wording families.
_REFUSAL_MARKERS = (
    "i don't know",
    "i cannot answer",
    "no information",
    "not found in the provided",
    "do not contain",
    "not covered by the sources",
    "لا تحتوي المصادر",
    "لا تتوفر معلومات",
    "لا أستطيع الإجابة",
)


def _looks_like_refusal(answer: str) -> bool:
    a = (answer or "").lower()
    return any(m in a for m in _REFUSAL_MARKERS)


async def _call_chat(client: httpx.AsyncClient, url: str, token: Optional[str],
                     item: Dict[str, Any]) -> Dict[str, Any]:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = {
        "message": item["question"],
        "temperature": 0,
        "language": item.get("lang", "en"),
        "stream": False,
    }
    t0 = time.perf_counter()
    try:
        r = await client.post(url, json=payload, headers=headers, timeout=120.0)
        r.raise_for_status()
        body = r.json()
        answer = body.get("response") or body.get("answer") or ""
        return {
            "ok": True,
            "answer": answer,
            "sources": body.get("sources", []),
            "refusal": _looks_like_refusal(answer),
            "latency_ms": int((time.perf_counter() - t0) * 1000),
        }
    except (httpx.HTTPError, ValueError) as e:
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "latency_ms": int((time.perf_counter() - t0) * 1000),
        }


def _check_item(item: Dict[str, Any], out: Dict[str, Any]) -> List[str]:
    """Deterministic per-item failures (empty list = pass)."""
    if not out.get("ok"):
        return [f"chat call failed: {out.get('error')}"]
    expected = item.get("expected", {})
    answer = out.get("answer", "")
    fails: List[str] = []
    missing = [s for s in expected.get("answer_must_contain", []) if s and s.lower() not in answer.lower()]
    if missing:
        fails.append(f"missing required facets: {missing}")
    present = [s for s in expected.get("answer_must_not_contain", []) if s and s.lower() in answer.lower()]
    if present:
        fails.append(f"forbidden content present: {present}")
    if bool(expected.get("expect_refusal")) != bool(out.get("refusal")):
        fails.append(f"refusal mismatch: expected={expected.get('expect_refusal')} actual={out.get('refusal')}")
    return fails


async def run(golden_path: Path, only: Optional[str], lang: Optional[str], out_path: Optional[Path]) -> int:
    cfg = await load_eval_config()
    url = cfg.chat_url
    token = os.environ.get("EVAL_CHAT_TOKEN", "").strip() or None
    if not token:
        print("WARN: EVAL_CHAT_TOKEN not set — the chat endpoint requires a JWT and calls will likely 401")

    with golden_path.open("r", encoding="utf-8") as f:
        items = json.load(f)["items"]
    if only:
        items = [i for i in items if i["id"] == only]
    if lang:
        items = [i for i in items if i.get("lang") == lang]
    if not items:
        sys.stderr.write("No golden items matched the filters.\n")
        return 2

    results: List[Dict[str, Any]] = []
    n_hard = 0
    async with httpx.AsyncClient() as client:
        for item in items:
            out = await _call_chat(client, url, token, item)
            fails = _check_item(item, out)
            if fails:
                n_hard += 1
            results.append({"query_id": item["id"], "input": item, "output": out, "failures": fails})
            status = "OK" if not fails else "FAIL"
            print(f"  [{status}] {item['id']} ({out.get('latency_ms')}ms)"
                  + (f" -> {'; '.join(fails)}" if fails else ""))

    snapshot = {
        "version": 2,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "chat_url": url,
        "golden_path": str(golden_path),
        "results": results,
    }
    if out_path is None:
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_path = ARTIFACTS_DIR / f"answers_{ts}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {out_path} ({len(results)} items, {n_hard} failing)")
    return 2 if n_hard else 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--golden", help="Golden set path (default eval/golden/<goldenSet>.json or its .draft.json)")
    p.add_argument("--only", help="Run a single item by id")
    p.add_argument("--lang", choices=("en", "ar"), help="Filter to one language")
    p.add_argument("--out", help="Snapshot output path (default eval/artifacts/answers_<ts>.json)")
    args = p.parse_args()

    async def _run() -> int:
        if args.golden:
            golden_path = Path(args.golden)
        else:
            cfg = await load_eval_config()
            final = GOLDEN_DIR / f"{cfg.golden_set}.json"
            draft = GOLDEN_DIR / f"{cfg.golden_set}.draft.json"
            golden_path = final if final.exists() else draft
        if not golden_path.exists():
            sys.stderr.write(f"Golden set not found: {golden_path} — run `python -m eval.seed_golden` first.\n")
            return 2
        return await run(golden_path, args.only, args.lang, Path(args.out) if args.out else None)

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
