import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '20';
    const status = searchParams.get('status') || '';
    const table = searchParams.get('table') || '';

    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    if (status) params.append('status', status);
    if (table) params.append('table', table);

    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v2/embedding-history?${params}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch embedding history');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching embedding history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch embedding history' },
      { status: 500 }
    );
  }
}