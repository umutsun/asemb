"""LSEMB MCP server — remote monitoring & control of scrape/embed operations."""

__all__ = ["main"]


def main():
    from .server import main as _main
    _main()
