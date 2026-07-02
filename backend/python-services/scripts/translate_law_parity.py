"""EN<->AR corpus-parity translation for single-language laws (trial scale).

For a law that exists in only one language in unified_embeddings
(source_table='uae_legislation'), reconstructs the text article by article,
translates each article with the settings-configured LLM, quality-gates the
result, re-chunks the TRANSLATED text with the standard article-aware chunker
(translation changes lengths, so chunk boundaries must be re-derived), embeds
and inserts it under the existing conventions:

    source_name = "<law_title> — <LANG> (translated)"
    metadata    = { ...same law_key as the source law (closes the EN<->AR
                    pairing gap), lang: <target>, translated: true,
                    mt_model, source_lang, source: "mt_parity" }

Settings (single-place defaults here, overridable via settings rows):
    translation.model         LLM used for translation (default gpt-4o-mini)
    translation.systemPrompt  legal-translator instructions
    openai.apiKey             provider key (Hard Rule #1)

Safety: aborts unless the DB is bookie_lsemb; --dry-run is the default (prints
per-article previews + gate results, writes nothing); --apply ingests.

Usage (from backend/python-services):
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/translate_law_parity.py \
      --law-key dubai_law:26:2007 [--apply]
  PYTHONUTF8=1 .venv/Scripts/python.exe scripts/translate_law_parity.py \
      --auto-smallest [--apply]      # smallest gap law in each direction
"""
import argparse
import asyncio
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import asyncpg
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[3] / ".env.lsemb")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.ingest_uae_law import (  # noqa: E402
    EMBED_MODEL, SOURCE_TABLE, chunk_by_article, embed, resolve_openai_key, vec,
)

DATABASE_URL = os.environ["DATABASE_URL"]

DEFAULT_TRANSLATION_MODEL = "gpt-4o-mini"
DEFAULT_TRANSLATION_SYSTEM_PROMPT = (
    "You are a professional legal translator for United Arab Emirates "
    "legislation. Translate the user's text from {source_language} to "
    "{target_language}. Rules: use formal legal register; preserve the "
    "article numbering format exactly (\"Article (N)\" in English, "
    "\"المادة (N)\" in Arabic); keep law names, law numbers, years, dates, "
    "monetary amounts and cited article numbers verbatim; do not summarize, "
    "omit or add anything. Output ONLY the translated text - no preamble, "
    "notes or quotes."
)
LANGUAGE_NAMES = {"en": "English", "ar": "Arabic"}
MAX_ARTICLE_PROMPT_CHARS = 9000  # per-article translation request bound


async def load_translation_settings(conn):
    model = await conn.fetchval(
        "SELECT value FROM settings WHERE key = 'translation.model'")
    prompt = await conn.fetchval(
        "SELECT value FROM settings WHERE key = 'translation.systemPrompt'")
    return (
        (model or "").strip() or DEFAULT_TRANSLATION_MODEL,
        (prompt or "").strip() or DEFAULT_TRANSLATION_SYSTEM_PROMPT,
    )


async def gap_laws(conn):
    """Laws present in exactly one language, with size (chars)."""
    rows = await conn.fetch("""
        SELECT metadata->>'law_key' AS law_key,
               array_agg(DISTINCT metadata->>'lang') AS langs,
               sum(length(content))::int AS chars,
               min(metadata->>'law_title') AS law_title
        FROM unified_embeddings
        WHERE source_table = $1 AND metadata ? 'law_key'
        GROUP BY 1 HAVING count(DISTINCT metadata->>'lang') = 1
        ORDER BY 3
    """, SOURCE_TABLE)
    return [dict(r) for r in rows]


async def load_source_articles(conn, law_key, source_lang):
    """Reconstruct article-ordered text blocks for the source law.

    Consecutive chunks of the same article are joined (continuation chunks
    carry article_number_source='inherited'); front-matter chunks without an
    article number become their own leading block.
    """
    rows = await conn.fetch("""
        SELECT content, metadata->>'article_number' AS article,
               metadata->>'article_number_source' AS art_src,
               metadata->>'law' AS law_name, metadata->>'url' AS url,
               metadata->>'law_title' AS law_title,
               metadata->>'law_type' AS law_type,
               metadata->>'law_number' AS law_number,
               metadata->>'law_year' AS law_year,
               metadata->>'issue_date' AS issue_date
        FROM unified_embeddings
        WHERE source_table = $1 AND metadata->>'law_key' = $2
          AND metadata->>'lang' = $3
        ORDER BY (metadata->>'article_index')::int
    """, SOURCE_TABLE, law_key, source_lang)
    if not rows:
        return [], {}

    blocks = []  # (article_number|None, text)
    for r in rows:
        text = r["content"].strip()
        if not text:
            continue
        art = r["article"]
        if blocks and art and blocks[-1][0] == art and r["art_src"] == "inherited":
            # Continuation chunk: drop the chunker's word-aligned overlap by
            # locating the previous block's tail inside this chunk head.
            prev = blocks[-1][1]
            tail = prev[-200:]
            pos = text.find(tail[-80:]) if len(tail) >= 80 else -1
            merged = prev + ("\n" + text[pos + 80:] if pos >= 0 else "\n" + text)
            blocks[-1] = (art, merged)
        else:
            blocks.append((art, text))

    law_meta = {
        "law_name": rows[0]["law_name"],
        "law_title": rows[0]["law_title"],
        "law_type": rows[0]["law_type"],
        "law_number": rows[0]["law_number"],
        "law_year": rows[0]["law_year"],
        "issue_date": rows[0]["issue_date"],
        "url": rows[0]["url"],
    }
    return blocks, law_meta


def translate_block(client, model, system_prompt, text, source_lang, target_lang):
    prompt = system_prompt.format(
        source_language=LANGUAGE_NAMES[source_lang],
        target_language=LANGUAGE_NAMES[target_lang],
    )
    resp = client.chat.completions.create(
        model=model,
        temperature=0,
        messages=[{"role": "system", "content": prompt},
                  {"role": "user", "content": text[:MAX_ARTICLE_PROMPT_CHARS]}],
    )
    usage = resp.usage
    return resp.choices[0].message.content.strip(), (usage.prompt_tokens, usage.completion_tokens)


def script_ratio(text, script="ar"):
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    arabic = sum(1 for c in letters if "؀" <= c <= "ۿ")
    return (arabic / len(letters)) if script == "ar" else ((len(letters) - arabic) / len(letters))


def quality_gate(source_blocks, translated_blocks, target_lang):
    """Returns (ok, list of failure strings)."""
    failures = []
    if len(source_blocks) != len(translated_blocks):
        failures.append(f"block-count mismatch: {len(source_blocks)} source vs {len(translated_blocks)} translated")
    ar_ratio_min, en_latin_min = 0.70, 0.90
    for i, ((art, src), out) in enumerate(zip(source_blocks, translated_blocks)):
        ratio = len(out) / max(len(src), 1)
        if not (0.4 <= ratio <= 2.5):
            failures.append(f"block {i} (art {art}): length ratio {ratio:.2f} outside 0.4-2.5")
        if target_lang == "ar" and script_ratio(out, "ar") < ar_ratio_min:
            failures.append(f"block {i} (art {art}): only {script_ratio(out, 'ar')*100:.0f}% Arabic letters")
        if target_lang == "en" and script_ratio(out, "en") < en_latin_min:
            failures.append(f"block {i} (art {art}): only {script_ratio(out, 'en')*100:.0f}% Latin letters")
    return (not failures), failures


async def ingest_translation(conn, law_key, law_meta, target_lang, full_text,
                             mt_model, source_lang):
    """Chunk + embed + insert the translated law (idempotent per source_name)."""
    from services.law_metadata_parser import extract_article_number

    client = OpenAI(api_key=await resolve_openai_key())
    title = law_meta.get("law_title") or law_meta.get("law_name") or law_key
    source_name = f"{title} — {target_lang.upper()} (translated)"

    chunks = chunk_by_article(full_text, target_lang)
    print(f"  translated text -> {len(chunks)} chunks | sample: {chunks[0][:80]!r}")
    embs = embed(client, chunks)

    async with conn.transaction():
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext('uae_legislation_ingest'))")
        deleted = await conn.execute(
            "DELETE FROM unified_embeddings WHERE source_table=$1 AND source_name=$2",
            SOURCE_TABLE, source_name)
        print(f"  cleared prior rows: {deleted}")
        base = await conn.fetchval(
            "SELECT COALESCE(MAX(source_id), -1) + 1 FROM unified_embeddings WHERE source_table=$1",
            SOURCE_TABLE)
        last_article = None
        for idx, (ch, e) in enumerate(zip(chunks, embs)):
            meta = {
                "source": "mt_parity", "law": source_name, "article_index": idx,
                "url": law_meta.get("url"), "lang": target_lang,
                "translated": True, "mt_model": mt_model, "source_lang": source_lang,
                "law_key": law_key, "law_type": law_meta.get("law_type"),
                "law_number": law_meta.get("law_number"),
                "law_year": law_meta.get("law_year"), "law_title": title,
                "meta_backfill_version": 1,
            }
            if law_meta.get("issue_date"):
                meta["issue_date"] = law_meta["issue_date"]
            article = extract_article_number(ch, target_lang)
            if article:
                meta["article_number"] = article
                meta["article_number_source"] = "header"
                last_article = article
            elif last_article:
                meta["article_number"] = last_article
                meta["article_number_source"] = "inherited"
            await conn.execute(
                """INSERT INTO unified_embeddings
                   (source_table, source_type, source_id, source_name, content, embedding,
                    model_used, metadata, created_at, updated_at)
                   VALUES ($1,'document',$2,$3,$4,$5::vector, $6, $7::jsonb, now(), now())""",
                SOURCE_TABLE, base + idx, source_name, ch, vec(e), EMBED_MODEL,
                json.dumps(meta, ensure_ascii=False))
    print(f"  inserted {len(chunks)} rows as {source_name!r}")
    return len(chunks)


async def process_law(conn, client, model, system_prompt, law, apply):
    law_key = law["law_key"]
    source_lang = law["langs"][0]
    target_lang = "en" if source_lang == "ar" else "ar"
    print(f"\n=== {law_key} ({law.get('law_title') or ''}) | {source_lang} -> {target_lang} "
          f"| {law['chars']} chars ===")

    blocks, law_meta = await load_source_articles(conn, law_key, source_lang)
    if not blocks:
        print("  no source blocks found - skipping")
        return False
    print(f"  source blocks: {len(blocks)} "
          f"({sum(1 for a, _ in blocks if a)} with article numbers)")

    translated = []
    in_tokens = out_tokens = 0
    for i, (art, text) in enumerate(blocks):
        out, (pi, po) = translate_block(client, model, system_prompt, text,
                                        source_lang, target_lang)
        in_tokens += pi
        out_tokens += po
        translated.append(out)
        if i < 2:
            print(f"  [preview art {art}] {out[:140]!r}")

    ok, failures = quality_gate(blocks, translated, target_lang)
    print(f"  quality gate: {'PASS' if ok else 'FAIL'} | tokens in/out: {in_tokens}/{out_tokens}")
    for f in failures[:8]:
        print(f"    GATE: {f}")
    if not ok:
        print("  ABORT: not ingesting this law")
        return False

    if not apply:
        print("  dry-run: gates passed; rerun with --apply to ingest")
        return True

    full_text = "\n\n".join(translated)
    await ingest_translation(conn, law_key, law_meta, target_lang, full_text,
                             model, source_lang)
    return True


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--law-key", action="append", default=[],
                    help="law_key to translate (repeatable)")
    ap.add_argument("--auto-smallest", action="store_true",
                    help="pick the smallest single-language law in each direction")
    ap.add_argument("--apply", action="store_true", help="ingest (default: dry-run)")
    args = ap.parse_args()

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        db = await conn.fetchval("SELECT current_database()")
        print(f"connected DB: {db} | mode: {'APPLY' if args.apply else 'DRY-RUN'}")
        if args.apply and db != "bookie_lsemb":
            print("ABORT: not bookie_lsemb - refusing to write")
            return 2

        gaps = await gap_laws(conn)
        by_key = {g["law_key"]: g for g in gaps}
        selected = []
        if args.auto_smallest:
            for direction in ("ar", "en"):
                pick = next((g for g in gaps if g["langs"] == [direction]), None)
                if pick:
                    selected.append(pick)
        for key in args.law_key:
            if key in by_key:
                selected.append(by_key[key])
            else:
                print(f"WARN: {key} is not a single-language law (or unknown) - skipped")
        if not selected:
            print("Nothing selected. Single-language laws (smallest first):")
            for g in gaps[:20]:
                print(f"  {g['law_key']:<40} only {g['langs'][0]} | {g['chars']} chars | {g.get('law_title') or ''}")
            return 1

        model, system_prompt = await load_translation_settings(conn)
        print(f"translation model: {model}")
        client = OpenAI(api_key=await resolve_openai_key())

        ok_count = 0
        for law in selected:
            if await process_law(conn, client, model, system_prompt, law, args.apply):
                ok_count += 1
        print(f"\ndone: {ok_count}/{len(selected)} laws {'ingested' if args.apply else 'passed dry-run'}")
        return 0 if ok_count == len(selected) else 1
    finally:
        await conn.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
