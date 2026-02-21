import { mockEmails, mockMeetings, mockSlackMessages, mockBriefing } from '@/services/mock-data';
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
            try {
                // Try generating fresh briefing from mock data (test AI)
                console.log('[API/Analyze] Generating fresh briefing from mock data...');
                const briefing = await generateDailyBriefing(mockEmails, mockMeetings, mockSlackMessages);

                // If AI returned a fallback error message, use our static high-quality mock instead
                if (briefing.greeting.includes('Unable to generate AI summary')) {
                    throw new Error('AI Generation failed');
                }

                briefing.source = 'mock-generated';
                return NextResponse.json(briefing);
            } catch (e) {
                console.warn('[API/Analyze] Mock generation failed, using static fallback:', e.message);
                return NextResponse.json({ ...mockBriefing, source: 'mock-static' });
            }
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
