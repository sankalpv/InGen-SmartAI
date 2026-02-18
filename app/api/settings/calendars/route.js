import { exec } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const scriptPath = `${process.cwd()}/scripts/get_calendar_list.scpt`;
        const { stdout, stderr } = await execAsync(`osascript "${scriptPath}"`);

        if (stderr) {
            console.error('Error fetching calendar list:', stderr);
            return NextResponse.json({ calendars: [] });
        }

        try {
            // loose parsing in case AppleScript returns something slightly off
            // The script attempts to return valid JSON
            const calendars = JSON.parse(stdout.trim());
            return NextResponse.json({ calendars });
        } catch (parseError) {
            console.error('Failed to parse calendar list JSON:', parseError, stdout);
            return NextResponse.json({ calendars: [] });
        }

    } catch (error) {
        console.error('Calendar settings API error:', error);
        return NextResponse.json(
            { error: `Failed to fetch calendars: ${error.message}` },
            { status: 500 }
        );
    }
}
