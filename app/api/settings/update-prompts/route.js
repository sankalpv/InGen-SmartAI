import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

const PROMPTS_CONFIG_PATH = path.join(process.cwd(), 'config', 'prompts.json');

// Ensure config directory exists
async function ensureConfigDir() {
    const dir = path.dirname(PROMPTS_CONFIG_PATH);
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

export async function POST(req) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ error: 'URL is required' }, { status: 400 });
        }

        console.log(`[API] Fetching prompts from remote: ${url}`);
        const response = await fetch(url);

        if (!response.ok) {
            return NextResponse.json({ error: `Remote fetch failed: ${response.statusText}` }, { status: 502 });
        }

        const data = await response.json();

        // Basic validation: Check if 'version' or 'system' keys exist
        if (!data.version && !data.system) {
            return NextResponse.json({ error: 'Invalid JSON format. Missing version or system prompt.' }, { status: 400 });
        }

        await ensureConfigDir();
        await fs.writeFile(PROMPTS_CONFIG_PATH, JSON.stringify(data, null, 2));

        console.log('[API] Prompts updated successfully.');
        return NextResponse.json({ success: true, version: data.version });

    } catch (error) {
        console.error('[API] Update prompts failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
