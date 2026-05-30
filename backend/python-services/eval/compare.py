"""RAG quality eval — comparator.

Compares two snapshots (or one snapshot against golden expectations) and prints a per-query
verdict. Exit code 0 = all pass, 1 = soft fail (warnings only), 2 = hard fail (deploy blocker).

Usage:
    python -m eval.compare snapshots/golden.json snapshots/proposed.json
    python -m eval.compare snapshots/proposed.json           # check vs expectations only

Metrics (per query, see .claude/skills/rag-eval.md):
  1. expected_answer_contains   — substrings MUST appear
  2. expected_answer_excludes   — substrings MUST NOT appear
  3. expected_citations_min     — citation count floor
  4. expected_refusal           — refusal flag must match
  5. answer_similarity (if golden provided) — char-overlap similarity, threshold 0.85
  6. citation_overlap (if golden provided)  — Jaccard of citation IDs, threshold 0.5
  7. latency_regression (if golden provided) — fail if > 2x baseline
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

# Windows consoles often default to cp1252; force UTF-8 so the verdict markers render.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ANSWER_SIM_THRESHOLD = 0.85
CITATION_OVERLAP_THRESHOLD = 0.5
LATENCY_REGRESSION_FACTOR = 2.0


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""
    severity: str = "hard"  # 'hard' or 'soft'


@dataclass
class QueryVerdict:
    query_id: str
    checks: list[CheckResult] = field(default_factory=list)

    @property
    def hard_failures(self) -> list[CheckResult]:
        return [c for c in self.checks if not c.passed and c.severity == "hard"]

    @property
    def soft_failures(self) -> list[CheckResult]:
        return [c for c in self.checks if not c.passed and c.severity == "soft"]

    @property
    def overall(self) -> str:
        if self.hard_failures:
            return "HARD_FAIL"
        if self.soft_failures:
            return "SOFT_FAIL"
        return "PASS"


def _load(p: Path) -> dict[str, Any]:
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def _index_by_id(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {r["query_id"]: r for r in snapshot["results"]}


def _similarity(a: str, b: str) -> float:
    """Char-level similarity in [0, 1]. Cheap proxy for cosine until we wire local embeddings."""
    return SequenceMatcher(None, a or "", b or "").ratio()


def _citation_ids(citations: list[Any]) -> set[str]:
    out = set()
    for c in citations or []:
        if isinstance(c, dict):
            for k in ("id", "chunk_id", "content_hash", "url"):
                if v := c.get(k):
                    out.add(str(v))
                    break
        elif isinstance(c, str):
            out.add(c)
    return out


def _evaluate(proposed_entry: dict[str, Any], golden_entry: dict[str, Any] | None) -> QueryVerdict:
    q = proposed_entry["input"]
    p_out = proposed_entry["output"]
    v = QueryVerdict(query_id=proposed_entry["query_id"])

    if not p_out.get("ok"):
        v.checks.append(CheckResult("chatbot_call", False, p_out.get("error", "call failed"), "hard"))
        return v

    answer = p_out.get("answer", "")
    citations = p_out.get("citations", [])

    # 1. Required substrings
    missing = [s for s in q.get("expected_answer_contains", []) if s and s.lower() not in answer.lower()]
    v.checks.append(CheckResult(
        "expected_contains",
        not missing,
        f"missing: {missing}" if missing else "all present",
        "hard",
    ))

    # 2. Forbidden substrings
    present = [s for s in q.get("expected_answer_excludes", []) if s and s.lower() in answer.lower()]
    v.checks.append(CheckResult(
        "expected_excludes",
        not present,
        f"forbidden present: {present}" if present else "clean",
        "hard",
    ))

    # 3. Citation count floor
    min_cites = q.get("expected_citations_min", 0)
    v.checks.append(CheckResult(
        "citations_min",
        len(citations) >= min_cites,
        f"got {len(citations)}, need >= {min_cites}",
        "hard",
    ))

    # 4. Refusal flag match
    expected_refusal = bool(q.get("expected_refusal", False))
    actual_refusal = bool(p_out.get("refusal", False))
    v.checks.append(CheckResult(
        "refusal_match",
        expected_refusal == actual_refusal,
        f"expected={expected_refusal} actual={actual_refusal}",
        "hard",
    ))

    # 5-7. Golden-snapshot comparisons (only if golden provided AND the call succeeded)
    if golden_entry and golden_entry["output"].get("ok"):
        g_out = golden_entry["output"]
        sim = _similarity(g_out.get("answer", ""), answer)
        v.checks.append(CheckResult(
            "answer_similarity",
            sim >= ANSWER_SIM_THRESHOLD,
            f"sim={sim:.3f} threshold={ANSWER_SIM_THRESHOLD}",
            "soft",
        ))

        g_ids = _citation_ids(g_out.get("citations", []))
        p_ids = _citation_ids(citations)
        if g_ids or p_ids:
            jaccard = len(g_ids & p_ids) / max(len(g_ids | p_ids), 1)
            v.checks.append(CheckResult(
                "citation_overlap",
                jaccard >= CITATION_OVERLAP_THRESHOLD,
                f"jaccard={jaccard:.2f} threshold={CITATION_OVERLAP_THRESHOLD}",
                "soft",
            ))

        g_lat = g_out.get("latency_ms", 0)
        p_lat = p_out.get("latency_ms", 0)
        if g_lat > 0:
            ratio = p_lat / g_lat
            v.checks.append(CheckResult(
                "latency_regression",
                ratio <= LATENCY_REGRESSION_FACTOR,
                f"{p_lat}ms vs {g_lat}ms (×{ratio:.2f})",
                "soft",
            ))

    return v


def _print_verdict(v: QueryVerdict) -> None:
    icon = {"PASS": "[OK]  ", "SOFT_FAIL": "[~]   ", "HARD_FAIL": "[FAIL]"}[v.overall]
    print(f"  {icon} {v.query_id} - {v.overall}")
    for c in v.checks:
        if not c.passed:
            mark = "FAIL" if c.severity == "hard" else "warn"
            print(f"      [{mark}] {c.name}: {c.detail}")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("first", help="snapshot to evaluate (or golden, if 'second' given)")
    p.add_argument("second", nargs="?", help="proposed snapshot (if comparing to golden)")
    args = p.parse_args()

    if args.second:
        golden = _index_by_id(_load(Path(args.first)))
        proposed = _index_by_id(_load(Path(args.second)))
        scope = "vs golden"
    else:
        golden = {}
        proposed = _index_by_id(_load(Path(args.first)))
        scope = "expectations only"

    print(f"Comparing {len(proposed)} queries ({scope})\n")
    verdicts = [_evaluate(p_entry, golden.get(qid)) for qid, p_entry in proposed.items()]
    for v in verdicts:
        _print_verdict(v)

    hard = sum(1 for v in verdicts if v.overall == "HARD_FAIL")
    soft = sum(1 for v in verdicts if v.overall == "SOFT_FAIL")
    passed = sum(1 for v in verdicts if v.overall == "PASS")

    print(f"\nResult: {passed} pass, {soft} soft fail, {hard} hard fail")
    if hard:
        return 2
    if soft:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
