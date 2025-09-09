import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const operation_type = searchParams.get('operation_type');
    
    const params = operation_type ? `?operation_type=${operation_type}` : '';
    const response = await fetch(`http://localhost:5000/api/v2/activity/history${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch activity history');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Activity history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity history', message: error.message },
      { status: 500 }
    );
  }
}