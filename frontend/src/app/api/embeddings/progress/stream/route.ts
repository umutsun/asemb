import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
  const upstreamUrl = `${ASB_API_URL}/api/v2/embeddings/progress/stream`;

  try {
    const controller = new AbortController();
    request.signal.addEventListener('abort', () => controller.abort());

    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => 'Upstream error');
      return new Response(`Upstream error: ${text}`.slice(0, 512), { status: 502 });
    }

    // Pipe upstream SSE stream to client
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = upstream.body.getReader();

    (async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) await writer.write(value);
        }
      } catch (_) {
        // ignore
      } finally {
        try { await writer.close(); } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    return new Response(`Proxy error: ${err?.message || 'unknown'}`, { status: 500 });
  }
}

