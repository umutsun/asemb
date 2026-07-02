"""Groundedness LLM-judge for answer-level evals.

Sends (question, retrieved source excerpts, answer) to the judge model with
temperature 0 and a JSON-object response format. Everything configurable comes
from the eval config (Hard Rule #1/#2):
- model:  evalSettings.judgeModel
- prompt: evalSettings.judgePrompt (verdict schema documented there)
- key:    same resolve order as the rest of the eval package —
          eval.config.resolve_openai_key (settings 'openai.apiKey', env
          OPENAI_API_KEY override)

Verdict (normalized): {grounded: 0|1|2, correct_law: bool, correct_article:
bool, unsupported_claims: [], notes: str}. Legacy prompts that return
{"groundedness": <float 0..1>} are normalized onto the same scale.

No key -> callers must SKIP the judge stage honestly (log + report), never
fabricate verdicts. judge_many() is the batchable helper (bounded concurrency,
order-preserving).
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

import httpx

OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"

# Excerpt shaping: enough context for the judge without paying for full chunks.
MAX_SOURCES = 8
MAX_SOURCE_CHARS = 1500
DEFAULT_CONCURRENCY = 4


def format_sources(sources: List[Dict[str, Any]]) -> str:
    """Number the source excerpts the way the answer's [n] citations do."""
    lines: List[str] = []
    for i, s in enumerate((sources or [])[:MAX_SOURCES], start=1):
        content = (s.get("full_content") or s.get("content") or s.get("excerpt") or "").strip()
        title = (s.get("title") or s.get("source_name") or "").strip()
        header = f"[{i}] {title}".strip()
        lines.append(f"{header}\n{content[:MAX_SOURCE_CHARS]}")
    return "\n\n".join(lines) if lines else "(no sources retrieved)"


def _normalize_verdict(data: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce the raw judge JSON into the canonical verdict shape. Accepts the
    legacy {"groundedness": <float 0..1>} scale as well."""
    if "grounded" in data:
        try:
            grounded = max(0, min(2, int(data["grounded"])))
        except (TypeError, ValueError):
            grounded = 0
    elif "groundedness" in data:
        try:
            g = float(data["groundedness"])
        except (TypeError, ValueError):
            g = 0.0
        grounded = 2 if g >= 0.75 else (1 if g >= 0.4 else 0)
    else:
        grounded = 0

    claims = data.get("unsupported_claims")
    if not isinstance(claims, list):
        claims = [str(claims)] if claims else []

    return {
        "grounded": grounded,
        "correct_law": bool(data.get("correct_law", False)),
        "correct_article": bool(data.get("correct_article", False)),
        "unsupported_claims": [str(c) for c in claims],
        "notes": str(data.get("notes") or data.get("reasons") or ""),
    }


async def judge_one(
    client: httpx.AsyncClient,
    *,
    api_key: str,
    model: str,
    prompt: str,
    question: str,
    answer: str,
    sources: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Judge one answer. Returns {"ok": True, "verdict": {...}, "usage": {...}}
    or {"ok": False, "error": "..."} — errors are surfaced, never masked."""
    user_content = (
        f"Question:\n{question}\n\n"
        f"Retrieved source excerpts:\n{format_sources(sources)}\n\n"
        f"Assistant answer:\n{answer}"
    )
    body = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_content},
        ],
    }
    try:
        r = await client.post(
            OPENAI_CHAT_COMPLETIONS_URL,
            json=body,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=90.0,
        )
        r.raise_for_status()
        payload = r.json()
        content = payload["choices"][0]["message"]["content"]
        verdict = _normalize_verdict(json.loads(content))
        usage = payload.get("usage") or {}
        return {
            "ok": True,
            "verdict": verdict,
            "usage": {
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
            },
        }
    except (httpx.HTTPError, KeyError, IndexError, ValueError, json.JSONDecodeError) as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


async def judge_many(
    items: List[Dict[str, Any]],
    *,
    api_key: str,
    model: str,
    prompt: str,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> List[Dict[str, Any]]:
    """Batchable helper: judge a list of {question, answer, sources} dicts with
    bounded concurrency. Result order matches input order."""
    sem = asyncio.Semaphore(max(1, concurrency))
    async with httpx.AsyncClient() as client:

        async def _one(item: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                return await judge_one(
                    client,
                    api_key=api_key,
                    model=model,
                    prompt=prompt,
                    question=item.get("question", ""),
                    answer=item.get("answer", ""),
                    sources=item.get("sources") or [],
                )

        return list(await asyncio.gather(*(_one(i) for i in items)))
