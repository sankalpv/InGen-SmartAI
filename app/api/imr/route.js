/**
 * SSE Route for IMR Mission Control — streams summary cards, 8 tab views, insights.
 * Supports ?fleetId, ?month, ?scenario, ?refresh=1 (clears 24h cache)
 */

import { streamIMRData } from '../../../services/imr-telemetry';
import { logger } from '../../../services/logger';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const fleetId = searchParams.get('fleetId') || '';
  const month = searchParams.get('month') || '';
  const scenario = searchParams.get('scenario') || '';
  const forceRefresh = searchParams.get('refresh') === '1';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event, data) => {
        if (!closed) {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            /* closed */
          }
        }
      };

      try {
        await streamIMRData(
          fleetId || null,
          month || null,
          scenario || null,
          forceRefresh,
          (eventType, data) => send(eventType, data),
          (msg) => send('status', { msg })
        );
        send('done', {});
      } catch (e) {
        logger.error(`IMR Stream failed: ${e.message}`);
        send('error', { error: e.message });
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

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
