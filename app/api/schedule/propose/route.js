import { NextResponse } from 'next/server';
import { extractTimeConstraints } from '@/services/ai';
import { findFreeSlots } from '@/services/scheduling';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function POST(req) {
    try {
        const session = await auth();
        const body = await req.json();
        const { emailBody } = body;

        if (!emailBody) {
            return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
        }

        console.log('[API/Schedule] Extracting constraints...');
        const constraints = await extractTimeConstraints(emailBody);
        console.log('[API/Schedule] Constraints:', constraints);

        console.log('[API/Schedule] Finding slots...');
        const slots = await findFreeSlots(constraints, session);
        console.log(`[API/Schedule] Found ${slots.length} slots`);

        return NextResponse.json({ slots, constraints });
    } catch (error) {
        console.error('Schedule API Error:', error);
        return NextResponse.json({ error: 'Failed to find time slots' }, { status: 500 });
    }
}
