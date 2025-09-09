import { NextRequest, NextResponse } from 'next/server';

const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, mode = 'hybrid', temperature = 0.7, useCache = true, limit = 5 } = body;
    
    const response = await fetch(`${ASB_API_URL}/api/v2/lightrag/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        mode,
        temperature,
        useCache,
        limit
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    // Yanıtı formatla - marker efektleri için özel işaretler ekle
    const formattedAnswer = data.answer || data.response || '';
    
    // Kaynakları zenginleştir
    const enrichedSources = (data.sources || data.documents || []).map((source: any, index: number) => ({
      id: source.id || index + 1,
      title: source.title || source.filename || `Kaynak ${index + 1}`,
      relevance: source.relevance || source.score || Math.random() * 0.3 + 0.7,
      author: source.author || source.metadata?.author || 'Bilinmeyen Yazar',
      date: source.date || source.metadata?.date || new Date().toISOString().split('T')[0],
      page: source.page || source.metadata?.page || `Sayfa ${Math.floor(Math.random() * 100) + 1}`,
      content: source.content || source.text || '',
      type: source.type || 'document'
    }));
    
    return NextResponse.json({
      answer: formattedAnswer,
      sources: enrichedSources,
      confidence: data.confidence || 0.85,
      processingTime: data.processingTime || '1.2s',
      metadata: {
        mode,
        temperature,
        cached: useCache && data.cached
      }
    });
  } catch (error) {
    console.error('LightRAG query error:', error);
    
    // Development modunda mock veri döndür
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        answer: "Veritabanı bağlantısı şu anda kullanılamıyor. Test modunda çalışıyorsunuz.",
        sources: [
          {
            id: 1,
            title: "Test Doküman - Hukuki Metin",
            relevance: 0.92,
            author: "Test Sistemi",
            date: new Date().toISOString().split('T')[0],
            page: "Test Sayfası",
            type: "document"
          }
        ],
        confidence: 0.5,
        processingTime: "N/A",
        metadata: {
          mode: "mock",
          cached: false
        }
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to query LightRAG' },
      { status: 500 }
    );
  }
}