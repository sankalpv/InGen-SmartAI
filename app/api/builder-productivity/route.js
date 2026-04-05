import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bp = require('../../../services/builder-productivity');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const alias = searchParams.get('alias') || bp.getDefaultAlias();
  const periodType = searchParams.get('periodType') || 'month';
  const windowStart = searchParams.get('windowStart') || getDefaultWindowStart();
  const windowEnd = searchParams.get('windowEnd') || getDefaultWindowEnd();
  const stream = searchParams.get('stream') === '1';

  if (!alias) {
    return Response.json(
      { error: 'No alias provided and no phonetoolAlias in settings' },
      { status: 400 }
    );
  }

  // ─── SSE streaming mode ──────────────────────────────────────────────
  if (stream) {
    console.log(
      `[API/BuilderProductivity] SSE stream for ${alias} (${periodType}, ${windowStart} to ${windowEnd})`
    );
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (str) => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(str));
            } catch {
              /* closed */
            }
          }
        };
        try {
          send(
            `event: init\ndata: ${JSON.stringify({ alias, periodType, windowStart, windowEnd })}\n\n`
          );

          await bp.streamMetricsByCategory(
            alias,
            periodType,
            windowStart,
            windowEnd,
            (category, metrics) => {
              send(`event: category\ndata: ${JSON.stringify({ category, metrics })}\n\n`);
            },
            (msg) => {
              send(`event: status\ndata: ${JSON.stringify({ msg })}\n\n`);
            },
            (category, insights) => {
              send(`event: insight\ndata: ${JSON.stringify({ category, insights })}\n\n`);
            }
          );

          send(`event: done\ndata: {}\n\n`);
        } catch (error) {
          console.error('[API/BuilderProductivity] SSE error:', error);
          send(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ─── Standard JSON mode (backward compat) ────────────────────────────
  try {
    console.log(
      `[API/BuilderProductivity] Fetching metrics for ${alias} (${periodType}, ${windowStart} to ${windowEnd})`
    );
    const metrics = await bp.fetchAllMetrics(alias, periodType, windowStart, windowEnd);
    console.log(`[API/BuilderProductivity] Successfully fetched metrics for ${alias}`);
    return Response.json({ alias, periodType, windowStart, windowEnd, metrics });
  } catch (error) {
    console.error('[API/BuilderProductivity] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function getDefaultWindowStart() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

function getDefaultWindowEnd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
