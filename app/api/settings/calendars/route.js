import { NextResponse } from 'next/server';
import { getCalendarList } from '@/services/outlook-local';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const calendars = await getCalendarList();
        return NextResponse.json({ calendars });
    } catch (error) {
        console.error('Calendar settings API error:', error);
        return NextResponse.json(
            { error: `Failed to fetch calendars: ${error.message}` },
            { status: 500 }
        );
    }
}
