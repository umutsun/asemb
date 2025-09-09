@echo off
:: MCP Command Wrapper for Windows
:: This allows 'mcp' command to work in CMD/PowerShell

if "%1"=="" (
    node "%~dp0mcp-check.js"
) else (
    node "%~dp0mcp.js" %*
)
