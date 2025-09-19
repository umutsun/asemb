# Proje Bağlamı: Alice Semantic Bridge

## Projenin Amacı
Bu proje, "Mali Müşavir Botu" olarak da bilinen bir bilgi yönetim sistemidir. Temel amacı, RAG (Retrieval-Augmented Generation) tekniklerini kullanarak kurumsal bilgi kaynaklarından doğru ve bağlama uygun cevaplar üretmektir.

## Temel Teknolojiler
- **Backend:** Node.js, Express.js, TypeScript
- **Veritabanı:** PostgreSQL (Vektör depolama için `pgvector` eklentisi ile)
- **Önbellek/Mesajlaşma:** Redis
- **Frontend:** Next.js / React tabanlı bir dashboard.
- **AI Entegrasyonları:** OpenAI, DeepSeek, Google Gemini ve Anthropic Claude gibi çoklu LLM sağlayıcılarını desteklemektedir.

## Önemli Klasörler
- `backend/src/`: Ana backend uygulamasının mantığını içerir. API endpoint'leri, servisler ve veritabanı yapılandırması buradadır.
- `api/`: Muhtemelen daha eski veya yardımcı bir API servisi. Mevcut ana backend `backend` klasöründedir.
- `config/`: `config.json` gibi proje genelindeki yapılandırma dosyalarını barındırır.
- `asb-dashboard/`: Kullanıcı arayüzü ve yönetim panelini içeren Next.js uygulaması.
- `.gemini/` & `.claude/`: Diğer AI agent'ları için hazırlanan oryantasyon klasörleri.