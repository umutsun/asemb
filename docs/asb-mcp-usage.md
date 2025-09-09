asb-cli MCP Integration (Local Codex Config)

What’s included
- Local config at `.codex/mcp.config.json` registering `asb-cli` via node + stdio.
- Wrapper runner at `scripts/asb-mcp-run.js` to launch the server manually.

Verify locally
1) Ensure Node.js is installed and `C:\mcp-servers\asb-cli\index.js` exists.
2) From repo root, run:
   - `node scripts/asb-mcp-run.js --help` (or without args) to check it boots.
3) If your client supports repo-local MCP config, it will discover `.codex/mcp.config.json`.

Notes
- If your entry file is ESM, ensure your asb-cli `package.json` has `"type": "module"` or use `index.mjs`.
- To change the server path, edit both `.codex/mcp.config.json` and `scripts/asb-mcp-run.js`.

