import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
    const body = await request.json();

    // Normalize payload for backend
    const payload = {
      host: body.host ?? body.name ?? body?.host,
      port: parseInt(body.port ?? body?.port ?? '5432'),
      database: body.database?.name ?? body.database ?? 'rag_chatbot',
      user: body.user ?? body.username ?? body?.user ?? 'postgres',
      password: body.password ?? '',
      ssl: !!(body.ssl ?? (body.sslMode === 'require' || body.sslMode === 'verify-ca' || body.sslMode === 'verify-full'))
    };

    const response = await fetch(`${ASB_API_URL}/api/v2/settings/database/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const status = response.ok ? 200 : response.status;
    return NextResponse.json(data, { status });
  } catch (error) {
    console.error('Database test proxy error:', error);
    return NextResponse.json({ success: false, error: 'Proxy error' }, { status: 500 });
  }
}
