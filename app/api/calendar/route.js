import { mockMeetings } from '@/services/mock-data';
import { fetchOutlookCalendar } from '@/services/outlook-local';
import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';

        console.log(`[API/Calendar] useMock=${useMock}, source=outlook (enforced)`);

        if (useMock) {
            return NextResponse.json({ meetings: mockMeetings, source: 'mock' });
        }

        // LOCAL STORE FIRST — instant response from cached data
        const cached = localStore.getCalendar();
        if (cached.exists && cached.data) {
            console.log(`[API/Calendar] Serving ${cached.data.length} events from local store (${cached.ageMinutes}m old)`);
            
            // If stale, trigger background refresh (non-blocking)
            if (cached.isStale) {
                console.log('[API/Calendar] Local store is stale, triggering background sync');
                localStore.fullSync().catch(e => console.error('Background sync failed:', e.message));
            }
            
            return NextResponse.json({ meetings: cached.data, source: 'local', ageMinutes: cached.ageMinutes });
        }

        // FALLBACK — no local data, fetch from Outlook directly
        let calendarId = process.env.NEXT_PUBLIC_OUTLOOK_CALENDAR_ID || '432';
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(process.cwd(), 'config', 'settings.json');
            if (fs.existsSync(configPath)) {
                const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (settings.outlookCalendarId) calendarId = settings.outlookCalendarId;
            }
        } catch (e) {
            console.warn('[API/Calendar] Failed to read settings.json:', e.message);
        }

        console.log(`[API/Calendar] No local data, fetching from Outlook (ID ${calendarId})...`);
        const events = await fetchOutlookCalendar(calendarId, 7);
        console.log(`[API/Calendar] Found ${events.length} events`);

        // Only cache if we got actual events (don't cache empty/failed results)
        if (events && events.length > 0) {
            localStore.saveCalendar(events);
        }

        return NextResponse.json({ meetings: events, source: 'live' });

    } catch (error) {
        console.error('[API/Calendar] Error:', error);
        return NextResponse.json(
            { error: `Failed to fetch calendar: ${error.message}` },
            { status: 500 }
        );
    }
}