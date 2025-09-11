# Test N8N and PostgreSQL connections with IP addresses

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Connections with IP: 91.99.229.96" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Test N8N
Write-Host "Testing N8N API..." -ForegroundColor Yellow
$n8nUrl = "http://91.99.229.96:5678/api/v1/workflows"
$headers = @{
    "X-N8N-API-KEY" = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MzhiMjFmOS03NTE2LTQ5YjItOTBjZS0zMTQ4NjA1ZDQ0NTQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzUyNjA3MzE5fQ.jVoHfsa92S5xUv4M4h2YyAKKnQ3Yv6WH62R9D0A1zTk"
}

try {
    $response = Invoke-WebRequest -Uri $n8nUrl -Headers $headers -Method GET -UseBasicParsing
    Write-Host "✅ N8N API is accessible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ N8N API connection failed: $_" -ForegroundColor Red
}

Write-Host "`nTesting PostgreSQL..." -ForegroundColor Yellow
$pgTest = Test-NetConnection -ComputerName "91.99.229.96" -Port 5432 -WarningAction SilentlyContinue

if ($pgTest.TcpTestSucceeded) {
    Write-Host "✅ PostgreSQL port 5432 is open" -ForegroundColor Green
} else {
    Write-Host "❌ PostgreSQL port 5432 is not accessible" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Updating Configuration Files..." -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Copy configuration
$source = "claude_desktop_final_ip.json"
$destination = "$env:APPDATA\Claude\claude_desktop_config.json"

if (Test-Path $source) {
    Copy-Item $source $destination -Force
    Write-Host "✅ Configuration copied to Claude Desktop" -ForegroundColor Green
} else {
    Write-Host "❌ Source configuration not found" -ForegroundColor Red
}

# Copy .env file
$envSource = ".env"
$envDest = "C:\mcp-servers\alice-shell-bridge\.env"

if (Test-Path $envSource) {
    if (!(Test-Path "C:\mcp-servers\alice-shell-bridge")) {
        New-Item -Path "C:\mcp-servers\alice-shell-bridge" -ItemType Directory -Force | Out-Null
    }
    Copy-Item $envSource $envDest -Force
    Write-Host "✅ Environment variables copied" -ForegroundColor Green
} else {
    Write-Host "⚠️ .env file not found" -ForegroundColor Yellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Configuration Complete!" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Updated endpoints:" -ForegroundColor White
Write-Host "- N8N API: http://91.99.229.96:5678" -ForegroundColor Gray
Write-Host "- PostgreSQL: postgresql://postgres@91.99.229.96:5432" -ForegroundColor Gray
Write-Host "`nPlease restart Claude Desktop to apply changes." -ForegroundColor Yellow

Read-Host "`nPress Enter to exit"