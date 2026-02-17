import { mockEmails, mockMeetings, mockSlackMessages } from '@/services/mock-data';
import { generateDailyBriefing } from '@/services/ai';
import { fetchGmailEmails, fetchGoogleCalendarEvents } from '@/services/gmail';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

import { fetchOutlookEmails } from '@/services/outlook-local';

export async function POST(req) {
    try {
        const session = await auth();
        const useMock = process.env.USE_MOCK_DATA === 'true';

        // Parse Query Source
        // Standard Next.js Request object
        const urlStr = req?.url || 'http://localhost/?source=gmail';
        const { searchParams } = new URL(urlStr);
        const source = searchParams.get('source') || 'gmail';

        console.log(`[API/Analyze] source=${source}, useMock=${useMock}, session=${!!session}`);

        if (useMock) {
            console.log('[API/Analyze] Using mock data');
            const briefing = await generateDailyBriefing(mockEmails, mockMeetings, mockSlackMessages);
            briefing.source = 'mock';
            return NextResponse.json(briefing);
        }

        // For Outlook local, we might not need Google session if we just want emails?
        // But we usually want Calendar too (which is Google).
        // So we still check session for Calendar, but maybe be lenient for Outlook emails?
        // However, existing logic enforces session. Let's keep it for now as user likely has both.
        // For Outlook local, we don't strictly need a Google session.
        if (!session?.accessToken && source !== 'outlook') {
            return NextResponse.json(
                { error: 'Not authenticated. Please sign in with Google.' },
                { status: 401 }
            );
        }

        let realEmails = [];
        let realCalendar = [];
        let errorMessages = [];

        try {
            console.log(`[API/Analyze] Fetching real data for ${source}...`);

            // Define promises based on source
            const emailPromise = source === 'outlook'
                ? fetchOutlookEmails(20)
                : fetchGmailEmails(session.accessToken);

            // Only fetch Calendar if we have a session (Google Calendar)
            const calendarPromise = session?.accessToken
                ? fetchGoogleCalendarEvents(session.accessToken)
                : Promise.resolve([]);

            const results = await Promise.allSettled([
                emailPromise,
                calendarPromise,
            ]);

            if (results[0].status === 'fulfilled') {
                realEmails = results[0].value;
            } else {
                console.warn(`[API/Analyze] Email fetch failed: ${results[0].reason?.message}`);
                // Don't fail the whole request, just have no emails
            }

            if (results[1].status === 'fulfilled') {
                realCalendar = results[1].value;
            } else {
                console.warn(`[API/Analyze] Calendar fetch failed: ${results[1].reason?.message}`);
            }

            // warning: We proceed even if data missing.

            // Using empty array for Slack since we don't have real Slack integration here yet
            const briefing = await generateDailyBriefing(realEmails, realCalendar, []);
            briefing.source = 'live';
            return NextResponse.json(briefing);

        } catch (error) {
            console.error('[API/Analyze] Failed:', error);
            return NextResponse.json(
                { error: `Analysis failed: ${error.message}` },
                { status: 500 }
            );
        }
    } catch (error) {
        console.error('Analysis API critical error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

export async function GET(req) {
    return POST(req);
}
