import os
import sys
import asyncio
import requests
import json
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
import time

# Load environment
load_dotenv('../.env')

# Configuration
LIGHTRAG_URL = "http://localhost:8001"
SOURCE_DB = os.getenv('SOURCE_DB')
BATCH_SIZE = 100

def check_lightrag_service():
    """Check if LightRAG service is running"""
    try:
        response = requests.get(f"{LIGHTRAG_URL}/")
        return response.status_code == 200
    except:
        return False

def index_to_lightrag(text):
    """Index text to LightRAG"""
    try:
        response = requests.post(
            f"{LIGHTRAG_URL}/index",
            json={"text": text},
            headers={"Content-Type": "application/json"}
        )
        return response.status_code == 200
    except Exception as e:
        print(f"Error indexing to LightRAG: {e}")
        return False

def migrate_table(table_name, fields, limit=None):
    """Migrate a single table to LightRAG"""
    print(f"\n📊 Migrating {table_name}...")
    
    conn = psycopg2.connect(SOURCE_DB)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Get total count
    cur.execute(f"SELECT COUNT(*) as count FROM public.{table_name}")
    total = cur.fetchone()['count']
    print(f"Total records: {total}")
    
    # Build query
    query = f"SELECT * FROM public.{table_name}"
    if limit:
        query += f" LIMIT {limit}"
    
    cur.execute(query)
    
    indexed_count = 0
    batch_texts = []
    
    while True:
        rows = cur.fetchmany(BATCH_SIZE)
        if not rows:
            break
        
        for row in rows:
            # Combine relevant fields
            content_parts = []
            
            # Add title/primary field
            if 'Baslik' in row and row['Baslik']:
                content_parts.append(f"Başlık: {row['Baslik']}")
            elif 'Konusu' in row and row['Konusu']:
                content_parts.append(f"Konu: {row['Konusu']}")
            elif 'Soru' in row and row['Soru']:
                content_parts.append(f"Soru: {row['Soru']}")
            
            # Add other fields
            for field in fields:
                if field in row and row[field]:
                    if field == 'Cevap':
                        content_parts.append(f"Cevap: {row[field]}")
                    elif field == 'Icerik':
                        content_parts.append(f"İçerik: {row[field]}")
                    elif field == 'Ozeti':
                        content_parts.append(f"Özet: {row[field]}")
                    else:
                        content_parts.append(row[field])
            
            # Add metadata
            if 'IlgiliKanun' in row and row['IlgiliKanun']:
                content_parts.append(f"İlgili Kanun: {row['IlgiliKanun']}")
            
            if 'Kaynak' in row and row['Kaynak']:
                content_parts.append(f"Kaynak: {row['Kaynak']}")
            
            # Combine all parts
            full_text = "\n\n".join(content_parts)
            
            if full_text.strip():
                batch_texts.append(full_text)
            
            # Index batch when full
            if len(batch_texts) >= 10:
                combined_text = "\n\n---\n\n".join(batch_texts)
                if index_to_lightrag(combined_text):
                    indexed_count += len(batch_texts)
                    print(f"✅ Indexed {indexed_count}/{total if not limit else min(total, limit)} records")
                else:
                    print(f"❌ Failed to index batch")
                
                batch_texts = []
                time.sleep(0.5)  # Rate limiting
    
    # Index remaining texts
    if batch_texts:
        combined_text = "\n\n---\n\n".join(batch_texts)
        if index_to_lightrag(combined_text):
            indexed_count += len(batch_texts)
            print(f"✅ Indexed {indexed_count}/{total if not limit else min(total, limit)} records")
    
    cur.close()
    conn.close()
    
    return indexed_count

def main():
    print("🚀 LightRAG Migration Tool")
    print("=" * 50)
    
    # Check service
    if not check_lightrag_service():
        print("❌ LightRAG service is not running!")
        print("Please start it with: uvicorn app:app --reload --port 8001")
        return
    
    print("✅ LightRAG service is running")
    
    # Tables to migrate
    tables = [
        {
            'name': 'sorucevap',
            'fields': ['Soru', 'Cevap', 'IlgiliKanun', 'Donemi'],
            'limit': 1000  # Test with 1000 first
        },
        {
            'name': 'makaleler',
            'fields': ['Baslik', 'Icerik', 'Yazar', 'IlgiliKanun'],
            'limit': 200
        },
        {
            'name': 'danistaykararlari',
            'fields': ['Konusu', 'Ozeti', 'Icerik', 'IlgiliKanun', 'Daire'],
            'limit': 200
        },
        {
            'name': 'ozelgeler',
            'fields': ['Konusu', 'Ozeti', 'Icerik', 'IlgiliKanun', 'Daire'],
            'limit': 200
        }
    ]
    
    total_indexed = 0
    
    for table in tables:
        count = migrate_table(
            table['name'],
            table['fields'],
            table.get('limit')
        )
        total_indexed += count
    
    print(f"\n✅ Migration complete!")
    print(f"Total records indexed: {total_indexed}")
    
    # Test query
    print("\n🔍 Testing LightRAG query...")
    test_query = "vergi mükellefi kimdir"
    
    response = requests.post(
        f"{LIGHTRAG_URL}/query",
        json={"query": test_query, "mode": "hybrid"},
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"\n📝 Query: {test_query}")
        print(f"Response: {result.get('response', 'No response')[:500]}...")
    else:
        print(f"❌ Query failed: {response.status_code}")

if __name__ == "__main__":
    main()
