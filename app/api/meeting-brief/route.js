
import { auth } from '@/auth';
import { prepareMeetingBrief } from '@/services/ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req) {
    const session = await auth();
    // Allow unauthenticated access for local-only setups
    // (vector store search doesn't need a session)

    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title');
    const description = searchParams.get('description') || '';
    const attendees = searchParams.get('attendees') || ''; // comma-separated

    if (!title) {
        return NextResponse.json({ error: 'Meeting title is required' }, { status: 400 });
    }

    try {
        // Build a minimal meeting object for prepareMeetingBrief
        const meeting = {
            title,
            description,
            start: { dateTime: searchParams.get('startTime') || new Date().toISOString() },
            attendees: attendees
                ? attendees.split(',').map(e => ({ email: e.trim(), emailAddress: { address: e.trim() } }))
                : [],
        };

        console.log(`[API/Brief] Generating brief for: "${title}"`);

        // prepareMeetingBrief uses RAG (vector store) for context — no Gmail needed
        const brief = await prepareMeetingBrief(meeting, null);

        return NextResponse.json({ brief });
    } catch (error) {
        console.error('[API/Brief] Failed to generate meeting brief:', error);
        return NextResponse.json({ error: 'Failed to generate brief' }, { status: 500 });
    }
}
