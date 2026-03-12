import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

const LOG_FILE = path.join(process.cwd(), 'smartai.log');

export async function POST() {
    try {
        const gistToken = process.env.GITHUB_GIST_TOKEN;
        if (!gistToken) {
            return NextResponse.json(
                { error: 'GITHUB_GIST_TOKEN is not set in .env.local' },
                { status: 400 }
            );
        }

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

        // Truncate to last 500KB to stay within Gist limits
        const MAX_BYTES = 500 * 1024;
        const truncated = logContent.length > MAX_BYTES;
        const content = truncated
            ? `[Log truncated — showing last 500KB of ${(logContent.length / 1024).toFixed(0)}KB]\n\n` + logContent.slice(-MAX_BYTES)
            : logContent;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `smartai-${timestamp}.log`;

        // Create a secret GitHub Gist
        const gistResponse = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${gistToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({
                description: `SmartAI Log — ${new Date().toLocaleString()}`,
                public: false, // Secret gist
                files: {
                    [filename]: { content }
                }
            }),
        });

        if (!gistResponse.ok) {
            const errText = await gistResponse.text();
            console.error('[API] GitHub Gist creation failed:', errText);
            return NextResponse.json(
                { error: `GitHub API error: ${gistResponse.status} — check your GITHUB_GIST_TOKEN` },
                { status: 502 }
            );
        }

        const gistData = await gistResponse.json();
        const gistUrl = gistData.html_url;

        console.log(`[API] Log uploaded to Gist: ${gistUrl} (${(content.length / 1024).toFixed(1)}KB)`);

        return NextResponse.json({
            success: true,
            gistUrl,
            filename,
            bytesSent: content.length,
            truncated,
        });

    } catch (error) {
        console.error('[API] Log upload failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
