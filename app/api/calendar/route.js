import { mockMeetings } from '@/services/mock-data';
import { fetchOutlookCalendar } from '@/services/outlook-local';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';

        console.log(`[API/Calendar] useMock=${useMock}, source=outlook (enforced)`);

        if (useMock) {
            return NextResponse.json({ meetings: mockMeetings, source: 'mock' });
        }

        // Read calendar ID from settings
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

        console.log(`[API/Calendar] Fetching Outlook local events (ID ${calendarId})...`);
        const events = await fetchOutlookCalendar(calendarId);
        console.log(`[API/Calendar] Found ${events.length} events`);

        // Return raw events immediately — meeting briefs are generated lazily per-card
        return NextResponse.json({ meetings: events, source: 'outlook' });

    } catch (error) {
        console.error('[API/Calendar] Error:', error);
        return NextResponse.json(
            { error: `Failed to fetch calendar: ${error.message}` },
            { status: 500 }
        );
    }
}
