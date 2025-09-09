# PowerShell MCP Function
# Add this to your PowerShell profile to use 'mcp' command globally

function mcp {
    param(
        [Parameter(ValueFromRemainingArguments=$true)]
        [string[]]$Arguments
    )
    
    $projectPath = "C:\xampp\htdocs\alice-semantic-bridge"
    
    if ($Arguments.Count -eq 0) {
        # No arguments, show MCP status
        & node "$projectPath\mcp-check.js"
    } else {
        # Pass arguments to mcp.js
        & node "$projectPath\mcp.js" $Arguments
    }
}

# Alias for quick access
Set-Alias -Name mcp-status -Value "npm run mcp:status"
Set-Alias -Name mcp-agents -Value "npm run mcp:agents"
Set-Alias -Name vibe -Value "npm run vibe"

Write-Host "MCP commands loaded!" -ForegroundColor Green
Write-Host "Usage: mcp [command]" -ForegroundColor Cyan
Write-Host "       mcp status" -ForegroundColor Gray
Write-Host "       mcp agents" -ForegroundColor Gray
Write-Host "       mcp help" -ForegroundColor Gray
