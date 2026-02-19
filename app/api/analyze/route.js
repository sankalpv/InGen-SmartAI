import { mockEmails, mockMeetings, mockSlackMessages } from '@/services/mock-data';
import { generateDailyBriefing } from '@/services/ai';
import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '@/services/outlook-local';

export const runtime = 'nodejs';

export async function GET(req) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';
        const { searchParams } = new URL(req.url);
        const source = searchParams.get('source') || 'outlook';

        console.log(`[API/Analyze] source=${source}, useMock=${useMock}`);

        if (useMock) {
            const briefing = await generateDailyBriefing(mockEmails, mockMeetings, mockSlackMessages);
            briefing.source = 'mock';
            return NextResponse.json(briefing);
        }

        let realEmails = [];
        try {
            console.log('[API/Analyze] Fetching Outlook emails...');
            realEmails = await fetchOutlookEmails(20);
            console.log(`[API/Analyze] Got ${realEmails.length} emails`);
        } catch (e) {
            console.warn('[API/Analyze] Email fetch failed, proceeding with empty list:', e.message);
        }

        const briefing = await generateDailyBriefing(realEmails, [], []);
        briefing.source = 'live';
        return NextResponse.json(briefing);

    } catch (error) {
        console.error('[API/Analyze] Failed:', error);
        return NextResponse.json(
            { error: `Analysis failed: ${error.message}` },
            { status: 500 }
        );
    }
}

export async function POST(req) {
    return GET(req);
}
