import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const STATE_FILE = path.join(process.cwd(), 'sync_state.json');

    try {
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            return NextResponse.json({
                active: true,
                lastSync: state.lastSyncTimestamp
            });
        }
        return NextResponse.json({ active: false, lastSync: null });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to read agent status' }, { status: 500 });
    }
}
