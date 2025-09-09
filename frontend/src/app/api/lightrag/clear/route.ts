import { NextRequest, NextResponse } from 'next/server';

const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function DELETE() {
  try {
    const response = await fetch(`${ASB_API_URL}/api/v2/lightrag/clear`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('LightRAG clear error:', error);
    return NextResponse.json(
      { error: 'Failed to clear LightRAG data' },
      { status: 500 }
    );
  }
}