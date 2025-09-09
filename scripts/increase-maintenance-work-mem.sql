-- PostgreSQL maintenance_work_mem 256MB'ye çıkarma scripti
-- Bu script iki şekilde çalıştırılabilir:
-- 1. Geçici olarak (session bazlı): SET maintenance_work_mem = '256MB';
-- 2. Kalıcı olarak: postgresql.conf dosyasını güncelleme

-- Geçici olarak çalıştırmak için:
-- psql -U postgres -d your_database -f scripts/increase-maintenance-work-mem.sql

-- Kalıcı olarak yapmak için postgresql.conf dosyasında şu satırı güncelleyin:
-- maintenance_work_mem = 256MB

-- Mevcut maintenance_work_mem değerini göster
SHOW maintenance_work_mem;

-- maintenance_work_mem'i 256MB'ye çıkar
SET maintenance_work_mem = '256MB';

-- Değişikliği doğrula
SHOW maintenance_work_mem;

-- Kritik tablolar üzerinde VACUUM ANALYZE çalıştır (opsiyonel)
-- Bu işlem artan maintenance_work_mem'den faydalanacaktır
VACUUM ANALYZE VERBOSE embeddings;
VACUUM ANALYZE VERBOSE chunks;
VACUUM ANALYZE VERBOSE sources;

-- İşlem tamamlandı mesajı
SELECT 'PostgreSQL maintenance_work_mem 256MB olarak ayarlandı ve VACUUM ANALYZE işlemleri tamamlandı.' AS status;