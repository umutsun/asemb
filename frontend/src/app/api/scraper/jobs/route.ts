import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for scraping jobs
let scrapingJobs: any[] = [];

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      jobs: scrapingJobs,
      count: scrapingJobs.length
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch jobs', jobs: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const job = await request.json();
    
    // Add job to storage
    scrapingJobs.unshift({
      ...job,
      id: `job_${Date.now()}`,
      createdAt: new Date().toISOString()
    });
    
    // Keep only last 50 jobs
    if (scrapingJobs.length > 50) {
      scrapingJobs = scrapingJobs.slice(0, 50);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Job added successfully'
    });
  } catch (error) {
    console.error('Error adding job:', error);
    return NextResponse.json(
      { error: 'Failed to add job' },
      { status: 500 }
    );
  }
}