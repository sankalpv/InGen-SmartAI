import { mockEmails } from '@/services/mock-data';
import { analyzeEmails } from '@/services/ai';
import { fetchGmailEmails } from '@/services/gmail';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const session = await auth();
        const useMock = process.env.USE_MOCK_DATA === 'true';

        console.log(`[API/Emails] useMock=${useMock}, session=${!!session}, token=${!!session?.accessToken}`);

        if (useMock) {
            console.log('[API/Emails] Using mock data');
            const analyzed = await analyzeEmails(mockEmails);
            return NextResponse.json({ emails: analyzed, source: 'mock' });
        }

        // Real data mode
        if (!session?.accessToken) {
            return NextResponse.json(
                { error: 'Not authenticated. Please sign in with Google.' },
                { status: 401 }
            );
        }

        try {
            console.log('[API/Emails] Fetching real emails...');
            const realEmails = await fetchGmailEmails(session.accessToken);
            console.log(`[API/Emails] Found ${realEmails.length} real emails`);

            const analyzed = await analyzeEmails(realEmails);
            return NextResponse.json({ emails: analyzed, source: 'gmail' });
        } catch (error) {
            console.error('[API/Emails] Gmail fetch failed:', error);
            return NextResponse.json(
                { error: `Gmail fetch failed: ${error.message}` },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Email API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch emails' },
            { status: 500 }
        );
    }
}
