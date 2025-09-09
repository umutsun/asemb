# Global MCP Setup for Terminal Agents

Write-Host "Setting up global MCP configuration for all terminal agents..." -ForegroundColor Cyan
Write-Host ""

# MCP Configuration
$mcpConfig = @{
    mcpServers = @{
        "asb-cli" = @{
            command = "node"
            args = @("C:\mcp-servers\asb-cli\index.js")
            env = @{
                AGENT_NAME = "claude"
                PROJECT_KEY = "alice-semantic-bridge"
                POSTGRES_HOST = "91.99.229.96"
                POSTGRES_PORT = "5432"
                POSTGRES_DB = "asemb"
                POSTGRES_USER = "postgres"
                POSTGRES_PASSWORD = "Semsiye!22"
                REDIS_HOST = "localhost"
                REDIS_PORT = "6379"
                REDIS_DB = "2"
            }
        }
    }
}

# Agents to configure
$agents = @(
    @{name="claude"; path="$env:USERPROFILE\.claude"},
    @{name="gemini"; path="$env:USERPROFILE\.gemini"},
    @{name="codex"; path="$env:USERPROFILE\.codex"}
)

# Create config for each agent
foreach ($agent in $agents) {
    Write-Host "Configuring $($agent.name)..." -ForegroundColor Yellow
    
    # Create directory if not exists
    if (-not (Test-Path $agent.path)) {
        New-Item -ItemType Directory -Path $agent.path -Force | Out-Null
        Write-Host "  Created directory: $($agent.path)" -ForegroundColor Green
    }
    
    # Update AGENT_NAME for current agent
    $agentConfig = $mcpConfig.Clone()
    $agentConfig.mcpServers."asb-cli".env.AGENT_NAME = $agent.name
    
    # Convert to JSON and save
    $jsonPath = Join-Path $agent.path "mcp.json"
    $agentConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonPath -Encoding UTF8
    
    Write-Host "  Created: $jsonPath" -ForegroundColor Green
    Write-Host ""
}

Write-Host "Global MCP configuration completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Locations:" -ForegroundColor Cyan
$agents | ForEach-Object {
    Write-Host "  $($_.name): $(Join-Path $_.path 'mcp.json')"
}
Write-Host ""
Write-Host "Please restart your terminal agents for changes to take effect." -ForegroundColor Yellow
Write-Host ""
Write-Host "Test with: /mcp" -ForegroundColor Magenta
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")