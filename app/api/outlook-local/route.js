
import { promisify } from 'util';
import { exec } from 'child_process';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

import path from 'path';

const execAsync = promisify(exec);

export async function GET() {
    try {
        const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_outlook_emails.scpt');
        const { stdout, stderr } = await execAsync(`osascript "${scriptPath}" 20`);

        if (stderr) {
            console.error('Outlook Script Error:', stderr);
            return NextResponse.json({ error: 'Failed to execute Outlook script' }, { status: 500 });
        }

        let emails = [];
        try {
            emails = JSON.parse(stdout);
            // Handle error object in array
            if (emails.length > 0 && emails[0].error) {
                return NextResponse.json({ error: emails[0].error }, { status: 500 });
            }
        } catch (parseError) {
            console.error('Failed to parse Outlook output:', stdout);
            return NextResponse.json({ error: 'Failed to parse Outlook data' }, { status: 500 });
        }

        return NextResponse.json({ emails });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}
