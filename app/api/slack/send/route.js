import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { channel, text } = await request.json();
        if (!channel || !text) {
            return NextResponse.json({ ok: false, error: 'channel and text required' }, { status: 400 });
        }
        const { postToChannelByName } = require('@/services/slack');
        const result = await postToChannelByName(channel, text);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        console.error('Slack send error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
