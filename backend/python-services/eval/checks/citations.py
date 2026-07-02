"""Citation-validity check for answer-level evals (pure function, no I/O).

Given the chat response text, its sources[] and the golden item's expected
block, asserts that:
1. every [n] citation in the answer stays within 1..len(sources), and
2. when an article number is expected (expected.article_no), the article
   regex from eval.matchers (Arabic-Indic digit / RTL-artifact aware) hits the
   content of at least one *cited* source — citing sources that do not contain
   the expected article is citation laundering.

Runnable standalone against an answers snapshot:
    python -m eval.checks.citations <eval/artifacts/answers_*.json>
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from eval.matchers import content_matches_article

_CITATION = re.compile(r"\[(\d+)\]")


def _source_content(source: Dict[str, Any]) -> str:
    return source.get("full_content") or source.get("content") or source.get("excerpt") or ""


def check_citations(
    response_text: str,
    sources: List[Dict[str, Any]],
    expected: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Structured citation verdict for one answer. `valid` is True only when
    no error was found."""
    expected = expected or {}
    n_sources = len(sources or [])
    cited = [int(m) for m in _CITATION.findall(response_text or "")]
    cited_unique = sorted(set(cited))
    invalid = sorted({n for n in cited if n < 1 or n > n_sources})

    errors: List[str] = []
    if invalid:
        errors.append(f"citations out of range 1..{n_sources}: {invalid}")

    article_no = expected.get("article_no")
    article_supported: Optional[bool] = None
    if article_no not in (None, ""):
        cited_valid = [n for n in cited_unique if 1 <= n <= n_sources]
        if not cited_valid:
            article_supported = False
            errors.append(f"expected Article {article_no} but the answer cites no valid sources")
        else:
            article_supported = any(
                content_matches_article(_source_content(sources[n - 1]), article_no)
                for n in cited_valid
            )
            if not article_supported:
                errors.append(
                    f"expected Article {article_no} not found in the content of any cited source"
                )

    return {
        "valid": not errors,
        "n_sources": n_sources,
        "citations": cited_unique,
        "invalid_citations": invalid,
        "expected_article": article_no,
        "article_supported_by_cited_source": article_supported,
        "errors": errors,
    }


def main() -> int:
    """Standalone mode: re-check the citations of an answers snapshot."""
    import json
    import sys

    if len(sys.argv) < 2:
        sys.stderr.write("usage: python -m eval.checks.citations <answers_snapshot.json>\n")
        return 2
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        snapshot = json.load(f)
    n_fail = 0
    for r in snapshot.get("results", []):
        out = r.get("output") or {}
        if not out.get("ok"):
            continue
        verdict = check_citations(
            out.get("answer", ""), out.get("sources", []), (r.get("input") or {}).get("expected")
        )
        status = "OK" if verdict["valid"] else "FAIL"
        if not verdict["valid"]:
            n_fail += 1
        print(f"  [{status}] {r.get('query_id')}: {verdict['errors'] or 'citations valid'}")
    print(f"\n{n_fail} failing")
    return 2 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
