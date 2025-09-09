@echo off
cls
echo =========================================
echo    ASEMB n8n.luwi.dev Deployment Tool
echo =========================================
echo.

echo [1] Build Project
echo ------------------------
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Build failed! Please fix errors and try again.
    pause
    exit /b 1
)
echo [OK] Build completed successfully!
echo.

echo [2] Prepare Deployment Package
echo ------------------------
node scripts\prepare-deploy.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Deployment preparation failed!
    pause
    exit /b 1
)
echo.

echo [3] Create Archive
echo ------------------------
cd deploy
tar -czf ..\asemb-n8n-node-v0.2.0.tar.gz *
cd ..
echo [OK] Archive created: asemb-n8n-node-v0.2.0.tar.gz
echo.

echo =========================================
echo    DEPLOYMENT PACKAGE READY!
echo =========================================
echo.
echo Package: asemb-n8n-node-v0.2.0.tar.gz
echo.
echo Included Nodes:
echo - ASEMBWorkflow (All-in-one operations)
echo - AliceSemanticBridgeV2 (Advanced semantic)
echo - PgHybridQuery (Hybrid search)
echo - WebScrapeEnhanced (Web scraping)
echo - TextChunk (Text chunking)
echo - DocumentProcessor (Document processing)
echo - SitemapFetch (Sitemap processing)
echo.
echo Credentials:
echo - PostgresDb (NEW - Standard PostgreSQL)
echo - OpenAiApi (For embeddings)
echo - RedisApi (Optional caching)
echo.
echo =========================================
echo    NEXT STEPS FOR n8n.luwi.dev
echo =========================================
echo.
echo 1. Upload asemb-n8n-node-v0.2.0.tar.gz to server
echo    Use: FileZilla, WinSCP, or scp command
echo.
echo 2. SSH to n8n.luwi.dev and run:
echo    cd ~/.n8n/nodes
echo    mkdir -p n8n-nodes-alice-semantic-bridge
echo    cd n8n-nodes-alice-semantic-bridge
echo    tar -xzf /path/to/asemb-n8n-node-v0.2.0.tar.gz
echo    npm install --production
echo.
echo 3. Restart n8n:
echo    pm2 restart n8n
echo    OR
echo    docker restart n8n-container
echo.
echo 4. Configure in n8n UI:
echo    - Create PostgresDb credential
echo    - Create OpenAiApi credential
echo    - Import example-workflow.json
echo.
echo =========================================
pause
