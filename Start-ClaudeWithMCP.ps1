# Set MCP configuration for Claude Code
$env:CLAUDE_MCP_CONFIG = "C:\xampp\htdocs\alice-semantic-bridge\claude-code-config.json"

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " Claude Code MCP PowerShell Launcher" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Create the MCP config file
$config = @{
    mcpServers = @{
        filesystem = @{
            command = "npx"
            args = @("-y", "@modelcontextprotocol/server-filesystem", "C:\xampp\htdocs\alice-semantic-bridge")
        }
        "asb-cli" = @{
            command = "node"
            args = @("C:\xampp\htdocs\alice-semantic-bridge\claude-code-mcp-server.js")
            env = @{
                AGENT_NAME = "claude-code"
                PROJECT_KEY = "alice-semantic-bridge"
                PROJECT_ROOT = "C:\xampp\htdocs\alice-semantic-bridge"
                REDIS_HOST = "localhost"
                REDIS_PORT = "6379"
                REDIS_DB = "2"
            }
        }
    }
}

# Write config to file
$config | ConvertTo-Json -Depth 10 | Set-Content -Path "claude-code-config.json"

Write-Host "MCP Configuration created at: claude-code-config.json" -ForegroundColor Green
Write-Host "Environment variable set: CLAUDE_MCP_CONFIG" -ForegroundColor Green
Write-Host ""
Write-Host "Starting Claude Code..." -ForegroundColor Yellow
Write-Host ""

# Start Claude Code
& claude
