"""Launcher for the LSEMB MCP server (PM2-friendly).

Run from backend/python-services so `mcp_server` is importable:
    python run_mcp.py
or equivalently:
    python -m mcp_server
"""

from mcp_server.server import main

if __name__ == "__main__":
    main()
