import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'settings.json');

// Ensure config directory exists
async function ensureConfigDir() {
    const dir = path.dirname(CONFIG_PATH);
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

export async function GET() {
    try {
        await ensureConfigDir();
        let settings = {};
        try {
            const data = await fs.readFile(CONFIG_PATH, 'utf8');
            settings = JSON.parse(data);
        } catch (err) {
            // If file doesn't exist, return empty object (defaults will apply elsewhere)
        }
        return NextResponse.json(settings);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        await ensureConfigDir();
        const newSettings = await req.json();

        // Read existing to merge
        let existing = {};
        try {
            const data = await fs.readFile(CONFIG_PATH, 'utf8');
            existing = JSON.parse(data);
        } catch (err) { }

        const updated = { ...existing, ...newSettings };

        await fs.writeFile(CONFIG_PATH, JSON.stringify(updated, null, 2));

        return NextResponse.json(updated);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
