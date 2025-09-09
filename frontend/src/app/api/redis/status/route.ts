import { NextResponse } from 'next/server';

const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${ASB_API_URL}/api/v2/dashboard`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json({ 
      status: 'ok',
      connected: data.redis?.connected || false,
      details: data.redis || {}
    });
  } catch (error) {
    console.error('Redis status check error:', error);
    return NextResponse.json({ 
      status: 'error',
      connected: false,
      details: {}
    }, { status: 503 });
  }
}