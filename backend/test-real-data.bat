@echo off
REM Test RAG Search with Real Data

echo.
echo ========================================
echo 🔍 Testing RAG Search with Real Database
echo ========================================
echo.

REM 1. Test health
echo 1. Health Check
echo ---------------
curl -s http://localhost:8080/health
echo.
echo.

REM 2. Get statistics
echo 2. Database Statistics
echo ---------------------
curl -s http://localhost:8080/api/v2/search/stats
echo.
echo.

REM 3. Get sample documents
echo 3. Sample Documents
echo ------------------
curl -s http://localhost:8080/api/v2/search/samples?limit=3
echo.
echo.

REM 4. Test semantic search with real queries
echo 4. Semantic Search Test - Query: 'elektrik'
echo ------------------------------------------
curl -s -X POST http://localhost:8080/api/v2/search/semantic -H "Content-Type: application/json" -d "{\"query\": \"elektrik\", \"limit\": 3}"
echo.
echo.

REM 5. Test search by source
echo 5. Search by Source - SORUCEVAP
echo -------------------------------
curl -s -X POST http://localhost:8080/api/v2/search/source -H "Content-Type: application/json" -d "{\"sourceTable\": \"sorucevap\", \"query\": \"vergi\", \"limit\": 3}"
echo.
echo.

REM 6. Test similar documents
echo 6. Find Similar Documents - ID: 26659
echo ------------------------------------
curl -s http://localhost:8080/api/v2/search/similar/26659?limit=3
echo.
echo.

REM 7. Test chat with real context
echo 7. RAG Chat Test - Question: 'elektrik faturasi'
echo -----------------------------------------------
curl -s -X POST http://localhost:8080/api/v2/chat -H "Content-Type: application/json" -d "{\"message\": \"elektrik faturasi hakkinda bilgi verir misin?\", \"conversationId\": \"test-real-001\"}"
echo.
echo.

echo ✅ Test complete!
pause
