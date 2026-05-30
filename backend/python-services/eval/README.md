# RAG Quality Eval

D4 of [SEMANTIC_BRIDGE_ROADMAP](../../../.claude/SEMANTIC_BRIDGE_ROADMAP.md). Skill: [rag-eval](../../../.claude/skills/rag-eval.md).

## Layout

```
eval/
├── golden_queries.json         # 5 baseline queries — EDIT THESE for your corpus
├── snapshots/
│   ├── golden.json             # last-known-good (commit this)
│   └── proposed.json           # what the runner just produced (gitignored)
├── run.py                      # hits chatbot, writes snapshot
├── compare.py                  # snapshot diff + verdict
└── __init__.py
```

## First-time setup

1. **Edit `golden_queries.json`** — replace the 5 `REPLACE_ME` placeholders with questions appropriate to your current corpus. Keep the structure.
2. **Start the chatbot** (Node backend on 3001, Python services on 8002).
3. **Capture the first golden**:
   ```bash
   cd backend/python-services
   python -m eval.run --out eval/snapshots/golden.json
   ```
4. **Commit** `golden.json` so the next session has a baseline.

## Day-to-day

```bash
# After making a change to retrieval / sanitizer / prompt / model:
python -m eval.run                                              # writes snapshots/proposed.json
python -m eval.compare snapshots/golden.json snapshots/proposed.json
```

Exit codes: `0` pass, `1` soft fail (warnings), `2` hard fail (deploy blocker).

The `/quality-test` slash command runs this whole flow.

## When the diff is an intentional improvement

```bash
cp snapshots/proposed.json snapshots/golden.json
git add snapshots/golden.json
git commit -m "eval: promote golden after <change>"
```

## Pitfalls (also in the rag-eval skill)

- **Cloud keys in env → refused.** Eval is local-only. Unset `OPENAI_API_KEY` etc. before running.
- **Non-determinism.** Force `temperature=0` everywhere; the runner already does so in its payload.
- **Embedding cache.** Stale cache hides retrieval regressions. Invalidate `embedding_cache` rows for golden queries before a clean run.
- **First failure: chatbot endpoint shape.** `run.py` assumes the Node chatbot returns `{answer, citations, refusal, model}`. If your endpoint differs, adapt the response parsing in `_call_chatbot`.
- **Similarity is a proxy.** `SequenceMatcher` is char-overlap, not semantic cosine. Acceptable for v0; upgrade to a real embedding-based cosine via `services/embedding_service` once eval becomes load-bearing.

## See also

- Skill: [.claude/skills/rag-eval.md](../../../.claude/skills/rag-eval.md)
- Slash command: [.claude/commands/quality-test.md](../../../.claude/commands/quality-test.md)
- Pre-deploy gate: [.claude/commands/deploy-check.md](../../../.claude/commands/deploy-check.md)
