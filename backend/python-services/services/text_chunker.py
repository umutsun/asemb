"""
Shared, word/sentence-aware text chunker.

Every ingest path used to slice text by raw character index (``text[i:i+size]``) and
only look for a sentence boundary in the trailing half of the window; when none was
found it cut mid-word. That produced ugly citation excerpts (e.g. "iability Company ...")
and noisy embeddings. This module centralises one correct splitter so the four callers
(`ingest_uae_law._size_split`, `crawl_sites.chunks_of`, `media_ingestion._chunk_text`,
`chunk_laws_by_article`) stop diverging.

Guarantees of ``split_text``:
  * A chunk never starts or ends inside a word — we back off to the nearest whitespace.
  * We prefer a real sentence / paragraph boundary; only if none exists in the tail do
    we fall back to a word boundary, and only if the window has no whitespace at all do
    we hard-cut (a single over-long token).
  * The overlap that seeds the next chunk is aligned to a word start, so no chunk begins
    mid-word either.

Unicode-aware: works for Arabic (space-delimited script) as well as Latin. Terminators
include the Arabic question mark (؟); the Arabic full stop is the ASCII '.'.
"""
from __future__ import annotations

import re
from typing import List

# Sentence terminators. The Arabic full stop is the ASCII '.', so it is already covered;
# '؟' (U+061F) is the Arabic question mark.
_SENTENCE_TERMINATORS = (".", "!", "?", "؟")


def _last_sentence_boundary(window: str, min_frac: float) -> int:
    """Index (exclusive) just after the last sentence terminator in ``window`` that sits
    past ``min_frac`` of the window, or -1 if there is none. A terminator counts only when
    followed by whitespace / end-of-window; a bare "\\n\\n" paragraph break also counts."""
    threshold = len(window) * min_frac
    for idx in range(len(window) - 1, 0, -1):
        ch = window[idx]
        if ch in _SENTENCE_TERMINATORS:
            nxt = window[idx + 1] if idx + 1 < len(window) else " "
            if nxt.isspace():
                # Positions only shrink as we walk backwards, so once we drop past the
                # threshold there is nothing better further back.
                return idx + 1 if idx + 1 > threshold else -1
        elif ch == "\n" and idx + 1 < len(window) and window[idx + 1] == "\n":
            return idx + 1 if idx + 1 > threshold else -1
    return -1


def _last_word_boundary(window: str, min_frac: float) -> int:
    """Index (exclusive) at the last whitespace in ``window`` past ``min_frac``, so the
    chunk keeps only whole words. Returns -1 when the only whitespace is in the first
    half (i.e. a single very long token) — the caller then hard-cuts."""
    threshold = len(window) * min_frac
    for idx in range(len(window) - 1, -1, -1):
        if window[idx].isspace():
            return idx if idx > threshold else -1
    return -1


def _advance_to_word_start(text: str, pos: int, limit: int) -> int:
    """If ``pos`` lands inside a word, move forward past that partial word and the
    following whitespace so the next chunk begins on a whole word. Never advances beyond
    ``limit`` (the current chunk end), so overlap alignment can at worst drop the overlap."""
    n = len(text)
    if pos <= 0 or pos >= n or text[pos - 1].isspace():
        return pos
    j = pos
    while j < limit and not text[j].isspace():
        j += 1
    while j < limit and text[j].isspace():
        j += 1
    return j


def split_text(text: str, size: int, overlap: int = 0, min_len: int = 1) -> List[str]:
    """Split ``text`` into <= ``size``-char chunks on word/sentence boundaries.

    Args:
        text:    source text (already cleaned/normalised by the caller).
        size:    hard upper bound on chunk length in characters.
        overlap: characters to carry into the next chunk; aligned forward to a word start.
        min_len: drop chunks shorter than this after stripping (callers keep their own
                 threshold, e.g. 40 for law text, 60 for crawled pages).

    Returns a list of stripped chunks; no chunk starts or ends mid-word (except a lone
    token longer than ``size``, which has no whitespace to break on).
    """
    text = (text or "").strip()
    if not text:
        return []

    n = len(text)
    if n <= size:
        return [text] if len(text) >= min_len else []

    chunks: List[str] = []
    i = 0
    while i < n:
        end = min(i + size, n)
        if end < n:
            window = text[i:end]
            cut = _last_sentence_boundary(window, 0.5)
            if cut == -1:
                cut = _last_word_boundary(window, 0.5)
            if cut != -1:
                end = i + cut
            # else: no whitespace in the window -> a single over-long token; hard-cut at `end`.

        seg = text[i:end].strip()
        if len(seg) >= min_len:
            chunks.append(seg)

        if end >= n:
            break

        # Seed the next chunk with `overlap` chars, but start it on a whole word.
        next_start = end - overlap if overlap > 0 else end
        if next_start <= i:
            next_start = end
        else:
            next_start = _advance_to_word_start(text, next_start, end)
            if next_start <= i:
                next_start = end
        i = next_start

    return chunks


def truncate_at_word(text: str, max_len: int, suffix: str = " ...") -> str:
    """Truncate ``text`` to at most ``max_len`` chars on a whitespace boundary, appending
    ``suffix``. Falls back to a hard cut only if there is no whitespace before ``max_len``."""
    if len(text) <= max_len:
        return text
    last_ws = None
    for m in re.finditer(r"\s", text[:max_len]):
        last_ws = m
    cut = last_ws.start() if last_ws else max_len
    return text[:cut].rstrip() + suffix
