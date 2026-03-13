import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const body = await request.json();
        const { type, target, text, channel } = body;

        // Backward compatible: if 'channel' provided without 'type', treat as channel send
        const sendType = type || (channel ? 'channel' : null);
        const sendTarget = target || channel;

        if (!sendTarget || !text) {
            return NextResponse.json({ ok: false, error: 'target and text required' }, { status: 400 });
        }

        const { postToChannelByName, sendDM } = require('@/services/slack');

        if (sendType === 'dm') {
            const result = await sendDM(sendTarget, text);
            return NextResponse.json({ ok: true, ...result });
        } else {
            const result = await postToChannelByName(sendTarget, text);
            return NextResponse.json({ ok: true, ...result });
        }
    } catch (error) {
        console.error('Slack send error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
