import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '../../../services/outlook-local';
import { mockEmails } from '../../../services/mock-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');

export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';
        const { searchParams } = new URL(request.url);
        const count = parseInt(searchParams.get('count') || '100');

        console.log(`[API/Outlook] useMock=${useMock}, count=${count}`);

        if (useMock) {
            return NextResponse.json({ emails: mockEmails, source: 'mock' });
        }

        // LOCAL STORE FIRST — instant response from cached data (only if we have real emails)
        const cached = localStore.getEmails();
        if (cached.exists && cached.data && cached.data.length > 0 && cached.data[0]?.id !== 'error') {
            const emails = cached.data.slice(0, count);
            console.log(`[API/Outlook] Serving ${emails.length} emails from local store (${cached.ageMinutes}m old)`);
            
            // If stale, trigger background refresh (non-blocking)
            if (cached.isStale) {
                console.log('[API/Outlook] Local store is stale, triggering background sync');
                localStore.fullSync().catch(e => console.error('Background sync failed:', e.message));
            }
            
            return NextResponse.json({ emails, source: 'local', ageMinutes: cached.ageMinutes });
        }

        // FALLBACK — no local data, fetch from Outlook directly (use small batch to avoid timeout)
        console.log(`[API/Outlook] No local data, fetching ${Math.min(count, 20)} emails from Outlook...`);
        const emails = await fetchOutlookEmails(Math.min(count, 20)); // Cap at 20 for live fetch to avoid timeout

        if (emails.length > 0 && emails[0].id === 'error') {
            // Never cache error responses
            return NextResponse.json({ error: emails[0].subject }, { status: 500 });
        }

        // Only cache valid email data
        if (emails.length > 0) {
            localStore.saveEmails(emails);
        }

        return NextResponse.json({ emails, source: 'live' });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}