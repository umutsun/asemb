import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const ASB_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';

  try {
    const response = await fetch(`${ASB_API_URL}/api/v2/embeddings/progress/stream`, {
      method: 'GET',
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.statusText}`);
    }

    // Create a readable stream to forward SSE events
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (error) {
          console.error('SSE stream error:', error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      },
    });
  } catch (error) {
    console.error('SSE proxy error:', error);
    return new Response('data: {"error": "Failed to connect to SSE stream"}\n\n', {
      status: 500,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  }
}