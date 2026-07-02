"""Structured-metadata parser for legislation names and content headers.

Single implementation shared by the metadata backfill script, the ingest
scripts and the relationship-reference resolver, so every code path derives
the same ``law_key`` for the same law.

Output contract (the A<->B field-name contract used across the project):
    law_key, law_type, law_number, law_year, law_title, article_number,
    issue_date, parent_law_key

Pattern tables default in this module (one place) and are overridable per
tenant via the ``ingest.lawMetadataPatterns`` settings row (JSON with the
same shape as DEFAULT_PATTERNS; provided keys replace the defaults).

Design rules:
- Name-first: the stored law name is more reliable than PDF text, which is
  frequently bidi-scrambled for Arabic (PyMuPDF visual order).
- Never guess: if number/year/type cannot be parsed confidently, the field
  (and law_key) is omitted rather than fabricated.
- Arabic-Indic digits are normalized before any numeric parsing.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

# Arabic-Indic and Extended Arabic-Indic digits -> ASCII.
_DIGIT_TRANSLATION = {ord(c): str(i % 10) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")}
_DIGIT_TRANSLATION.update({ord(c): str(i % 10) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")})

_YEAR_MIN, _YEAR_MAX = 1950, 2035

# Default pattern tables. Order matters: the first matching law type wins, so
# more specific types (executive regulation, FTA) come before generic ones.
DEFAULT_PATTERNS: Dict[str, Any] = {
    "lawTypes": [
        {
            "type": "executive_regulation",
            "patterns": [
                r"executive[\s-]+regulation",
                r"اللائحة\s+التنفيذية",
            ],
        },
        {
            "type": "fta_decision",
            "patterns": [
                # "Decisio" covers a real filename typo in the corpus.
                r"\bfta[\s-]+decisio?n?\b",
                r"federal[\s-]+tax[\s-]+authority[\s-]+decision",
                r"قرار\s+الهيئة\s+الاتحادية\s+للضرائب",
            ],
        },
        {
            "type": "federal_decree_law",
            "patterns": [
                r"federal[\s-]+decree[\s-]*law",
                r"federal[\s-]+decreelaw",
                r"مرسوم\s+بقانون\s+اتحادي",
            ],
        },
        {
            "type": "federal_law",
            "patterns": [r"federal[\s-]+law", r"قانون\s+اتحادي"],
        },
        {
            "type": "cabinet_decision",
            "patterns": [
                r"cabinet[\s-]+(?:decision|resolution)",
                r"cabinet\s+of\s+ministers\s+resolution",
                r"قرار\s+مجلس\s+الوزراء",
            ],
        },
        {
            "type": "ministerial_decision",
            "patterns": [
                r"ministerial[\s-]+decision",
                r"\bmd[\s-]*no\b",
                r"قرار\s+وزاري",
            ],
        },
        {
            "type": "dubai_law",
            "patterns": [r"dubai\s+law", r"قانون\s+دبي"],
        },
        {
            "type": "difc_law",
            "patterns": [r"\bdifc\s+(?:employment\s+)?law\b", r"difc\s+law"],
        },
        {
            "type": "gcc_agreement",
            "patterns": [
                r"gcc[\s-]+(?:unified[\s-]+)?(?:vat|excise)?[\s-]*(?:tax[\s-]+)?agreement",
                r"common[\s-]+excise[\s-]+tax[\s-]+agreement",
            ],
        },
        {
            # Bare "Decision No. X of YYYY" with no issuing body in the name.
            # Kept last so specific bodies win; collisions surface in review.
            "type": "decision",
            "patterns": [r"\bdecision\b", r"\bقرار\b"],
        },
    ],
    # number/year extraction from a law NAME; named groups num/year required.
    "numberYear": [
        # "No. 20 of 2018", "No (20) of 2018", "No105 of 2021", "No-127-of-2024"
        r"no[\.\s-]*\(?\s*(?P<num>\d{1,4})\s*\)?[\s-]*of[\s-]*(?P<year>\d{4})",
        # "Cabinet Decision 1 of 2020", "Invoices Credit Notes 7 of 2019"
        r"(?<!\d)(?P<num>\d{1,4})\s+of\s+(?P<year>\d{4})",
        # "Cabinet-Decision 52  2019" (no "of"); year must look like a year
        r"(?<!\d)(?P<num>\d{1,4})\s{1,3}(?P<year>(?:19[5-9]\d|20[0-3]\d))(?!\d)",
        # Arabic: "رقم (52) لسنة 2017" (digits pre-normalized to ASCII)
        r"رقم\s*\(?\s*(?P<num>\d{1,4})\s*\)?\s*لسنة\s*(?P<year>\d{4})",
    ],
    # number-only fallback (year resolved later from content): "MD-No-229",
    # "Cabinet Decision No. 65-ar", "ArabicNo114"
    "numberOnly": [r"no[\.\s-]*\(?\s*(?P<num>\d{1,4})\s*\)?(?!\s*of)"],
    # article marker anchored to a chunk head (first N chars, see
    # extract_article_number); group 1 = the article number.
    "articleMarkers": {
        "en": r"article\s*\(?\s*(\d{1,4})\s*\)?",
        "ar": r"ال?ماد[ةه]\s*\(?\s*(\d{1,4})\s*\)?",
    },
    # decorations stripped from names before deriving law_title
    "titleNoise": [
        r"\s*[-–—]?\s*for\s+publishing.*$",
        r"\s*[-–—]?\s*version\s+to\s+publish.*$",
        r"\s*[-–—]?\s*to\s+publish.*$",
        r"\s*[-–—]?\s*publishing[\s\d-]*$",
        r"\s*[-–—]?\s*publish[\s\d-]*$",
        r"\s*[-–—]?\s*fta\s+formatting.*$",
        r"\s*and\s+(?:its\s+)?amendments?\b.*$",
        r"\s*[-–—]\s*general\s*$",
        r"\s*\bres\b\s*$",
        # trailing dd mm yyyy / dd-mm-yyyy / mm yyyy date tails
        r"\s*[-–—]?\s*\d{1,2}[\s\.-]\d{1,2}[\s\.-]\d{4}\s*$",
        r"\s*[-–—]?\s*\d{1,2}[\s\.-]\d{4}\s*$",
    ],
}

# Trailing language markers on names ("— EN", "-ar", " Arabic", "AR (translated)").
_LANG_SUFFIX_RE = re.compile(
    r"""(?:\s*[-–—]\s*|\s+|-)
        (?:en|ar|arabic|eng|english)
        (?:\s*\(translated\))?
        \s*$""",
    re.IGNORECASE | re.VERBOSE,
)

_EXEC_REG_PARENT_RE = re.compile(
    r"executive[\s-]+regulation[\s-]+of[\s-]+(?:the[\s-]+)?(?P<parent>.+)$",
    re.IGNORECASE,
)


def normalize_digits(text: str) -> str:
    """Translate Arabic-Indic digits to ASCII so numeric regexes match."""
    return text.translate(_DIGIT_TRANSLATION)


def merge_patterns(overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Merge a settings-provided pattern table over the module defaults.

    Top-level keys replace the default wholesale (a tenant that supplies
    ``lawTypes`` owns the full list); missing keys keep the default.
    """
    if not overrides:
        return DEFAULT_PATTERNS
    merged = dict(DEFAULT_PATTERNS)
    for key, value in overrides.items():
        if value:
            merged[key] = value
    return merged


async def load_patterns_from_settings(conn) -> Dict[str, Any]:
    """Load ``ingest.lawMetadataPatterns`` from the settings table (asyncpg
    connection) and merge over the defaults. Any error -> defaults."""
    try:
        raw = await conn.fetchval(
            "SELECT value FROM settings WHERE key = 'ingest.lawMetadataPatterns'"
        )
        if raw:
            return merge_patterns(json.loads(raw))
    except Exception:
        pass
    return DEFAULT_PATTERNS


def _valid_year(year: Optional[str]) -> Optional[str]:
    if year and year.isdigit() and _YEAR_MIN <= int(year) <= _YEAR_MAX:
        return year
    return None


def _valid_number(num: Optional[str]) -> Optional[str]:
    if num and num.isdigit() and 1 <= int(num) <= 9999:
        return str(int(num))  # strip leading zeros ("No-08" -> "8")
    return None


def _match_law_type(text: str, patterns: Dict[str, Any]) -> Optional[str]:
    """Earliest-position match wins: a document header/name states its own
    type first ("Cabinet Decision ... on the Executive Regulation" is a
    cabinet decision; "Executive Regulation of Federal Decree-Law ..." is an
    executive regulation). Ties break by pattern-table order."""
    best: Optional[tuple] = None  # (position, table_index, type)
    for idx, entry in enumerate(patterns.get("lawTypes", [])):
        for pat in entry.get("patterns", []):
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                candidate = (m.start(), idx, entry["type"])
                if best is None or candidate < best:
                    best = candidate
    return best[2] if best else None


def _match_number_year(text: str, patterns: Dict[str, Any]):
    for pat in patterns.get("numberYear", []):
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            num = _valid_number(m.group("num"))
            year = _valid_year(m.group("year"))
            if num and year:
                return num, year
    return None, None


def _match_number_only(text: str, patterns: Dict[str, Any]) -> Optional[str]:
    for pat in patterns.get("numberOnly", []):
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            num = _valid_number(m.group("num"))
            if num:
                return num
    return None


def strip_lang_suffix(name: str) -> str:
    """Remove trailing language markers, repeatedly ("...arabic - AR")."""
    prev = None
    out = name.strip()
    while prev != out:
        prev = out
        out = _LANG_SUFFIX_RE.sub("", out).strip(" -–—")
    return out


def _derive_title(name: str, patterns: Dict[str, Any]) -> Optional[str]:
    """Best-effort human title from a law name; None when nothing survives."""
    base = strip_lang_suffix(name)
    # Canonical "Title — Federal Decree-Law No. X of YYYY" -> take the first
    # em-dash segment when a later segment carries the number/year.
    if "—" in base:
        segments = [s.strip() for s in base.split("—") if s.strip()]
        if len(segments) >= 2:
            head, rest = segments[0], " ".join(segments[1:])
            num, year = _match_number_year(rest, patterns)
            if num and year and not _match_number_year(head, patterns)[0]:
                return head
    # Filename slugs ("Cabinet-Decision-No-127-of-2024-on-...") read better
    # with hyphens as spaces; keep real hyphens in normal prose names
    # ("Decree-Law") by only converting when the name has no spaces.
    text = base.replace("-", " ") if " " not in base else base
    for noise in patterns.get("titleNoise", []):
        text = re.sub(noise, "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s{2,}", " ", text).strip(" -–—.,")
    return text or None


def parse_law_name(name: str, patterns: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Parse a stored law name into structured fields.

    Returns a dict with any of: law_type, law_number, law_year, law_key,
    law_title, parent_law_key, confidence ('name'). Fields that cannot be
    parsed confidently are absent; law_key requires type + number + year.
    """
    patterns = patterns or DEFAULT_PATTERNS
    out: Dict[str, Any] = {}
    if not name or not name.strip():
        return out

    text = normalize_digits(name).strip()
    law_type = _match_law_type(text, patterns)
    num, year = _match_number_year(text, patterns)
    if not num:
        num = _match_number_only(text, patterns)

    if law_type:
        out["law_type"] = law_type
    if num:
        out["law_number"] = num
    if year:
        out["law_year"] = year
    if law_type and num and year:
        out["law_key"] = f"{law_type}:{num}:{year}"
        out["confidence"] = "name"

    title = _derive_title(name, patterns)
    if title:
        out["law_title"] = title

    # Executive regulations: the embedded number/year usually belong to the
    # PARENT law ("Executive Regulation of Federal Decree-Law No 8 of 2017").
    if law_type == "executive_regulation":
        m = _EXEC_REG_PARENT_RE.search(text.replace("-", " "))
        if m:
            parent = parse_law_name(m.group("parent"), patterns)
            if parent.get("law_key") and parent.get("law_type") != "executive_regulation":
                out["parent_law_key"] = parent["law_key"]
                # The regulation's own key must not collide with the parent's:
                # reuse the parent's number/year under its own type slug.
                out["law_key"] = f"executive_regulation:{parent['law_number']}:{parent['law_year']}"
                out["law_number"] = parent["law_number"]
                out["law_year"] = parent["law_year"]
                out["confidence"] = "name"
    return out


def parse_law_from_content(
    text: str, lang: str, patterns: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Fallback parse from the first chunk(s) of a law's text.

    Arabic PDF headers come out of PyMuPDF bidi-scrambled, so the Arabic path
    uses proximity windows around the anchors ``رقم`` (number) and ``لسنة``
    (year) instead of strict adjacency. Returns the same shape as
    parse_law_name with confidence 'content'.
    """
    patterns = patterns or DEFAULT_PATTERNS
    out: Dict[str, Any] = {}
    if not text:
        return out

    head = normalize_digits(text[:800])
    law_type = _match_law_type(head, patterns)

    num = year = None
    if lang == "ar":
        m = re.search(r"رقم", head)
        if m:
            window = head[max(0, m.start() - 15): m.end() + 15]
            dm = re.search(r"(\d{1,4})", window)
            if dm:
                num = _valid_number(dm.group(1))
        y = re.search(r"لسنة", head)
        if y:
            window = head[max(0, y.start() - 15): y.end() + 15]
            ym = re.search(r"((?:19[5-9]|20[0-3])\d)", window)
            if ym:
                year = _valid_year(ym.group(1))
    else:
        num, year = _match_number_year(head[:500], patterns)

    if law_type:
        out["law_type"] = law_type
    if num:
        out["law_number"] = num
    if year:
        out["law_year"] = year
    if law_type and num and year:
        out["law_key"] = f"{law_type}:{num}:{year}"
        out["confidence"] = "content"
    return out


def extract_article_number(
    content: str,
    lang: str,
    patterns: Optional[Dict[str, Any]] = None,
    head_chars: int = 80,
) -> Optional[str]:
    """Article number from a chunk that STARTS with an article marker.

    Anchored to the first ``head_chars`` characters so mid-chunk references
    ("... subject to Article (146) ...") never win over the header.
    """
    patterns = patterns or DEFAULT_PATTERNS
    if not content:
        return None
    head = normalize_digits(content[:head_chars])
    marker = patterns.get("articleMarkers", {}).get(
        lang, patterns.get("articleMarkers", {}).get("en", "")
    )
    if not marker:
        return None
    m = re.search(marker, head, re.IGNORECASE)
    if not m:
        return None
    # A header marker has nothing but whitespace/punctuation before it; any
    # letter means the marker is a mid-sentence cross-reference, not a header.
    if re.search(r"[^\W\d_]", head[: m.start()], re.UNICODE):
        return None
    return _valid_number(m.group(1))


_ISSUE_DATE_RES = [
    # "Issued on 26/09/2022", "Issuance Date: 26 September 2022" (EN)
    re.compile(
        r"issu(?:ed|ance)[^0-9]{0,20}(\d{1,2})[\s/.-](\d{1,2}|\w+)[\s/.,-]+(\d{4})",
        re.IGNORECASE,
    ),
    # "تاريخ الإصدار: 26/09/2022"
    re.compile(r"تاريخ\s+الإصدار[^0-9]{0,15}(\d{1,2})[\s/.-](\d{1,2})[\s/.-]+(\d{4})"),
]

_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}


def parse_issue_date(text: str, lang: str) -> Optional[str]:
    """Best-effort ISO issue date from a law's opening text; None unless the
    match is complete and plausible (never guessed)."""
    if not text:
        return None
    head = normalize_digits(text[:1500])
    for rx in _ISSUE_DATE_RES:
        m = rx.search(head)
        if not m:
            continue
        day, month_raw, year = m.group(1), m.group(2), m.group(3)
        month = (
            _MONTHS.get(month_raw.lower())
            if not month_raw.isdigit()
            else int(month_raw)
        )
        if not month or not (1 <= month <= 12):
            continue
        if not (1 <= int(day) <= 31 and _YEAR_MIN <= int(year) <= _YEAR_MAX):
            continue
        return f"{int(year):04d}-{month:02d}-{int(day):02d}"
    return None
