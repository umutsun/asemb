"""Markdown-format lint for chat answers — pure regex, no LLM.

Deterministic assertions matched to the chat UI renderer's known failure
modes (see frontend/src/lib/chat-markdown.ts):
1. unbalanced ** bold markers (an odd count leaves raw asterisks on screen)
2. heading markers glued to the following text ('##Heading', '**Title**Text')
3. numbered-list items missing the space after the number ('1.Item')
4. citations placed after sentence punctuation ('... deadline. [1]' — the
   house style puts the citation before the closing punctuation: '... [1].')

Threshold: evalSettings.thresholds.markdownLintErrors (default 0).
Pure function; returns the error list so the caller can decide severity.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

# '#Heading' — ATX heading marker with no space after the hashes
_HEADING_GLUED = re.compile(r"^#{1,6}[^#\s]", re.MULTILINE)
# '**Title**Text' — bold run immediately followed by a letter/digit (Latin or Arabic)
_BOLD_GLUED = re.compile(r"\*\*[^*\n]{1,120}\*\*[A-Za-z0-9؀-ۿ]")
# '1.Item' — numbered list marker without the space (decimals like 3.5 excluded)
_NUMBERED_GLUED = re.compile(r"^\s{0,3}\d{1,3}\.(?=[^\s\d])", re.MULTILINE)
# '... deadline. [1]' — citation after closing punctuation (incl. Arabic comma/semicolon)
_CITATION_AFTER_PUNCT = re.compile(r"[.!?،؛:]\s*\[\d+\]")


def _excerpt(text: str, start: int, width: int = 48) -> str:
    return text[start:start + width].replace("\n", "\\n")


def lint_markdown(text: str) -> Dict[str, Any]:
    """Lint one answer. Returns {"error_count": int, "errors": [str, ...]}."""
    t = text or ""
    errors: List[str] = []

    bold_markers = len(re.findall(r"\*\*", t))
    if bold_markers % 2 == 1:
        errors.append(f"unbalanced '**' markers ({bold_markers} found, expected an even count)")

    for m in _HEADING_GLUED.finditer(t):
        errors.append(f"heading marker glued to text: '{_excerpt(t, m.start())}'")
    for m in _BOLD_GLUED.finditer(t):
        errors.append(f"bold run glued to following text: '{_excerpt(t, m.start())}'")
    for m in _NUMBERED_GLUED.finditer(t):
        errors.append(f"numbered-list item missing space after the number: '{_excerpt(t, m.start())}'")
    for m in _CITATION_AFTER_PUNCT.finditer(t):
        errors.append(f"citation placed after punctuation (should precede it): '{_excerpt(t, m.start(), 20)}'")

    return {"error_count": len(errors), "errors": errors}


def main() -> int:
    """Standalone mode: lint the answers of a snapshot artifact."""
    import json
    import sys

    if len(sys.argv) < 2:
        sys.stderr.write("usage: python -m eval.checks.markdown_lint <answers_snapshot.json>\n")
        return 2
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        snapshot = json.load(f)
    total = 0
    for r in snapshot.get("results", []):
        out = r.get("output") or {}
        if not out.get("ok"):
            continue
        verdict = lint_markdown(out.get("answer", ""))
        total += verdict["error_count"]
        status = "OK" if not verdict["error_count"] else "FAIL"
        print(f"  [{status}] {r.get('query_id')}: {verdict['error_count']} lint errors")
        for e in verdict["errors"]:
            print(f"      - {e}")
    print(f"\n{total} lint errors total")
    return 2 if total else 0


if __name__ == "__main__":
    raise SystemExit(main())
