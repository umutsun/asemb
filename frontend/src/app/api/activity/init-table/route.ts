import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = await fetch('http://localhost:5000/api/v2/activity/init-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to initialize activity table');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Init table error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize activity table', message: error.message },
      { status: 500 }
    );
  }
}