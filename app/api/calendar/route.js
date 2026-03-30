import { fetchOutlookCalendar } from '@/services/outlook-mcp';
import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
    try {
        // Always fetch live from MCP (aws-outlook-mcp calendar_view)
        // This ensures Meeting Prep always shows current calendar data.
        // We still write-through to calendar.json so Morning Briefing / background
        // agents have a fresh local copy.
        console.log('[API/Calendar] Fetching live from MCP (aws-outlook-mcp)...');

        // lookbackDays=0 so we start from today (not last week)
        // forwardDays=14 to show two full weeks ahead
        const events = await fetchOutlookCalendar(null, 0, 14);

        console.log(`[API/Calendar] MCP returned ${events.length} events`);

        if (events && events.length > 0) {
            localStore.saveCalendar(events);
        }

        return NextResponse.json({ meetings: events, source: 'mcp' });

    } catch (error) {
        console.error('[API/Calendar] Live MCP fetch failed:', error.message);

        // Fallback: serve cached file if MCP is unavailable
        const cached = localStore.getCalendar();
        if (cached.exists && cached.data && cached.data.length > 0) {
            console.warn(`[API/Calendar] Serving stale cache (${cached.ageMinutes}m old) as fallback`);
            return NextResponse.json({ meetings: cached.data, source: 'cache-fallback', ageMinutes: cached.ageMinutes });
        }

        return NextResponse.json(
            { error: `Failed to fetch calendar: ${error.message}` },
            { status: 500 }
        );
    }
}
