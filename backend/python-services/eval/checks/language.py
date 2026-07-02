"""Answer-language check via script-ratio detection (Arabic vs Latin letters).

Chat answers must come back in the question's language. This check counts
Arabic-block letters vs Latin letters, picks the dominant script, compares it
to the golden item's lang ('ar' expects Arabic script; everything else — the
corpus is EN/AR — expects Latin), and flags mixed-script answers. Digits,
punctuation and citation markers like '[3]' are ignored, so law numbers do not
skew the ratio.

Pure functions, no I/O. Aggregate threshold:
evalSettings.thresholds.languageMatch (default 0.95 share of matching items).
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

# Arabic Unicode blocks: main, supplement, extended-A, presentation forms A/B
_ARABIC = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")
# Basic Latin letters + Latin-1/Extended (accented letters)
_LATIN = re.compile(r"[A-Za-zÀ-ɏ]")

# A minority script above this share of all letters marks the answer as
# mixed-script (legal names/citations in the other language stay below it).
MIXED_SCRIPT_FLOOR = 0.15


def script_ratios(text: str) -> Dict[str, Any]:
    """Letter counts and ratios of the Arabic vs Latin scripts in `text`."""
    arabic = len(_ARABIC.findall(text or ""))
    latin = len(_LATIN.findall(text or ""))
    total = arabic + latin
    return {
        "arabic_letters": arabic,
        "latin_letters": latin,
        "arabic_ratio": round(arabic / total, 4) if total else 0.0,
        "latin_ratio": round(latin / total, 4) if total else 0.0,
    }


def check_language(answer: str, expected_lang: Optional[str]) -> Dict[str, Any]:
    """Structured verdict: does the answer's dominant script match the golden
    item's language, and is the answer mixed-script?"""
    ratios = script_ratios(answer)
    total = ratios["arabic_letters"] + ratios["latin_letters"]

    detected: Optional[str] = None
    if total:
        detected = "ar" if ratios["arabic_ratio"] >= 0.5 else "latin"
    expected_script = "ar" if (expected_lang or "").strip().lower() == "ar" else "latin"
    minority = min(ratios["arabic_ratio"], ratios["latin_ratio"]) if total else 0.0

    return {
        "expected_lang": expected_lang,
        "expected_script": expected_script,
        "detected_script": detected,
        "matches": detected == expected_script if detected else False,
        "mixed_script": bool(total) and minority >= MIXED_SCRIPT_FLOOR,
        **ratios,
    }


def main() -> int:
    """Standalone mode: check the answer language of a snapshot artifact."""
    import json
    import sys

    if len(sys.argv) < 2:
        sys.stderr.write("usage: python -m eval.checks.language <answers_snapshot.json>\n")
        return 2
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        snapshot = json.load(f)
    n_fail = 0
    for r in snapshot.get("results", []):
        out = r.get("output") or {}
        if not out.get("ok"):
            continue
        verdict = check_language(out.get("answer", ""), (r.get("input") or {}).get("lang"))
        status = "OK" if verdict["matches"] else "FAIL"
        if not verdict["matches"]:
            n_fail += 1
        mixed = " (mixed-script)" if verdict["mixed_script"] else ""
        print(f"  [{status}] {r.get('query_id')}: expected={verdict['expected_script']} "
              f"detected={verdict['detected_script']}{mixed}")
    print(f"\n{n_fail} failing")
    return 2 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
