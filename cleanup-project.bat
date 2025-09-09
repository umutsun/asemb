@echo off
REM Alice Semantic Bridge - Project Cleanup Script (Windows)
REM This script removes temporary files and organizes the project structure

echo ========================================
echo Alice Semantic Bridge - Project Cleanup
echo ========================================
echo.

REM Create backup directory with timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set BACKUP_DIR=.backup-%datetime:~0,8%-%datetime:~8,6%
mkdir "%BACKUP_DIR%\configs" 2>nul
mkdir "%BACKUP_DIR%\scripts" 2>nul
mkdir "%BACKUP_DIR%\docs" 2>nul

echo Creating backup at: %BACKUP_DIR%
echo.

REM Remove temporary test files
echo Removing temporary test files...
move test-*.bat "%BACKUP_DIR%\" 2>nul
move test-*.js "%BACKUP_DIR%\" 2>nul
move test-*.mjs "%BACKUP_DIR%\" 2>nul
move test-*.sh "%BACKUP_DIR%\" 2>nul

REM Remove fix scripts
echo Removing fix scripts...
move fix-*.bat "%BACKUP_DIR%\" 2>nul
move fix-*.js "%BACKUP_DIR%\" 2>nul

REM Remove duplicate claude desktop configs
echo Removing duplicate configs...
move claude_desktop_step*.json "%BACKUP_DIR%\" 2>nul
move claude_desktop_minimal.json "%BACKUP_DIR%\" 2>nul
move claude_desktop_fixed.json "%BACKUP_DIR%\" 2>nul
move claude_desktop_working.json "%BACKUP_DIR%\" 2>nul
move claude_desktop_complete.json "%BACKUP_DIR%\" 2>nul

REM Consolidate setup scripts
echo Consolidating setup scripts...
move setup-*.bat "%BACKUP_DIR%\scripts\" 2>nul
move quick-*.bat "%BACKUP_DIR%\scripts\" 2>nul
move restart-*.bat "%BACKUP_DIR%\scripts\" 2>nul
move install-*.bat "%BACKUP_DIR%\scripts\" 2>nul

REM Consolidate migration scripts
echo Consolidating migration scripts...
move migrate-*.js "%BACKUP_DIR%\scripts\" 2>nul

REM Consolidate MCP configs
echo Consolidating MCP configs...
move *-mcp-server.js "%BACKUP_DIR%\configs\" 2>nul
move *-cli-config.json "%BACKUP_DIR%\configs\" 2>nul

REM Consolidate documentation
echo Consolidating documentation...
move *_MCP_*.md "%BACKUP_DIR%\docs\" 2>nul
move AGENT_*.md "%BACKUP_DIR%\docs\" 2>nul
move PHASE*.md "%BACKUP_DIR%\docs\" 2>nul
move *_STATUS.md "%BACKUP_DIR%\docs\" 2>nul

REM Remove other temporary files
echo Removing other temporary files...
move *.zip "%BACKUP_DIR%\" 2>nul
move check-*.js "%BACKUP_DIR%\" 2>nul
move sync-*.bat "%BACKUP_DIR%\" 2>nul
move update-*.bat "%BACKUP_DIR%\" 2>nul

REM Clean up .env variants
echo Backing up environment variants...
move .env.luwi "%BACKUP_DIR%\configs\" 2>nul
move .env.asemb "%BACKUP_DIR%\configs\" 2>nul
move .env.production "%BACKUP_DIR%\configs\" 2>nul

REM Create organized structure
echo Creating organized structure...
mkdir scripts\setup 2>nul
mkdir scripts\deploy 2>nul
mkdir scripts\utils 2>nul
mkdir docs\archive 2>nul

REM Create main setup script
echo Creating main setup script...
(
echo @echo off
echo echo Alice Semantic Bridge Setup
echo echo ==============================
echo echo.
echo echo Installing dependencies...
echo npm install
echo echo.
echo echo Setting up database...
echo node scripts\setup-db.js
echo echo.
echo echo Initializing Redis...
echo node scripts\init-shared-memory.js
echo echo.
echo echo Running migrations...
echo node scripts\migrate.js
echo echo.
echo echo Setup complete!
) > scripts\setup.bat

echo.
echo ========================================
echo Cleanup complete!
echo ========================================
echo.
echo Summary:
echo   - Backup created at: %BACKUP_DIR%
echo   - Temporary files moved to backup
echo   - Documentation consolidated
echo   - Project structure organized
echo.
echo Next steps:
echo   1. Review files in %BACKUP_DIR%
echo   2. Delete backup after confirming nothing important was removed
echo   3. Run 'git status' to see changes
echo   4. Commit the cleaned project structure
echo.
pause
