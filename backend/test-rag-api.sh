#!/bin/bash
# Test RAG Search and Chat API

echo "🔍 Testing RAG Semantic Search API"
echo "=================================="

# 1. Test semantic search
echo -e "\n1. Semantic Search Test - Query: 'vergi'"
curl -X POST http://localhost:8080/api/v2/search/semantic \
  -H "Content-Type: application/json" \
  -d '{
    "query": "vergi",
    "limit": 3
  }' | jq '.'

# 2. Test hybrid search
echo -e "\n\n2. Hybrid Search Test - Query: 'elektrik'"
curl -X POST http://localhost:8080/api/v2/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "query": "elektrik",
    "limit": 3
  }' | jq '.'

# 3. Test search stats
echo -e "\n\n3. Search Statistics"
curl http://localhost:8080/api/v2/search/stats | jq '.'

# 4. Test chat API
echo -e "\n\n4. RAG Chat Test - Question: 'KDV oranları nedir?'"
curl -X POST http://localhost:8080/api/v2/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "KDV oranları nedir?",
    "conversationId": "test-conv-001"
  }' | jq '.'

# 5. Test conversation list
echo -e "\n\n5. User Conversations"
curl "http://localhost:8080/api/v2/chat/conversations?userId=demo-user" | jq '.'

echo -e "\n\n✅ Test complete!"
