-- Kritik tabloları VACUUM ANALYZE ile optimize etme scripti
-- Bu script, veritabanı performansını artırmak için gerekli bakım işlemlerini çalıştırır.

-- Mevcut veritabanı ve tablo boyutlarını göster
SELECT 
    schemaname,
    relname,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS relation_size,
    n_live_tup AS live_tuples,
    n_dead_tup AS dead_tuples
FROM pg_catalog.pg_statio_user_tables 
WHERE relname IN ('embeddings', 'chunks', 'sources', 'chunks_cache')
ORDER BY pg_total_relation_size(relid) DESC;

-- VACUUM ANALYZE işlemlerini çalıştır
-- embeddings tablosu
VACUUM ANALYZE VERBOSE embeddings;
SELECT 'VACUUM ANALYZE completed for embeddings table' AS status;

-- chunks tablosu
VACUUM ANALYZE VERBOSE chunks;
SELECT 'VACUUM ANALYZE completed for chunks table' AS status;

-- sources tablosu
VACUUM ANALYZE VERBOSE sources;
SELECT 'VACUUM ANALYZE completed for sources table' AS status;

-- chunks_cache tablosu (eğer varsa)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' AND table_name = 'chunks_cache') THEN
        VACUUM ANALYZE VERBOSE chunks_cache;
        SELECT 'VACUUM ANALYZE completed for chunks_cache table' AS status;
    ELSE
        SELECT 'chunks_cache table does not exist, skipping' AS status;
    END IF;
END $$;

-- İşlem sonrası istatistikleri göster
SELECT 
    schemaname,
    relname,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS relation_size,
    n_live_tup AS live_tuples,
    n_dead_tup AS dead_tuples
FROM pg_catalog.pg_statio_user_tables 
WHERE relname IN ('embeddings', 'chunks', 'sources', 'chunks_cache')
ORDER BY pg_total_relation_size(relid) DESC;

-- Toplam işlem tamamlandı mesajı
SELECT 'VACUUM ANALYZE operations completed successfully for critical tables.' AS final_status;