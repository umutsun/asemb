@echo off
REM ASEMB Quick Deploy Script for n8n.luwi.dev (Windows)

echo ========================================
echo ASEMB n8n.luwi.dev Deployment Script
echo ========================================

REM Configuration - UPDATE THESE
set SERVER=n8n.luwi.dev
set SERVER_USER=your-username
set NODE_DIR=/home/node/.n8n/nodes
set DEPLOY_NAME=n8n-nodes-alice-semantic-bridge

REM Step 1: Build
echo Step 1: Building project...
call npm run build:prod
if %ERRORLEVEL% NEQ 0 (
    echo Build failed! Exiting...
    exit /b 1
)
echo Build successful

REM Step 2: Create deployment package
echo Step 2: Creating deployment package...
if exist deploy-temp rmdir /s /q deploy-temp
mkdir deploy-temp
xcopy /E /I dist deploy-temp\dist
copy package.json deploy-temp\
copy README.md deploy-temp\

REM Create tar.gz using PowerShell
powershell -Command "Compress-Archive -Path deploy-temp\* -DestinationPath %DEPLOY_NAME%.zip"
echo Package created: %DEPLOY_NAME%.zip

REM Step 3: Upload instructions
echo.
echo Step 3: Manual upload required
echo ===============================
echo 1. Upload %DEPLOY_NAME%.zip to %SERVER%
echo    Use WinSCP, FileZilla, or similar
echo.
echo 2. SSH to server and run:
echo    cd %NODE_DIR%
echo    mkdir -p %DEPLOY_NAME%
echo    cd %DEPLOY_NAME%
echo    unzip /tmp/%DEPLOY_NAME%.zip
echo    npm install --production
echo.
echo 3. Restart n8n:
echo    docker restart n8n-container
echo    OR
echo    pm2 restart n8n
echo.
echo 4. Verify at https://n8n.luwi.dev
echo    Search for 'Alice' in nodes

REM Cleanup
rmdir /s /q deploy-temp

echo.
echo Deployment package ready: %DEPLOY_NAME%.zip
pause
