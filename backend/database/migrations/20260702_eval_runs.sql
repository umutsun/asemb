-- Eval infrastructure (workstreams C3-C5): run/result persistence + evalSettings.* rows
-- Date: 2026-07-02
-- Apply to the tenant DB (bookie demo). Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Pairs with code: backend/python-services/eval/ — report.py persists rows here;
-- every eval runner keeps working WITHOUT these tables (it just skips DB
-- persistence with a warning), so applying this is safe but not urgent.
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in).

-- =============================================
-- TABLE: eval_runs — one row per eval invocation
-- =============================================
CREATE TABLE IF NOT EXISTS eval_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    kind TEXT,                    -- 'retrieval' | 'answers' | 'full'
    golden_set TEXT,              -- golden file stem, e.g. 'uae_v1.draft'
    git_sha TEXT,
    config JSONB,                 -- resolved eval config snapshot (k, matcher mode, thresholds, filters)
    summary JSONB,                -- metrics + hard/soft fails
    total_cost_usd NUMERIC(10,4)  -- judge/LLM spend for the run (NULL when no LLM stage ran)
);

COMMENT ON TABLE eval_runs IS 'RAG eval runs (backend/python-services/eval). One row per invocation of run_retrieval/run_all.';

-- =============================================
-- TABLE: eval_results — one row per golden item per run
-- =============================================
CREATE TABLE IF NOT EXISTS eval_results (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES eval_runs(id) ON DELETE CASCADE,
    question_id TEXT,
    lang TEXT,
    passed BOOLEAN,
    metrics JSONB,                -- rank / check outcomes / judge verdict
    answer TEXT,                  -- chat answer (answer-level runs only)
    sources JSONB,                -- chat sources snapshot (answer-level runs only)
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_eval_results_run ON eval_results(run_id);

COMMENT ON TABLE eval_results IS 'Per-golden-item outcomes for an eval run (FK eval_runs).';

-- =============================================
-- SETTINGS: evalSettings.* rows mirroring eval/config.py DEFAULTS.
-- ON CONFLICT DO NOTHING: existing tenant-tuned values are never overwritten;
-- the in-code defaults in eval/config.py remain the single fallback.
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.goldenSet', 'uae_v1', 'eval',
        'Golden-set name; runners load eval/golden/<name>.json (falling back to <name>.draft.json)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.retrievalK', '10', 'eval',
        'Top-K retrieved results scored by the retrieval eval')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.matcherMode', 'fallback', 'eval',
        'Golden-item matching: fallback (content regex) or metadata (metadata.law_key/article_number)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.judgeModel', 'gpt-4o-mini', 'eval',
        'OpenAI model for the groundedness LLM judge (eval/checks/judge.py)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.judgePrompt', $judge_prompt$You are a strict evaluation judge for a legal RAG assistant answering questions about UAE legislation. You are given a question, the retrieved source excerpts, and the assistant's answer. Score groundedness:
- grounded=2: every factual claim in the answer is directly supported by the excerpts, and any cited law/article references match the excerpts.
- grounded=1: the answer is broadly consistent with the excerpts but adds claims the excerpts do not support.
- grounded=0: the answer contradicts the excerpts, invents laws, article numbers, figures or deadlines, or gives a substantive answer although the excerpts are irrelevant to the question.
Refusal handling: if the excerpts do not contain the information needed, a clear refusal ('the sources do not cover this') scores grounded=2 and any substantive answer scores grounded=0.
Also report: correct_law (does the answer rely on the law the question is about, per the excerpts?), correct_article (are the article numbers the answer cites correct per the excerpts? true when the answer cites no articles), and unsupported_claims (verbatim claims from the answer that the excerpts do not support; empty list when fully grounded).
Respond with JSON only: {"grounded": 0 | 1 | 2, "correct_law": true | false, "correct_article": true | false, "unsupported_claims": ["..."], "notes": "<short English explanation>"}$judge_prompt$,
        'eval',
        'System prompt for the groundedness LLM judge (verdict schema: grounded 0|1|2, correct_law, correct_article, unsupported_claims, notes)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.thresholds',
        '{"recallAt5": 0.8, "recallAt5PerLangMin": 0.7, "maxLangDelta": 0.2, "mrr": 0.6, "citationValidity": 1.0, "markdownLintErrors": 0, "languageMatch": 0.95, "groundednessMean": 0.85}',
        'eval',
        'JSON pass/fail thresholds for the eval runners (retrieval + answer-level checks)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.chatUrl', 'http://localhost:8083/api/v2/chat', 'eval',
        'Chat endpoint for answer-level evals (env EVAL_CHAT_URL overrides)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, category, description)
VALUES ('evalSettings.seedDomainBuckets',
        $seed_buckets$[{"name": "tax", "lawNameKeywords": ["Corporate Tax", "Value Added Tax", "Tax Procedures", "Excise Tax", "Federal Decree-Law No. 47 of 2022", "Federal Decree-Law No. 8 of 2017", "Federal Decree-Law No. 28 of 2022", "Federal Decree-Law No. 7 of 2017"]}, {"name": "labour", "lawNameKeywords": ["Labour Law", "Regulation of Labour Relations", "DIFC Employment"]}, {"name": "civil-commercial", "lawNameKeywords": ["Civil Transactions", "Commercial Transactions", "Commercial Companies", "Consumer Protection", "Commercial Agencies"]}, {"name": "banking", "lawNameKeywords": ["Central Bank", "Anti-Money Laundering", "Insurance Activities"]}]$seed_buckets$,
        'eval',
        'JSON domain buckets (law-name keywords) used by the golden-set sampler eval/seed_golden.py')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- VERIFICATION
-- =============================================
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('eval_runs', 'eval_results');
-- SELECT key FROM settings WHERE category = 'eval' ORDER BY key;
