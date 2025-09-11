@echo off
cls
echo =========================================
echo    Terminal Agents MCP Manual Setup
echo =========================================
echo.
echo VS Code Claude Dev Extension icinde:
echo.
echo 1. Claude Dev extension'i acin
echo 2. Terminal sekmesinde agent'i secin (Codex/Gemini/Claude)
echo 3. Agent terminal'inde su komutlari calistirin:
echo.
echo ---- CODEX ICIN ----
echo cd .codex
echo /add mcp
echo [mcp-full.json icerigini yapistirin]
echo.
echo ---- GEMINI ICIN ----
echo cd .gemini
echo /add mcp
echo [mcp-full.json icerigini yapistirin]
echo.
echo =========================================
echo    Alternatif: Claude Dev Config Klasoru
echo =========================================
echo.
echo Claude Dev config klasoru:
echo %APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\
echo.
echo Agent config dosyalari:
echo - settings\claude\mcp.json
echo - settings\codex\mcp.json
echo - settings\gemini\mcp.json
echo.
echo Bu dosyalara mcp-full.json icerigini kopyalayabilirsiniz.
echo.
echo =========================================
echo    MCP Config Dosya Icerikleri
echo =========================================
echo.
echo CODEX: .codex\mcp-full.json
echo GEMINI: .gemini\mcp-full.json
echo CLAUDE: .claude\mcp-full.json
echo.
echo Bu dosyalardaki JSON'u kopyalayip
echo Claude Dev terminal'inde /add mcp sonrasi yapistirin.
echo.
pause
