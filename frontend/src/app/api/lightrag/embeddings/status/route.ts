import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest) {
  try {
    const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
    const res = await fetch(`${ASB_API_URL}/api/v2/lightrag/stats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json({ error: `Backend responded ${res.status}: ${text}` }, { status: 502 });
    }

    const data = await res.json();

    // Normalize into the shape expected by the UI
    const model = data?.model || data?.embeddingModel || 'unknown';
    const initialized = !!(data?.initialized ?? true);
    const vectorCount = Number(data?.documentCount ?? data?.vectorCount ?? 0);
    const lastIndexed = data?.lastUpdate || new Date().toISOString();

    const status: 'operational' | 'degraded' | 'down' = initialized ? 'operational' : 'degraded';

    return NextResponse.json({ model, status, vectorCount, lastIndexed });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Proxy error' }, { status: 500 });
  }
}

