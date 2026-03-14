import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    try {
        const { listMyChannels } = require('@/services/slack');
        const channels = await listMyChannels();
        return NextResponse.json({ ok: true, channels });
    } catch (error) {
        console.error('[API/Slack/Channels] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
