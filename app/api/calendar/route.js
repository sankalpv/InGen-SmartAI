import { mockMeetings } from '@/services/mock-data';
import { fetchOutlookCalendar } from '@/services/outlook-mcp';
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

        // ─── STRATEGY 1: LOCAL STORE (calendar.json) — instant response ───
        const cached = localStore.getCalendar();
        if (cached.exists && cached.data && cached.data.length > 0) {
            console.log(`[API/Calendar] Serving ${cached.data.length} events from local store (${cached.ageMinutes}m old)`);
            
            // If stale, trigger background refresh (non-blocking)
            if (cached.isStale) {
                console.log('[API/Calendar] Local store is stale, triggering background sync');
                localStore.fullSync().catch(e => console.error('Background sync failed:', e.message));
            }
            
            return NextResponse.json({ meetings: cached.data, source: 'local', ageMinutes: cached.ageMinutes });
        }

        // ─── STRATEGY 2 (Windows): outlook-cache.db — PRIMARY source for New Outlook ───
        // New Outlook stores calendar in IndexedDB, extracted by Python script into SQLite.
        // This is the most reliable source on Windows — check it BEFORE COM.
        if (process.platform === 'win32') {
            try {
                const idbReader = require('../../../services/outlook-indexeddb-reader');
                if (idbReader.isAvailable()) {
                    console.log('[API/Calendar] Windows: Reading from outlook-cache.db (primary)...');
                    const dbMeetings = await idbReader.getMeetings({ limit: 200 });
                    if (dbMeetings && dbMeetings.length > 0) {
                        const mapped = dbMeetings.map(m => ({
                            id: m.id,
                            title: m.title || 'Untitled',
                            startTime: m.start_time || new Date().toISOString(),
                            endTime: m.end_time || new Date().toISOString(),
                            location: m.location || '',
                            description: m.description || '',
                            attendees: (() => { try { return JSON.parse(m.required_attendees || '[]'); } catch { return []; } })(),
                            organizer: m.organizer ? { name: m.organizer_name || '', email: m.organizer } : {},
                            source: 'outlook-cache',
                        }));
                        console.log(`[API/Calendar] Windows: ${mapped.length} events from outlook-cache.db`);
                        
                        // Cache to calendar.json for faster subsequent reads
                        localStore.saveCalendar(mapped);
                        
                        return NextResponse.json({ meetings: mapped, source: 'outlook-cache' });
                    }
                }
            } catch (e) {
                console.warn('[API/Calendar] outlook-cache.db read failed:', e.message);
            }
        }

        // ─── STRATEGY 3: Live fetch from Outlook (COM on Windows, AppleScript on Mac) ───
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

        console.log(`[API/Calendar] Fetching from Outlook live (ID ${calendarId})...`);
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