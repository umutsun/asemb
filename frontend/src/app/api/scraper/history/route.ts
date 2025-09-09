import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for demo purposes
// In production, this should use a database
let scraperHistory: any[] = [];

export async function GET(request: NextRequest) {
  try {
    // Return the scraper history
    // In production, this would query from database
    return NextResponse.json(scraperHistory);
  } catch (error) {
    console.error('Failed to fetch scraper history:', error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Add to history
    const historyItem = {
      id: Date.now().toString(),
      url: data.url,
      title: data.title,
      content: data.content,
      metadata: {
        scraped_at: new Date().toISOString(),
        content_length: data.content?.length || 0,
        status: 'success',
        processed: false
      }
    };
    
    scraperHistory.unshift(historyItem);
    
    // Keep only last 50 items
    if (scraperHistory.length > 50) {
      scraperHistory = scraperHistory.slice(0, 50);
    }
    
    return NextResponse.json(historyItem);
  } catch (error) {
    console.error('Failed to save scraper history:', error);
    return NextResponse.json(
      { error: 'Failed to save history' },
      { status: 500 }
    );
  }
}