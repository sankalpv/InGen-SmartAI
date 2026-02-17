import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '../../../services/outlook-local';

export const runtime = 'nodejs';

export async function GET() {
    try {
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
