"""Golden-set seeder (semi-automatic, read-only against the corpus).

Stratified sampling over `unified_embeddings` (source_table='uae_legislation'):
per seed domain bucket (evalSettings.seedDomainBuckets) it selects laws whose
name matches the bucket keywords, pairs each law's EN and AR versions via a
"<type>-<number>-<year>" key parsed from the source name, picks articles present
in BOTH language versions whose chunks state a concrete rule (number /
percentage / deadline), and asks the judge model (evalSettings.judgeModel,
temperature 0) to draft one question per language testing the same legal point,
plus answer facets. A few gov-services items (source_table='uae_gov_services')
and hand-written adversarial items are appended.

The ONLY output is the draft JSON (default eval/golden/<goldenSet>.draft.json).
The database is never written to. If no OpenAI key is available (settings
'openai.apiKey' / env OPENAI_API_KEY), questions are derived heuristically from
the article headings and flagged in `notes` — no fake LLM calls.

Usage (from backend/python-services, PYTHONUTF8=1):
    python -m eval.seed_golden [--out PATH] [--target-pairs N] [--no-llm]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import asyncpg

from eval.config import GOLDEN_DIR, get_database_url, load_eval_config, resolve_openai_key
from eval.matchers import extract_article_numbers, looks_substantive, normalize_for_matching

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SOURCE_TABLE = "uae_legislation"
GOV_TABLE = "uae_gov_services"
MAX_ITEMS_PER_LAW = 4
MIN_CHUNK_LEN = 400
LLM_CHUNK_CHARS = 3500

# --- Hand-written adversarial items (content data, human-authored by design) ---

ADVERSARIAL_ITEMS: List[Dict[str, Any]] = [
    {
        "id": "adv-out-of-corpus-en",
        "lang": "en",
        "domain": "adversarial",
        "question": "What penalties does the UAE Space Law impose for launching a satellite without a licence?",
        "paired_with": None,
        "expected": {
            "law_name_contains": None,
            "law_key": None,
            "article_no": None,
            "answer_must_contain": [],
            "answer_must_not_contain": ["Article"],
            "expect_refusal": True,
        },
        "tags": ["adversarial", "out-of-corpus"],
        "notes": "Hand-written. The corpus contains no space legislation; the evidence gate (minScore 0.55) should trigger a refusal.",
    },
    {
        "id": "adv-out-of-corpus-ar",
        "lang": "ar",
        "domain": "adversarial",
        "question": "ما هي العقوبات التي يفرضها قانون الفضاء الإماراتي على إطلاق قمر صناعي دون ترخيص؟",
        "paired_with": None,
        "expected": {
            "law_name_contains": None,
            "law_key": None,
            "article_no": None,
            "answer_must_contain": [],
            "answer_must_not_contain": ["المادة"],
            "expect_refusal": True,
        },
        "tags": ["adversarial", "out-of-corpus"],
        "notes": "Hand-written. Arabic twin of adv-out-of-corpus-en; expects a refusal.",
    },
    {
        "id": "adv-nonexistent-article-en",
        "lang": "en",
        "domain": "adversarial",
        "question": "What does Article 999 of the UAE Labour Law say?",
        "paired_with": None,
        "expected": {
            "law_name_contains": None,
            "law_key": None,
            "article_no": None,
            "answer_must_contain": [],
            "answer_must_not_contain": ["Article 999"],
            "expect_refusal": True,
        },
        "tags": ["adversarial", "nonexistent-article"],
        "notes": "Hand-written trap. Federal Decree-Law No. 33 of 2021 has no Article 999; the answer must not fabricate one.",
    },
    {
        "id": "adv-nonexistent-article-ar",
        "lang": "ar",
        "domain": "adversarial",
        "question": "ماذا تنص المادة 999 من قانون العمل الإماراتي؟",
        "paired_with": None,
        "expected": {
            "law_name_contains": None,
            "law_key": None,
            "article_no": None,
            "answer_must_contain": [],
            "answer_must_not_contain": ["المادة 999"],
            "expect_refusal": True,
        },
        "tags": ["adversarial", "nonexistent-article"],
        "notes": "Hand-written trap. Arabic twin of adv-nonexistent-article-en.",
    },
    {
        "id": "adv-cross-language-rera-en",
        "lang": "en",
        "domain": "adversarial",
        "question": "Which Dubai law established the Real Estate Regulatory Agency (RERA), and in which year was it issued?",
        "paired_with": None,
        "expected": {
            "law_name_contains": "Real Estate Regulatory Agency",
            "law_key": None,
            "article_no": None,
            "answer_must_contain": ["16", "2007"],
            "answer_must_not_contain": [],
            "expect_refusal": False,
        },
        "tags": ["adversarial", "cross-language"],
        "notes": "Hand-written cross-language probe: the RERA law exists only as an Arabic document; an English question must still retrieve it.",
    },
]

# --- Law pairing helpers ---

_TYPE_DISCRIMINATORS: List[Tuple[str, str]] = [
    ("executive regulation", "er"),
    ("cabinet decision", "cabdec"),
    ("cabinet resolution", "cabres"),
    ("cabinet of ministers resolution", "cabres"),
    ("ministerial decision", "md"),
    ("federal tax authority decision", "ftadec"),
    ("fta decision", "ftadec"),
]

_NUM_YEAR = re.compile(r"no\W{0,3}0*(\d{1,3})\D{0,15}?((?:19|20)\d{2})")


def pair_key(source_name: str) -> Optional[str]:
    """'<type>-<number>-<year>' key used to pair the EN and AR versions of the
    same instrument. None when no 'No. N ... YYYY' pattern is present."""
    low = source_name.lower().replace("-", " ").replace("_", " ")
    typ = next((t for pat, t in _TYPE_DISCRIMINATORS if pat in low), "law")
    m = _NUM_YEAR.search(low)
    if not m:
        return None
    return f"{typ}-{int(m.group(1))}-{m.group(2)}"


def law_name_needle(source_name: str) -> str:
    """A distinctive, duplicate-tolerant substring for expected.law_name_contains.
    Prefers the 'No. N of YYYY' fragment (shared by different consolidations of
    the same instrument); falls back to the full source name."""
    m = _NUM_YEAR.search(source_name.lower().replace("-", " ").replace("_", " "))
    if m:
        num, year = int(m.group(1)), m.group(2)
        for variant in (f"No. {num} of {year}", f"No {num} of {year}", f"No.{num} of {year}"):
            if variant.lower() in source_name.lower():
                return variant
    return source_name


def display_title(source_name: str) -> str:
    """Human-readable law title for question phrasing (strips lang suffixes)."""
    t = re.sub(r"\s*[—-]+\s*(EN|AR)(\s*\(translated\))?\s*$", "", source_name, flags=re.IGNORECASE)
    return t.strip()


def slugify(source_name: str, max_words: int = 4) -> str:
    words = re.findall(r"[a-z0-9]+", display_title(source_name).lower())
    stop = {"the", "of", "and", "on", "law", "no", "federal", "decree", "concerning"}
    kept = [w for w in words if w not in stop][:max_words]
    return "-".join(kept) or "law"


# --- Chunk candidate selection ---

def candidate_articles(chunks: List[Dict[str, Any]], lang: str) -> Dict[str, Dict[str, Any]]:
    """Map article_no -> best candidate chunk for one law in one language.
    A candidate chunk mentions the article, states a concrete rule, is long
    enough to be substantive, and does not look like a table of contents."""
    best: Dict[str, Dict[str, Any]] = {}
    max_refs = 6 if lang == "ar" else 4
    for ch in chunks:
        content = ch["content"] or ""
        if len(content) < MIN_CHUNK_LEN or not looks_substantive(content):
            continue
        nums = extract_article_numbers(content, lang)
        if not nums or len(nums) > max_refs:
            continue
        norm = normalize_for_matching(content)
        for n in nums:
            pos = norm.find(n)
            pos = pos if pos >= 0 else 10_000
            prev = best.get(n)
            if prev is None or pos < prev["marker_pos"]:
                best[n] = {
                    "content": content,
                    "source_id": ch["source_id"],
                    "marker_pos": pos,
                }
    return best


async def fetch_law_chunks(conn: asyncpg.Connection, source_name: str) -> List[Dict[str, Any]]:
    rows = await conn.fetch(
        "SELECT source_id, content FROM unified_embeddings "
        "WHERE source_table = $1 AND source_name = $2 ORDER BY source_id",
        SOURCE_TABLE, source_name,
    )
    return [dict(r) for r in rows]


async def bucket_laws(conn: asyncpg.Connection, keywords: List[str]) -> List[Dict[str, str]]:
    conditions = " OR ".join(f"source_name ILIKE ${i + 1}" for i in range(len(keywords)))
    rows = await conn.fetch(
        f"SELECT DISTINCT source_name, metadata->>'lang' AS lang FROM unified_embeddings "
        f"WHERE source_table = '{SOURCE_TABLE}' AND ({conditions}) ORDER BY source_name",
        *[f"%{kw}%" for kw in keywords],
    )
    return [dict(r) for r in rows]


def pair_bucket_laws(laws: List[Dict[str, str]]) -> List[Tuple[str, str]]:
    """(en_source_name, ar_source_name) pairs, deterministic order."""
    by_key: Dict[str, Dict[str, List[str]]] = {}
    for law in laws:
        key = pair_key(law["source_name"])
        if not key:
            continue
        by_key.setdefault(key, {}).setdefault(law["lang"], []).append(law["source_name"])
    pairs: List[Tuple[str, str]] = []
    for key in sorted(by_key):
        langs = by_key[key]
        if langs.get("en") and langs.get("ar"):
            # On duplicate consolidations prefer the shortest (canonical) name.
            en = sorted(langs["en"], key=lambda s: (len(s), s))[0]
            ar = sorted(langs["ar"], key=lambda s: (len(s), s))[0]
            pairs.append((en, ar))
    return pairs


# --- LLM drafting ---

class Drafter:
    """Draft questions/facets with the judge model; falls back to heuristic
    drafting (flagged in notes) when no API key is available."""

    def __init__(self, api_key: Optional[str], model: str):
        self.model = model
        self.usage = {"prompt_tokens": 0, "completion_tokens": 0, "calls": 0}
        self.client = None
        if api_key:
            from openai import OpenAI  # imported lazily; only needed with a key
            self.client = OpenAI(api_key=api_key)

    @property
    def llm_enabled(self) -> bool:
        return self.client is not None

    def _chat_json(self, prompt: str) -> Optional[Dict[str, Any]]:
        resp = self.client.chat.completions.create(
            model=self.model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system",
                 "content": "You write evaluation questions for a UAE-law RAG system. Respond with JSON only."},
                {"role": "user", "content": prompt},
            ],
        )
        if resp.usage:
            self.usage["prompt_tokens"] += resp.usage.prompt_tokens or 0
            self.usage["completion_tokens"] += resp.usage.completion_tokens or 0
        self.usage["calls"] += 1
        try:
            return json.loads(resp.choices[0].message.content)
        except (json.JSONDecodeError, TypeError):
            return None

    def draft_pair(self, article_no: str, en_title: str, ar_title: str,
                   en_chunk: str, ar_chunk: str) -> Tuple[Dict[str, Any], Dict[str, Any], str]:
        """Returns (en_draft, ar_draft, notes); each draft has question + answer_must_contain."""
        if self.llm_enabled:
            prompt = (
                f"Below are the English and Arabic texts covering Article ({article_no}) of the same UAE law: "
                f"{en_title}.\n"
                "Write ONE evaluation question per language testing THE SAME legal point, answerable solely from "
                "the given text. Target a concrete rule (a number, percentage, deadline, amount or obligation) "
                "stated in the text. Phrase each question the way a real user would ask it (English question in "
                "English, Arabic question in Arabic); never refer to 'the text' or 'the excerpt'.\n"
                "For each language also list 2-4 short answer facets: exact substrings (numbers, percentages, key "
                "legal terms, in that language) that MUST appear in a correct answer.\n"
                'Return JSON: {"en": {"question": "...", "answer_must_contain": ["..."]}, '
                '"ar": {"question": "...", "answer_must_contain": ["..."]}}\n\n'
                f"ENGLISH TEXT (from: {en_title}):\n{en_chunk[:LLM_CHUNK_CHARS]}\n\n"
                f"ARABIC TEXT (from: {ar_title}):\n{ar_chunk[:LLM_CHUNK_CHARS]}"
            )
            data = self._chat_json(prompt)
            if (data and isinstance(data.get("en"), dict) and isinstance(data.get("ar"), dict)
                    and data["en"].get("question") and data["ar"].get("question")):
                return data["en"], data["ar"], "LLM-drafted, needs human verification"
            notes = "Heuristic draft (LLM returned unusable JSON), needs human verification"
        else:
            notes = "Heuristic draft (no LLM key available), needs human verification"
        en = {"question": f"What does Article ({article_no}) of the {en_title} provide?",
              "answer_must_contain": _heuristic_facets(en_chunk)}
        ar = {"question": f"ماذا تنص المادة ({article_no}) من {ar_title}؟",
              "answer_must_contain": _heuristic_facets(ar_chunk)}
        return en, ar, notes

    def draft_single(self, lang: str, source_title: str, chunk: str) -> Tuple[Dict[str, Any], str]:
        if self.llm_enabled:
            lang_name = "Arabic" if lang == "ar" else "English"
            prompt = (
                f"Below is a UAE government-services page excerpt: {source_title}.\n"
                f"Write ONE evaluation question in {lang_name}, answerable solely from the excerpt, targeting a "
                "concrete fact (a number, deadline, fee, eligibility rule or named authority). Phrase it the way a "
                "real user would ask it; never refer to 'the text' or 'the excerpt'.\n"
                f"Also list 2-4 short answer facets: exact substrings (in {lang_name}) that MUST appear in a "
                "correct answer.\n"
                'Return JSON: {"question": "...", "answer_must_contain": ["..."]}\n\n'
                f"EXCERPT:\n{chunk[:LLM_CHUNK_CHARS]}"
            )
            data = self._chat_json(prompt)
            if data and data.get("question"):
                return data, "LLM-drafted, needs human verification"
            notes = "Heuristic draft (LLM returned unusable JSON), needs human verification"
        else:
            notes = "Heuristic draft (no LLM key available), needs human verification"
        topic = source_title.split("|")[0].strip()
        question = (f"ما الذي توضحه صفحة \"{topic}\" الرسمية؟" if lang == "ar"
                    else f"What does the official page \"{topic}\" explain?")
        return {"question": question, "answer_must_contain": _heuristic_facets(chunk)}, notes


def _heuristic_facets(chunk: str) -> List[str]:
    """Numbers/percentages pulled straight from the chunk as answer facets."""
    norm = normalize_for_matching(chunk)
    facets: List[str] = []
    for m in re.finditer(r"\d+(?:\.\d+)?\s*%|AED\s*[\d,]+|\d+\s*(?:days?|months?|years?)", norm, re.IGNORECASE):
        tok = m.group(0).strip()
        if tok not in facets:
            facets.append(tok)
        if len(facets) >= 3:
            break
    return facets


# --- Main seeding flow ---

def _quotas(bucket_names: List[str], target_pairs: int) -> Dict[str, int]:
    base, rem = divmod(target_pairs, len(bucket_names))
    return {name: base + (1 if i < rem else 0) for i, name in enumerate(bucket_names)}


async def seed(out_path: Path, target_pairs: int, use_llm: bool) -> int:
    conn = await asyncpg.connect(get_database_url())
    try:
        db = await conn.fetchval("SELECT current_database()")
        print(f"connected DB: {db} (read-only usage)")
        cfg = await load_eval_config(conn)
        api_key = await resolve_openai_key(conn) if use_llm else None
        if use_llm and not api_key:
            print("WARN: no OpenAI key in settings 'openai.apiKey' or env OPENAI_API_KEY "
                  "— falling back to heuristic drafting (flagged in notes)")
        drafter = Drafter(api_key, cfg.judge_model)

        buckets = cfg.seed_domain_buckets
        quotas = _quotas([b["name"] for b in buckets], target_pairs)
        items: List[Dict[str, Any]] = []
        pair_count = 0

        for bucket in buckets:
            name, keywords = bucket["name"], bucket["lawNameKeywords"]
            quota = quotas[name]
            laws = await bucket_laws(conn, keywords)
            pairs = pair_bucket_laws(laws)
            print(f"\n[{name}] laws matched: {len(laws)}, EN/AR pairs: {len(pairs)}, quota: {quota}")
            taken = 0
            for en_name, ar_name in pairs:
                if taken >= quota:
                    break
                en_cands = candidate_articles(await fetch_law_chunks(conn, en_name), "en")
                ar_cands = candidate_articles(await fetch_law_chunks(conn, ar_name), "ar")
                common = sorted(set(en_cands) & set(ar_cands), key=lambda x: int(x))
                # Prefer operative articles over definitions/objectives (1-2) when possible.
                preferred = [n for n in common if int(n) > 2] or common
                # Rank by how close the article marker is to the chunk start on both sides.
                preferred.sort(key=lambda n: en_cands[n]["marker_pos"] + ar_cands[n]["marker_pos"])
                take = preferred[:min(MAX_ITEMS_PER_LAW, quota - taken)]
                if not take:
                    print(f"  - {en_name[:70]}: no common substantive articles, skipping")
                    continue
                slug = slugify(en_name)
                for art_no in take:
                    en_id = f"{name}-{slug}-art{art_no}-en"
                    ar_id = f"{name}-{slug}-art{art_no}-ar"
                    en_draft, ar_draft, notes = drafter.draft_pair(
                        art_no, display_title(en_name), display_title(ar_name),
                        en_cands[art_no]["content"], ar_cands[art_no]["content"],
                    )
                    for lang, iid, paired, law, draft, cand in (
                        ("en", en_id, ar_id, en_name, en_draft, en_cands[art_no]),
                        ("ar", ar_id, en_id, ar_name, ar_draft, ar_cands[art_no]),
                    ):
                        items.append({
                            "id": iid,
                            "lang": lang,
                            "domain": name,
                            "question": draft["question"],
                            "paired_with": paired,
                            "expected": {
                                "law_name_contains": law_name_needle(law),
                                "law_key": None,
                                "article_no": art_no,
                                "answer_must_contain": draft.get("answer_must_contain") or [],
                                "answer_must_not_contain": [],
                                "expect_refusal": False,
                            },
                            "tags": ["single-hop"],
                            "notes": notes,
                            "seed": {"source_name": law, "source_id": cand["source_id"]},
                        })
                    taken += 1
                    pair_count += 1
                print(f"  - {en_name[:70]}: articles {take}")
            if taken < quota:
                print(f"  [{name}] filled {taken}/{quota} pairs")

        # --- gov-services items (2 EN + 1 AR) ---
        for lang, count in (("en", 2), ("ar", 1)):
            rows = await conn.fetch(
                "SELECT source_id, source_name, content FROM unified_embeddings "
                "WHERE source_table = $1 AND metadata->>'lang' = $2 "
                "AND length(content) BETWEEN 700 AND 2500 "
                "ORDER BY md5(id::text) LIMIT 20",
                GOV_TABLE, lang,
            )
            picked = [r for r in rows if looks_substantive(r["content"])][:count] or [dict(r) for r in rows[:count]]
            for i, row in enumerate(picked, start=1):
                draft, notes = drafter.draft_single(lang, row["source_name"], row["content"])
                items.append({
                    "id": f"gov-services-{lang}-{i}",
                    "lang": lang,
                    "domain": "gov-services",
                    "question": draft["question"],
                    "paired_with": None,
                    "expected": {
                        "law_name_contains": row["source_name"],
                        "law_key": None,
                        "article_no": None,
                        "answer_must_contain": draft.get("answer_must_contain") or [],
                        "answer_must_not_contain": [],
                        "expect_refusal": False,
                    },
                    "tags": ["gov-services"],
                    "notes": notes,
                    "seed": {"source_name": row["source_name"], "source_id": row["source_id"]},
                })

        items.extend(ADVERSARIAL_ITEMS)

        doc = {
            "version": 1,
            "goldenSet": cfg.golden_set,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generator": {
                "script": "eval.seed_golden",
                "judge_model": cfg.judge_model if drafter.llm_enabled else None,
                "llm_usage": drafter.usage if drafter.llm_enabled else None,
                "law_pairs": pair_count,
                "status": "DRAFT — every non-adversarial item needs human verification",
            },
            "items": items,
        }
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)

        n_en = sum(1 for i in items if i["lang"] == "en")
        n_ar = sum(1 for i in items if i["lang"] == "ar")
        print(f"\nWrote {out_path}")
        print(f"items: {len(items)} total | en={n_en} ar={n_ar} | law pairs={pair_count} "
              f"| gov-services=3 | adversarial={len(ADVERSARIAL_ITEMS)}")
        if drafter.llm_enabled:
            u = drafter.usage
            print(f"LLM usage ({cfg.judge_model}): {u['calls']} calls, "
                  f"{u['prompt_tokens']} prompt + {u['completion_tokens']} completion tokens")
        return 0
    finally:
        await conn.close()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", help="Output draft path (default eval/golden/<goldenSet>.draft.json)")
    p.add_argument("--target-pairs", type=int, default=18,
                   help="Target number of EN/AR question pairs (default 18)")
    p.add_argument("--no-llm", action="store_true", help="Force heuristic drafting (no LLM calls)")
    args = p.parse_args()

    async def _run() -> int:
        cfg = await load_eval_config()
        out = Path(args.out) if args.out else GOLDEN_DIR / f"{cfg.golden_set}.draft.json"
        return await seed(out, args.target_pairs, use_llm=not args.no_llm)

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
