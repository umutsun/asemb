@echo off
echo Alice Semantic Bridge Setup
echo ==============================
echo.
echo Installing dependencies...
npm install
echo.
echo Setting up database...
node scripts\setup-db.js
echo.
echo Initializing Redis...
node scripts\init-shared-memory.js
echo.
echo Running migrations...
node scripts\migrate.js
echo.
echo Setup complete!
