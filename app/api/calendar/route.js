import { mockMeetings, mockEmails } from '@/services/mock-data';
import { prepareMeetingBrief } from '@/services/ai';
import { fetchGoogleCalendarEvents } from '@/services/gmail';
import { fetchOutlookCalendar } from '@/services/outlook-local';
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
    try {
        const session = await auth();
        // Check source param
        const url = new URL(req.url);
        const source = url.searchParams.get('source') || 'google';

        const useMock = process.env.USE_MOCK_DATA === 'true';

        console.log(`[API/Calendar] useMock=${useMock}, session=${!!session}, token=${!!session?.accessToken}, source=${source}`);

        if (useMock) {
            console.log('[API/Calendar] Using mock data');
            let meetings = mockMeetings;
            const enrichedMeetings = await Promise.all(
                meetings.map(async (meeting) => {
                    const relatedEmails = mockEmails.filter(email =>
                        meeting.attendees?.some(a =>
                            a.email === email.from?.email || a.email === email.to?.[0]?.email
                        )
                    );
                    const brief = await prepareMeetingBrief(meeting, relatedEmails);
                    return { ...meeting, aiContext: brief.context, aiQuestions: brief.questions };
                })
            );
            return NextResponse.json({ meetings: enrichedMeetings, source: 'mock' });
        }

        let realEvents = [];

        // Outlook Logic
        // If source is explicitly outlook OR if we lack a google session, try Outlook
        if (source === 'outlook' || !session?.accessToken) {
            console.log('[API/Calendar] Fetching Outlook local events...');
            realEvents = await fetchOutlookCalendar();
        } else {
            // Google Logic
            if (!session?.accessToken) {
                return NextResponse.json(
                    { error: 'Not authenticated. Please sign in with Google.' },
                    { status: 401 }
                );
            }
            console.log('[API/Calendar] Fetching real calendar events...');
            realEvents = await fetchGoogleCalendarEvents(session.accessToken);
        }

        console.log(`[API/Calendar] Found ${realEvents.length} real events`);

        // Sequential processing to avoid 429 Rate Limits or CPU overload
        const enrichedMeetings = [];
        for (const meeting of realEvents) {
            const relatedEmails = [];
            // TODO: We could fetch related Outlook emails here if we wanted RAG context for meetings

            try {
                const brief = await prepareMeetingBrief(meeting, relatedEmails);
                enrichedMeetings.push({
                    ...meeting,
                    aiContext: brief.context,
                    aiQuestions: brief.questions
                });
            } catch (err) {
                console.error(`Failed to prepare brief for meeting ${meeting.id}:`, err);
                // Push meeting anyway without AI
                enrichedMeetings.push({
                    ...meeting,
                    aiContext: 'AI unavailable',
                    aiQuestions: []
                });
            }
        }

        return NextResponse.json({ meetings: enrichedMeetings, source: source === 'outlook' ? 'outlook' : 'google' });

    } catch (error) {
        console.error('Calendar API error:', error);
        return NextResponse.json(
            { error: `Failed to fetch calendar: ${error.message}` },
            { status: 500 }
        );
    }
}
