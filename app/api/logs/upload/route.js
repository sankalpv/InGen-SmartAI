import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { NextResponse } from 'next/server';

const LOG_FILE = path.join(process.cwd(), 'smartai.log');

export async function POST() {
    try {
        // Read the log file
        let logContent = '';
        try {
            logContent = await fs.readFile(LOG_FILE, 'utf8');
        } catch {
            return NextResponse.json({ error: 'Log file (smartai.log) not found.' }, { status: 404 });
        }

        if (!logContent.trim()) {
            return NextResponse.json({ error: 'Log file is empty.' }, { status: 400 });
        }

        // Truncate to last 500KB
        const MAX_BYTES = 500 * 1024;
        const truncated = logContent.length > MAX_BYTES;
        const content = truncated
            ? `[Log truncated — showing last 500KB of ${(logContent.length / 1024).toFixed(0)}KB]\n\n` + logContent.slice(-MAX_BYTES)
            : logContent;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const alias = os.userInfo().username || 'unknown';
        const filename = `ingen-log-${alias}-${timestamp}.txt`;

        // Return the log content as a downloadable response
        // The frontend will trigger a browser download
        return NextResponse.json({
            success: true,
            filename,
            content,
            bytesSent: content.length,
            truncated,
            alias,
        });

    } catch (error) {
        console.error('[API] Log export failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
