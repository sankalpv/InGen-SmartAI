import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bp = require('../../../../services/builder-productivity');
const orgStore = require('../../../../services/org-store');
const phonetool = require('../../../../services/phonetool');
const { readSetting } = require('../../../../services/settings');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/builder-productivity/reports?alias=X&periodType=month&windowStart=...&windowEnd=...
 *
 * Returns direct-report managers of alias X + their builder productivity metrics.
 *
 * If alias matches the authenticated user (phonetoolAlias in settings), use org-store (SQLite).
 * Otherwise, fetch via phonetool/builder-mcp.
 *
 * Streams SSE: reports → manager (per manager) → done
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const alias = searchParams.get('alias') || bp.getDefaultAlias();
  const periodType = searchParams.get('periodType') || 'month';
  const windowStart = searchParams.get('windowStart') || getDefaultWindowStart();
  const windowEnd = searchParams.get('windowEnd') || getDefaultWindowEnd();

  if (!alias) {
    return Response.json({ error: 'No alias provided' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
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
        // Step 1: Get direct-report managers
        const configuredAlias = readSetting('phonetoolAlias', '');
        let managers = [];

        if (alias === configuredAlias) {
          console.log(`[API/BP-Reports] Using org-store for ${alias}`);
          const populated = await orgStore.isPopulated();
          if (populated) {
            const directReports = await orgStore.getDirectReports(alias);
            managers = directReports
              .filter((r) => r.isManager)
              .map((r) => ({ alias: r.alias, name: r.name }));
          }
        }

        if (managers.length === 0) {
          console.log(`[API/BP-Reports] Using phonetool for ${alias}`);
          const reports = await phonetool.fetchDirectReports(alias);
          managers = reports.map((r) => ({ alias: r.alias, name: r.name }));
        }

        send('reports', { alias, managers });

        if (managers.length === 0) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* */
          }
          return;
        }

        // Step 2: Fetch metrics for each manager, stream as each completes
        for (const mgr of managers) {
          try {
            console.log(`[API/BP-Reports] Fetching metrics for ${mgr.alias}`);
            const allMetrics = await bp.fetchAllMetrics(
              mgr.alias,
              periodType,
              windowStart,
              windowEnd
            );

            const flat = {};
            for (const [, items] of Object.entries(allMetrics)) {
              for (const m of items) {
                flat[m.name] = {
                  label: m.label,
                  format: m.format,
                  unit: m.unit,
                  dataPoints: m.dataPoints,
                };
              }
            }

            send('manager', { alias: mgr.alias, name: mgr.name, metrics: flat });
          } catch (e) {
            console.error(`[API/BP-Reports] Error for ${mgr.alias}:`, e.message);
            send('manager', { alias: mgr.alias, name: mgr.name, metrics: {}, error: e.message });
          }
        }

        send('done', {});
      } catch (error) {
        console.error('[API/BP-Reports] Error:', error);
        send('error', { error: error.message });
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
