-- Migrate Özelgeler (1001 embeddings)
INSERT INTO unified_embeddings (
  source_type, source_name, source_table, source_id,
  title, content, embedding, metadata, model_used
)
SELECT 
  'database' as source_type,
  'rag_chatbot' as source_name,
  'ozelgeler' as source_table,
  id::text as source_id,
  'Özelgeler - ' || COALESCE("Baslik", 'ID: ' || id) as title,
  SUBSTRING("Icerik", 1, 5000) as content,
  embedding,
  jsonb_build_object(
    'original_table', 'ozelgeler',
    'source_db', 'rag_chatbot'
  ) as metadata,
  'text-embedding-ada-002' as model_used
FROM dblink('dbname=rag_chatbot host=91.99.229.96 port=5432 user=postgres password=Semsiye!22',
  'SELECT id, "Baslik", "Icerik", embedding FROM ozelgeler WHERE embedding IS NOT NULL'
) AS t(id integer, "Baslik" text, "Icerik" text, embedding vector(1536))
ON CONFLICT DO NOTHING;

-- Migrate Danıştay Kararları (1001 embeddings)
INSERT INTO unified_embeddings (
  source_type, source_name, source_table, source_id,
  title, content, embedding, metadata, model_used
)
SELECT 
  'database' as source_type,
  'rag_chatbot' as source_name,
  'danistaykararlari' as source_table,
  id::text as source_id,
  'Danıştay Kararları - ' || COALESCE("EsasNo", 'ID: ' || id) as title,
  SUBSTRING("Icerik", 1, 5000) as content,
  embedding,
  jsonb_build_object(
    'original_table', 'danistaykararlari',
    'source_db', 'rag_chatbot'
  ) as metadata,
  'text-embedding-ada-002' as model_used
FROM dblink('dbname=rag_chatbot host=91.99.229.96 port=5432 user=postgres password=Semsiye!22',
  'SELECT id, "EsasNo", "Icerik", embedding FROM danistaykararlari WHERE embedding IS NOT NULL'
) AS t(id integer, "EsasNo" text, "Icerik" text, embedding vector(1536))
ON CONFLICT DO NOTHING;

-- Migrate Chat History (9 embeddings)
INSERT INTO unified_embeddings (
  source_type, source_name, source_table, source_id,
  title, content, embedding, metadata, model_used
)
SELECT 
  'database' as source_type,
  'rag_chatbot' as source_name,
  'chat_history' as source_table,
  id::text as source_id,
  'Chat History - ID: ' || id as title,
  SUBSTRING(message, 1, 5000) as content,
  embedding,
  jsonb_build_object(
    'original_table', 'chat_history',
    'source_db', 'rag_chatbot'
  ) as metadata,
  'text-embedding-ada-002' as model_used
FROM dblink('dbname=rag_chatbot host=91.99.229.96 port=5432 user=postgres password=Semsiye!22',
  'SELECT id, message, embedding FROM chat_history WHERE embedding IS NOT NULL'
) AS t(id integer, message text, embedding vector(1536))
ON CONFLICT DO NOTHING;