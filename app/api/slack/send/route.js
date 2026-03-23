import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { channel, text } = await request.json();
        if (!channel || !text) {
            return NextResponse.json({ ok: false, error: 'channel and text required' }, { status: 400 });
        }

        const target = channel.trim();
        const isDM = target.startsWith('@');

        if (isDM) {
            const { sendDM } = require('@/services/slack');
            const result = await sendDM(target, text);
            return NextResponse.json({ ok: true, type: 'dm', ...result });
        } else {
            const { postToChannelByName } = require('@/services/slack');
            const result = await postToChannelByName(target, text);
            return NextResponse.json({ ok: true, type: 'channel', ...result });
        }
    } catch (error) {
        console.error('Slack send error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
