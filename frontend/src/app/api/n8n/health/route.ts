import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // n8n health check can be added here when n8n is configured
    // For now, return a mock response
    return NextResponse.json({ 
      status: 'ok',
      connected: false, // n8n integration is optional
      details: {
        message: 'n8n integration not configured'
      }
    });
  } catch (error) {
    console.error('n8n health check error:', error);
    return NextResponse.json({ 
      status: 'error',
      connected: false,
      details: {}
    }, { status: 503 });
  }
}