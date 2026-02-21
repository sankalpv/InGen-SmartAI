import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '../../../services/outlook-local';
import { mockEmails } from '../../../services/mock-data';

export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';
        const { searchParams } = new URL(request.url);
        const count = parseInt(searchParams.get('count') || '100'); // Default 100 for date range filtering

        console.log(`[API/Outlook] useMock=${useMock}, count=${count}`);

        if (useMock) {
            console.log('[API/Outlook] Returning mock emails');
            return NextResponse.json({ emails: mockEmails, source: 'mock' });
        }

        console.log(`[API] Fetching ${count} Outlook emails (via JXA Service)...`);
        const emails = await fetchOutlookEmails(count);

        if (emails.length > 0 && emails[0].id === 'error') {
            return NextResponse.json({ error: emails[0].subject }, { status: 500 });
        }

        return NextResponse.json({ emails });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}
