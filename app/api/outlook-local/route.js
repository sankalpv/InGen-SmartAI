import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '../../../services/outlook-local';
import { mockEmails } from '../../../services/mock-data';

export const runtime = 'nodejs';

export async function GET() {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';

        console.log(`[API/Outlook] useMock=${useMock}`);

        if (useMock) {
            console.log('[API/Outlook] Returning mock emails');
            return NextResponse.json({ emails: mockEmails, source: 'mock' });
        }

        console.log('[API] Fetching Outlook emails (via JXA Service)...');
        const emails = await fetchOutlookEmails(20);

        if (emails.length > 0 && emails[0].id === 'error') {
            return NextResponse.json({ error: emails[0].subject }, { status: 500 });
        }

        return NextResponse.json({ emails });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}
