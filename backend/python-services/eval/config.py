"""Eval configuration loader.

All eval defaults live in this ONE module (Hard Rule #2: default in one place,
overridable). Every default below can be overridden by a row in the `settings`
table with the same key (evalSettings.*). `evalSettings.chatUrl` can additionally
be overridden by the EVAL_CHAT_URL environment variable (highest precedence),
so a runner can point at a non-local backend without touching the shared DB.

DATABASE_URL comes from the repo-root `.env.lsemb` (same pattern as
scripts/ingest_uae_law.py).
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

import asyncpg
from dotenv import load_dotenv

# eval/ -> python-services -> backend -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
EVAL_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = EVAL_DIR / "artifacts"
GOLDEN_DIR = EVAL_DIR / "golden"

load_dotenv(REPO_ROOT / ".env.lsemb")


def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL not set (expected in repo-root .env.lsemb)")
    return url


# --- Defaults (the ONE place; override via settings rows with the same key) ---

DEFAULT_JUDGE_PROMPT = (
    "You are a strict evaluation judge for a legal RAG assistant answering questions "
    "about UAE legislation. You are given a question, the retrieved source excerpts, "
    "and the assistant's answer. Score groundedness:\n"
    "- grounded=2: every factual claim in the answer is directly supported by the "
    "excerpts, and any cited law/article references match the excerpts.\n"
    "- grounded=1: the answer is broadly consistent with the excerpts but adds claims "
    "the excerpts do not support.\n"
    "- grounded=0: the answer contradicts the excerpts, invents laws, article numbers, "
    "figures or deadlines, or gives a substantive answer although the excerpts are "
    "irrelevant to the question.\n"
    "Refusal handling: if the excerpts do not contain the information needed, a clear "
    "refusal ('the sources do not cover this') scores grounded=2 and any substantive "
    "answer scores grounded=0.\n"
    "Also report: correct_law (does the answer rely on the law the question is about, "
    "per the excerpts?), correct_article (are the article numbers the answer cites "
    "correct per the excerpts? true when the answer cites no articles), and "
    "unsupported_claims (verbatim claims from the answer that the excerpts do not "
    "support; empty list when fully grounded).\n"
    'Respond with JSON only: {"grounded": 0 | 1 | 2, "correct_law": true | false, '
    '"correct_article": true | false, "unsupported_claims": ["..."], '
    '"notes": "<short English explanation>"}'
)

DEFAULT_THRESHOLDS: Dict[str, Any] = {
    "recallAt5": 0.8,
    "recallAt5PerLangMin": 0.7,
    "maxLangDelta": 0.2,
    "mrr": 0.6,
    "citationValidity": 1.0,
    "markdownLintErrors": 0,
    "languageMatch": 0.95,
    "groundednessMean": 0.85,
}

# Seed configuration for the golden-set sampler: which corpus domains to cover and
# which law-name keywords (matched against metadata->>'law' / source_name, which are
# English strings for both EN and AR documents) select laws for each domain.
DEFAULT_SEED_DOMAIN_BUCKETS = [
    {
        "name": "tax",
        "lawNameKeywords": [
            "Corporate Tax",
            "Value Added Tax",
            "Tax Procedures",
            "Excise Tax",
            "Federal Decree-Law No. 47 of 2022",
            "Federal Decree-Law No. 8 of 2017",
            "Federal Decree-Law No. 28 of 2022",
            "Federal Decree-Law No. 7 of 2017",
        ],
    },
    {
        "name": "labour",
        "lawNameKeywords": [
            "Labour Law",
            "Regulation of Labour Relations",
            "DIFC Employment",
        ],
    },
    {
        "name": "civil-commercial",
        "lawNameKeywords": [
            "Civil Transactions",
            "Commercial Transactions",
            "Commercial Companies",
            "Consumer Protection",
            "Commercial Agencies",
        ],
    },
    {
        "name": "banking",
        "lawNameKeywords": [
            "Central Bank",
            "Anti-Money Laundering",
            "Insurance Activities",
        ],
    },
]

DEFAULTS: Dict[str, Any] = {
    "evalSettings.goldenSet": "uae_v1",
    "evalSettings.retrievalK": 10,
    # 'fallback' = match expected articles by content regex (works on today's metadata);
    # 'metadata' = match via metadata.law_key/article_number (post Workstream A backfill).
    "evalSettings.matcherMode": "fallback",
    "evalSettings.judgeModel": "gpt-4o-mini",
    "evalSettings.judgePrompt": DEFAULT_JUDGE_PROMPT,
    "evalSettings.thresholds": DEFAULT_THRESHOLDS,
    "evalSettings.chatUrl": "http://localhost:8083/api/v2/chat",
    "evalSettings.seedDomainBuckets": DEFAULT_SEED_DOMAIN_BUCKETS,
}

_JSON_KEYS = {"evalSettings.thresholds", "evalSettings.seedDomainBuckets"}
_INT_KEYS = {"evalSettings.retrievalK"}


class EvalConfig:
    """Resolved eval configuration (defaults overlaid with settings rows)."""

    def __init__(self, values: Dict[str, Any], overrides: Dict[str, str]):
        self._values = values
        # settings keys that actually overrode a default (for reporting/debug)
        self.overridden_keys = sorted(overrides)

    def get(self, key: str) -> Any:
        if key not in self._values:
            raise KeyError(f"Unknown eval setting '{key}' (not in eval.config.DEFAULTS)")
        return self._values[key]

    @property
    def golden_set(self) -> str:
        return str(self.get("evalSettings.goldenSet"))

    @property
    def retrieval_k(self) -> int:
        return int(self.get("evalSettings.retrievalK"))

    @property
    def matcher_mode(self) -> str:
        return str(self.get("evalSettings.matcherMode"))

    @property
    def judge_model(self) -> str:
        return str(self.get("evalSettings.judgeModel"))

    @property
    def judge_prompt(self) -> str:
        return str(self.get("evalSettings.judgePrompt"))

    @property
    def thresholds(self) -> Dict[str, Any]:
        return dict(self.get("evalSettings.thresholds"))

    @property
    def chat_url(self) -> str:
        # Env override wins so CI/dev can retarget without writing to the shared DB.
        return os.environ.get("EVAL_CHAT_URL", "").strip() or str(self.get("evalSettings.chatUrl"))

    @property
    def seed_domain_buckets(self) -> list:
        return list(self.get("evalSettings.seedDomainBuckets"))


def _coerce(key: str, raw: str) -> Any:
    raw = (raw or "").strip()
    if key in _JSON_KEYS:
        return json.loads(raw)
    if key in _INT_KEYS:
        return int(raw)
    return raw


async def load_eval_config(conn: Optional[asyncpg.Connection] = None) -> EvalConfig:
    """Load eval config: DEFAULTS overlaid with any evalSettings.* rows from the
    settings table. Malformed override values raise (fail loudly, no silent mock)."""
    own_conn = conn is None
    if own_conn:
        conn = await asyncpg.connect(get_database_url())
    try:
        rows = await conn.fetch(
            "SELECT key, value FROM settings WHERE key LIKE 'evalSettings.%'"
        )
    finally:
        if own_conn:
            await conn.close()

    values: Dict[str, Any] = dict(DEFAULTS)
    overrides: Dict[str, str] = {}
    for row in rows:
        key = row["key"]
        if key not in DEFAULTS:
            # Unknown evalSettings.* rows are ignored (forward compatibility) but noted.
            continue
        try:
            values[key] = _coerce(key, row["value"])
            overrides[key] = row["value"]
        except (ValueError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Invalid value in settings row '{key}': {exc}") from exc
    return EvalConfig(values, overrides)


async def resolve_openai_key(conn: Optional[asyncpg.Connection] = None) -> Optional[str]:
    """OpenAI key resolution, same order as scripts/ingest_uae_law.py: settings row
    'openai.apiKey' is the source of truth (Hard Rule #1); env OPENAI_API_KEY is the
    local override. Returns None when neither is available (callers must degrade
    honestly, never fake an LLM call)."""
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if key:
        return key
    own_conn = conn is None
    if own_conn:
        conn = await asyncpg.connect(get_database_url())
    try:
        val = await conn.fetchval("SELECT value FROM settings WHERE key = 'openai.apiKey'")
    finally:
        if own_conn:
            await conn.close()
    val = (val or "").strip()
    return val or None
