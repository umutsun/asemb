-- API Tokens for external bearer-key access to the chatbot.
-- Plaintext token format: lsemb_<64 hex chars>. We store only the SHA-256 hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  scopes        text[] NOT NULL DEFAULT ARRAY['chat'],
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS api_tokens_active_idx
  ON api_tokens (token_hash)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE api_tokens IS 'Long-lived bearer tokens issued from the Settings UI for external API access.';
COMMENT ON COLUMN api_tokens.token_hash IS 'SHA-256 hex of the plaintext token. Plaintext is shown to the user once on creation and never stored.';
