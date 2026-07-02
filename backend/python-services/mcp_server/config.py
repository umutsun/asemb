"""
LSEMB MCP server — configuration.

Fully self-contained: the MCP server does NOT import the main python-services
package (that pulls heavy deps and pins pydantic==2.5.2). It reads the same
.env.lsemb the rest of the stack uses, but owns its own DB/Redis/Celery clients.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env.lsemb from the repo root (mcp_server/ -> python-services -> backend -> root)
_REPO_ROOT = Path(__file__).resolve().parents[3]
for _candidate in (_REPO_ROOT / ".env.lsemb", _REPO_ROOT / ".env"):
    if _candidate.exists():
        load_dotenv(dotenv_path=_candidate, override=False)

# --- Data sources (same values the python-services / celery use) ----------------
DATABASE_URL = os.getenv("DATABASE_URL", "")

REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/2")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", CELERY_BROKER_URL)

# --- Upstream HTTP services we proxy control actions to -------------------------
# Python FastAPI service (crawl batch trigger, media reingest).
PYTHON_SERVICE_URL = os.getenv("PYTHON_SERVICE_URL", "http://localhost:8004").rstrip("/")
# Node/Express backend (embedding pause/stop/generate).
BACKEND_URL = os.getenv("MCP_BACKEND_URL", os.getenv("BACKEND_URL", "http://localhost:8083")).rstrip("/")
# Shared internal key the Python service expects in X-API-Key (prod only).
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

# --- MCP server transport -------------------------------------------------------
# Bind to all interfaces by default so it is reachable over Tailscale; the
# X-API-Key gate below is the security boundary. Set MCP_HOST=127.0.0.1 to keep
# it local-only.
MCP_HOST = os.getenv("MCP_HOST", "0.0.0.0")
MCP_PORT = int(os.getenv("MCP_PORT", "8765"))
MCP_PATH = os.getenv("MCP_PATH", "/mcp")

# Key clients must present as X-API-Key. Defaults to the shared INTERNAL_API_KEY
# so there's one secret to manage. Auth can be disabled for local stdio-style use.
MCP_API_KEY = os.getenv("MCP_API_KEY", INTERNAL_API_KEY)
MCP_AUTH_ENABLED = os.getenv("MCP_AUTH_ENABLED", "true").lower() in ("1", "true", "yes", "on")

# DB-driven key (Hard Rule #1): the auth gate ALSO accepts whatever is stored in
# the settings table under this key, so an admin can rotate it from the UI without
# touching env/PM2. Either the env key above or this settings value is accepted.
MCP_SETTINGS_KEY = os.getenv("MCP_SETTINGS_KEY", "security.mcpBearerKey")
MCP_SETTINGS_CACHE_TTL = float(os.getenv("MCP_SETTINGS_CACHE_TTL", "30"))

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
