import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let tracker = null;
function getTracker() {
    if (!tracker) {
        try {
            tracker = require('../../../services/usage-tracker');
        } catch (e) {
            console.error('[API/track] Failed to load usage-tracker:', e.message);
        }
    }
    return tracker;
}

/**
 * POST /api/track — Receive usage events from the frontend
 * Body: { event: 'PageView', data: { PageName: 'Dashboard' } }
 */
export async function POST(request) {
    try {
        const body = await request.json();
        const { event, data = {} } = body;

        if (!event) {
            return NextResponse.json({ error: 'Missing event field' }, { status: 400 });
        }

        const t = getTracker();
        if (!t) {
            return NextResponse.json({ ok: true, tracked: false, reason: 'tracker not available' });
        }

        switch (event) {
            case 'PageView':
                t.trackPageView(data.pageName || data.PageName || 'Unknown');
                break;
            case 'APICall':
                t.trackAPICall(data.endpoint || data.Endpoint || 'Unknown');
                break;
            case 'AIGeneration':
                t.trackAIGeneration(data.type || data.Type || 'Unknown');
                break;
            case 'FeatureUsage':
                t.trackFeature(data.feature || data.Feature || 'Unknown');
                break;
            case 'Error':
                t.trackError(data.module || data.Module || 'Unknown');
                break;
            default:
                t.trackEvent(event, data);
        }

        return NextResponse.json({ ok: true, tracked: true });
    } catch (error) {
        console.error('[API/track] Error:', error.message);
        return NextResponse.json({ ok: true, tracked: false });
    }
}

/**
 * GET /api/track — Return tracking stats
 */
export async function GET() {
    try {
        const t = getTracker();
        if (!t) {
            return NextResponse.json({ enabled: false, reason: 'tracker not available' });
        }
        return NextResponse.json(t.getStats());
    } catch (error) {
        return NextResponse.json({ enabled: false, error: error.message });
    }
}
