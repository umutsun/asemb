-- =============================================================================
-- MCP monitoring server (lsemb-mcp) — DB-driven bearer key.
-- The MCP server's X-API-Key gate accepts EITHER the env INTERNAL_API_KEY OR
-- this settings value, so an admin can set/rotate the MCP key from the UI
-- without touching env/PM2 (Hard Rule #1: DB-driven settings).
--
-- Additive + idempotent: ON CONFLICT DO NOTHING never clobbers an admin value.
-- Default blank → the env key remains the working credential until this is set.
-- =============================================================================
-- Key lives under the `security.` prefix so it slots into the existing Security
-- settings tab (prefix == category) and is masked by the secret-redaction regex
-- (…bearerKey$). The MCP server reads settings[security.mcpBearerKey].
INSERT INTO settings (key, value, category, description) VALUES
    ('security.mcpBearerKey', '', 'security',
     'X-API-Key for the lsemb-mcp monitoring server. Blank = use the env INTERNAL_API_KEY. Treated as a secret (redacted on read).')
ON CONFLICT (key) DO NOTHING;
