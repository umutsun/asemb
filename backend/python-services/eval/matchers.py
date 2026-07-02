"""Article / law matching helpers shared by the golden-set seeder and the
retrieval runner.

Matcher modes (evalSettings.matcherMode):
- 'fallback' (today): the corpus metadata has no structured law_key/article_number
  yet, so expected articles are matched by a content regex and expected laws by a
  case-insensitive substring on the result title / source name / metadata.law.
- 'metadata' (post Workstream A backfill): match via metadata.law_key and
  metadata.article_number.

Arabic notes: article numbers may use Arabic-Indic digits (0-9 as ٠-٩), and
several source PDFs extract with RTL artifacts — the word "المادة" (al-madda, "the
article") can appear with swapped lam/meem ("املادة"), tatweel padding, and the
number can precede the word inside flipped parentheses (e.g. ")33( املادة").
All content is normalized (tatweel stripped, Arabic-Indic digits -> ASCII) before
matching, and both word/number orders are accepted.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Arabic-Indic digits U+0660-0669 -> ASCII
_AR_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_TATWEEL = "ـ"

# "(the) article" in Arabic after tatweel-stripping: canonical, lam/meem-swapped
# extraction artifact, and the bare form.
_AR_ARTICLE_WORD = "(?:المادة|املادة|مادة)"


def normalize_for_matching(text: str) -> str:
    """Strip tatweel and map Arabic-Indic digits to ASCII so a single set of
    patterns can match both clean and artifact-ridden extractions."""
    if not text:
        return ""
    return text.replace(_TATWEEL, "").translate(_AR_DIGITS)


def build_article_patterns(article_no: str) -> List[re.Pattern]:
    """Compile patterns that hit 'Article (N)' / 'المادة (N)' for the given article
    number in normalized text, in both word/number orders. Boundaries prevent
    matching Article 40 when looking for Article 4."""
    n = re.escape(str(article_no).strip())
    return [
        # English: Article (4) / Article 4
        re.compile(rf"Article\s*\(?\s*{n}\s*\)?(?!\d)", re.IGNORECASE),
        # Arabic canonical order: word then number (parens optional/flipped)
        re.compile(rf"{_AR_ARTICLE_WORD}\s*[()]?\s*{n}(?!\d)"),
        # Arabic RTL-artifact order: number then word, e.g. ')33( املادة'
        re.compile(rf"(?<!\d){n}\s*[()]?\s*{_AR_ARTICLE_WORD}"),
    ]


def content_matches_article(content: str, article_no: str) -> bool:
    """True if the (normalized) content mentions the given article number as an
    'Article N' / 'المادة N' reference."""
    if not content or article_no in (None, ""):
        return False
    norm = normalize_for_matching(content)
    return any(p.search(norm) for p in build_article_patterns(article_no))


# --- Heading extraction (used by the seeder to find substantive article chunks) ---

# English heading: 'Article (23) \nTitle' or 'Article 38 - Transfer of Tax Loss'
_EN_HEADING = re.compile(
    r"Article\s*\(?\s*(\d{1,3})\s*\)?\s*(?:[–—:\-]|\n)", re.IGNORECASE
)
# Arabic: both word/number orders, optional parens
_AR_REF_A = re.compile(rf"{_AR_ARTICLE_WORD}\s*[()]?\s*(\d{{1,3}})(?!\d)")
_AR_REF_B = re.compile(rf"(?<!\d)(\d{{1,3}})\s*[()]?\s*{_AR_ARTICLE_WORD}")


def extract_article_numbers(content: str, lang: str) -> List[str]:
    """Article numbers referenced in a chunk (normalized text). For English only
    heading-style references count; for Arabic both orders count because the
    extraction artifacts destroy the heading layout."""
    norm = normalize_for_matching(content or "")
    if lang == "ar":
        nums = _AR_REF_A.findall(norm) + _AR_REF_B.findall(norm)
    else:
        nums = _EN_HEADING.findall(norm)
    seen: List[str] = []
    for n in nums:
        n = n.lstrip("0") or "0"
        if n not in seen:
            seen.append(n)
    return seen


# Substantive-rule signal: percentages, amounts, durations, deadlines.
_SUBSTANTIVE = re.compile(
    r"(\d+(?:\.\d+)?\s*%"
    r"|per\s?cent"
    r"|AED\s*[\d,.]+"
    r"|within\s+\(?\d+"
    r"|\(?\d+\)?\s*(?:business\s+|working\s+|calendar\s+)?(?:day|month|year)s?"
    r"|درهم"                       # dirham
    r"|\d+\s*(?:يوم(?:اً|ا)?|أشهر|شهر(?:اً|ا)?|سنة|سنوات))",  # N days/months/years (Arabic)
    re.IGNORECASE,
)


def looks_substantive(content: str) -> bool:
    """True if the chunk contains a number/percentage/amount/deadline — i.e. it
    states a concrete rule a question can be asked about."""
    return bool(_SUBSTANTIVE.search(normalize_for_matching(content or "")))


# --- Result matching (used by the retrieval runner) ---

def _result_name_fields(result: Dict[str, Any]) -> List[str]:
    meta = result.get("metadata") or {}
    fields = [
        result.get("title") or "",
        result.get("source_name") or "",
        str(meta.get("law") or ""),
        str(meta.get("law_title") or ""),
        str(meta.get("law_name") or ""),
    ]
    return [f for f in fields if f]


def law_name_matches(expected_substring: str, result: Dict[str, Any]) -> bool:
    """Case-insensitive substring match of the expected law name against the
    result's title / source name / law metadata."""
    if not expected_substring:
        return True
    needle = expected_substring.lower()
    return any(needle in f.lower() for f in _result_name_fields(result))


def _result_content(result: Dict[str, Any]) -> str:
    return result.get("full_content") or result.get("content") or result.get("excerpt") or ""


def result_matches(expected: Dict[str, Any], result: Dict[str, Any], mode: str) -> bool:
    """Does a retrieved result satisfy a golden item's expectation?

    fallback mode: law-name substring AND (if an article is expected) a content
    regex hit for that article number.
    metadata mode: metadata.law_key equality AND (if expected) exact
    metadata.article_number equality.
    """
    article_no = expected.get("article_no")

    if mode == "metadata":
        meta = result.get("metadata") or {}
        law_key = expected.get("law_key")
        if law_key and str(meta.get("law_key") or "") != str(law_key):
            return False
        if not law_key and not law_name_matches(expected.get("law_name_contains") or "", result):
            return False
        if article_no not in (None, ""):
            got = str(meta.get("article_number") or "").lstrip("0") or "0"
            want = str(article_no).lstrip("0") or "0"
            return got == want
        return True

    # fallback (content-regex) mode
    if not law_name_matches(expected.get("law_name_contains") or "", result):
        return False
    if article_no in (None, ""):
        return True
    return content_matches_article(_result_content(result), article_no)


def find_match_rank(expected: Dict[str, Any], results: List[Dict[str, Any]], mode: str) -> Optional[int]:
    """1-based rank of the first matching result, or None."""
    for i, r in enumerate(results, start=1):
        if result_matches(expected, r, mode):
            return i
    return None
