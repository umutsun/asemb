@echo off
REM Test RAG Search and Chat API

echo.
echo ===================================
echo 🔍 Testing RAG Semantic Search API
echo ===================================
echo.

REM 1. Test semantic search
echo 1. Semantic Search Test - Query: 'vergi'
echo ----------------------------------------
curl -X POST http://localhost:8080/api/v2/search/semantic -H "Content-Type: application/json" -d "{\"query\": \"vergi\", \"limit\": 3}"
echo.
echo.

REM 2. Test hybrid search
echo 2. Hybrid Search Test - Query: 'elektrik'
echo -----------------------------------------
curl -X POST http://localhost:8080/api/v2/search/hybrid -H "Content-Type: application/json" -d "{\"query\": \"elektrik\", \"limit\": 3}"
echo.
echo.

REM 3. Test search stats
echo 3. Search Statistics
echo --------------------
curl http://localhost:8080/api/v2/search/stats
echo.
echo.

REM 4. Test chat API
echo 4. RAG Chat Test - Question: 'KDV oranlari nedir?'
echo --------------------------------------------------
curl -X POST http://localhost:8080/api/v2/chat -H "Content-Type: application/json" -d "{\"message\": \"KDV oranlari nedir?\", \"conversationId\": \"test-conv-001\"}"
echo.
echo.

REM 5. Test conversation list
echo 5. User Conversations
echo ---------------------
curl "http://localhost:8080/api/v2/chat/conversations?userId=demo-user"
echo.
echo.

echo ✅ Test complete!
pause
