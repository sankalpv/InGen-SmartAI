
import { auth } from '@/auth';
import { fetchGmailEmails } from '@/services/gmail';
import { generateMeetingBrief } from '@/services/ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Use nodejs runtime for heavier AI tasks

export async function GET(req) {
    const session = await auth();
    if (!session || !session.accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title');
    const attendees = searchParams.get('attendees'); // comma separated emails

    if (!title) {
        return NextResponse.json({ error: 'Meeting title is required' }, { status: 400 });
    }

    try {
        // Construct Gmail Search Query
        // Strategy: Look for emails from attendees OR subject matching meeting title
        let queryParts = [];

        if (title) {
            // Clean title (remove "Sync", "Meeting")
            const cleanTitle = title.replace(/(Sync|Meeting|Call|Weekly|Monthly)/gi, '').trim();
            if (cleanTitle.length > 3) {
                queryParts.push(`subject:(${cleanTitle})`);
            }
        }

        if (attendees) {
            const emailList = attendees.split(',').filter(e => e.includes('@'));
            if (emailList.length > 0) {
                // limit to top 3 attendees to avoid massive query
                const keyAttendees = emailList.slice(0, 3).map(e => `from:${e}`).join(' OR ');
                queryParts.push(`(${keyAttendees})`);
            }
        }

        // fallback if query is empty
        const query = queryParts.length > 0 ? queryParts.join(' OR ') : `subject:(${title})`;

        console.log(`[API/Brief] Searching Gmail query: "${query}"`);

        // Fetch emails (limit 5 for speed)
        const emails = await fetchGmailEmails(session.accessToken, `${query} newer_than:60d`);

        // Generate Brief
        const brief = await generateMeetingBrief(title, emails);

        return NextResponse.json({ brief, emailCount: emails.length });
    } catch (error) {
        console.error('Failed to generate meeting brief:', error);
        return NextResponse.json({ error: 'Failed to generate brief' }, { status: 500 });
    }
}
