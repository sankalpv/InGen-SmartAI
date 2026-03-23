import { NextResponse } from 'next/server';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout for full generation

/**
 * GET — Return cached report + state
 */
export async function GET() {
    try {
        const cppWbr = require('../../../services/cpp-wbr-report');
        const { report, state } = cppWbr.getCachedReport();
        return NextResponse.json({ report, state });
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

/**
 * POST — Generate/Regenerate/Resume report via SSE streaming
 * Body: { action: 'generate' | 'regenerate' | 'resume', mode: 'standard' | 'full' }
 */
export async function POST(req) {
    const body = await req.json();
    const action = body.action || 'generate';
    const mode = body.mode || 'standard';
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (evt) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
                } catch (e) { /* stream closed */ }
            };

            try {
                const cppWbr = require('../../../services/cpp-wbr-report');
                await cppWbr.generateCppWbr(action, mode, send);
            } catch (err) {
                send({ type: 'error', message: err.message });
            }

            try { controller.close(); } catch (e) { /* already closed */ }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
