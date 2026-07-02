# RAG Quality Eval (UAE corpus)

Evaluation harness for the UAE-law RAG pipeline. All configuration is
settings-driven: defaults live in exactly one place (`eval/config.py`
`DEFAULTS`) and every key is overridable via a `settings` table row of the same
name (`evalSettings.*`). `evalSettings.chatUrl` can also be overridden by the
`EVAL_CHAT_URL` env var. This project runs on OpenAI (key in settings
`openai.apiKey`); the former local-models-only refusal on cloud API keys is gone.

Exit-code convention everywhere: `0` pass, `1` soft fail, `2` hard fail.

## Layout

```
eval/
├── config.py                 # settings loader; ALL eval defaults live here
├── matchers.py               # article/law matching (EN + AR, Arabic-Indic digit aware)
├── seed_golden.py            # golden-set seeder (read-only vs corpus, writes draft JSON)
├── run_retrieval.py          # in-process retrieval eval (SemanticSearchService)
├── run.py                    # answer-level runner (POST evalSettings.chatUrl)
├── checks/
│   └── settings_audit.py     # settings-vs-corpus drift audit
├── golden/
│   └── uae_v1.draft.json     # seeded golden set (DRAFT — needs human verification)
├── artifacts/                # run outputs (gitignored)
├── compare.py, golden_queries.json, snapshots/   # legacy scaffold (pre-UAE), kept for reference
└── parity.py
```

Run everything from `backend/python-services` with the venv Python and
`PYTHONUTF8=1` (loguru + Arabic output on Windows consoles):

```bash
cd backend/python-services
PYTHONUTF8=1 .venv/Scripts/python.exe -m eval.checks.settings_audit
```

## 1. Settings audit

```bash
python -m eval.checks.settings_audit
```

Verifies that every metadata field named in
`ragSettings.citationPriorityFields` / `ragSettings.fieldLabels` actually
exists on >= 1% of `unified_embeddings` rows (hard fail otherwise — catches
legacy Turkish fields configured against the UAE corpus), and compares
`ragSettings.ftsLanguage` against the corpus `metadata->>'lang'` distribution.

## 2. Seed the golden set

```bash
python -m eval.seed_golden            # writes eval/golden/uae_v1.draft.json
```

Stratified sampling per `evalSettings.seedDomainBuckets` (tax, labour,
civil-commercial, banking): per bucket it pairs EN/AR versions of the same law,
picks articles present in both languages whose chunks state a concrete rule,
and drafts paired questions + answer facets with `evalSettings.judgeModel`
(temperature 0). Adds gov-services items and hand-written adversarial items
(out-of-corpus refusals, nonexistent-article traps, a cross-language probe).
Read-only against the DB; the only output is the draft JSON. Without an OpenAI
key it degrades to heuristic question drafting and says so in each item's
`notes`.

**Every drafted item needs human verification** before promoting the draft to
`eval/golden/uae_v1.json` (drop the `.draft`).

## 3. Retrieval eval (in-process)

```bash
python -m eval.run_retrieval [--golden PATH] [--only ID] [--lang en|ar] [--k N]
```

Calls `SemanticSearchService.semantic_search(query, limit=K, use_cache=False)`
in-process per golden question. A result matches when the expected law name is
a substring of its title/source/metadata.law AND (matcherMode `fallback`,
today) the expected article number appears in the content — matched with a
regex that handles Arabic-Indic digits and the RTL extraction artifacts of the
Arabic PDFs. After the Workstream A metadata backfill set
`evalSettings.matcherMode='metadata'` to match `metadata.law_key` /
`metadata.article_number` instead.

Reports recall@1/3/5/10, MRR, per-language, per-domain, and
`metadata_coverage` (fraction of retrieved results carrying `law_key` — the
Workstream A progress gauge, ~0 until the backfill lands). Artifact:
`eval/artifacts/retrieval_<timestamp>.json`. Thresholds come from
`evalSettings.thresholds`.

## 4. Answer-level eval

```bash
EVAL_CHAT_TOKEN=<jwt> python -m eval.run [--golden PATH] [--only ID]
```

POSTs each question to the Node backend chat endpoint (`evalSettings.chatUrl`,
default `http://localhost:8083/api/v2/chat`, requires a JWT) with
temperature=0, snapshots answers + sources to `eval/artifacts/answers_<ts>.json`,
and applies the deterministic checks (`answer_must_contain`,
`answer_must_not_contain`, `expect_refusal`). LLM-judge groundedness scoring
(`evalSettings.judgePrompt`, thresholds `groundednessMean` etc.) is the next
stage on top of these snapshots.

## Golden item schema

```json
{
  "id": "tax-corporate-tax-art4-en",
  "lang": "en",
  "domain": "tax",
  "question": "...",
  "paired_with": "tax-corporate-tax-art4-ar",
  "expected": {
    "law_name_contains": "No. 47 of 2022",
    "law_key": null,
    "article_no": "4",
    "answer_must_contain": ["..."],
    "answer_must_not_contain": [],
    "expect_refusal": false
  },
  "tags": ["single-hop"],
  "notes": "LLM-drafted, needs human verification"
}
```

`law_key` stays `null` until the Workstream A backfill adds structured
`law_key`/`article_number` metadata; then the golden set can be enriched and
`matcherMode` switched without touching the runner.
