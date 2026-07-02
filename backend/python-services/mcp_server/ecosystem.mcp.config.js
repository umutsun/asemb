// PM2 config for the LSEMB MCP server (lsemb-mcp).
//
//   pm2 start backend/python-services/mcp_server/ecosystem.mcp.config.js
//
// Uses an ISOLATED venv (.venv-mcp) so the modern `mcp` SDK does not disturb the
// pinned main python-services deps. Create it once:
//   cd backend/python-services
//   python3 -m venv .venv-mcp
//   .venv-mcp/bin/pip install -r mcp_server/requirements.mcp.txt
//
// Windows: set MCP_PY to .venv-mcp\Scripts\python.exe
const path = require('path');
const PY_SVC = path.resolve(__dirname, '..'); // backend/python-services

module.exports = {
  apps: [
    {
      name: 'lsemb-mcp',
      script: path.join(PY_SVC, 'run_mcp.py'),
      interpreter:
        process.env.MCP_PY || path.join(PY_SVC, '.venv-mcp', 'bin', 'python'),
      cwd: PY_SVC,
      env: {
        PYTHONUNBUFFERED: '1',
        MCP_HOST: process.env.MCP_HOST || '0.0.0.0',
        MCP_PORT: process.env.MCP_PORT || '8765',
        // MCP_API_KEY defaults to INTERNAL_API_KEY from .env.lsemb if unset.
        // Set MCP_AUTH_ENABLED=false only for trusted local use.
      },
      error_file: './logs/mcp-error.log',
      out_file: './logs/mcp-out.log',
      time: true,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      windowsHide: true,
    },
  ],
};
