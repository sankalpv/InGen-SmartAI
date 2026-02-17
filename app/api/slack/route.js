import { mockSlackMessages } from '@/services/mock-data';
import { summarizeSlack } from '@/services/ai';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true' || !process.env.SLACK_BOT_TOKEN;

        if (useMock) {
            const analyzed = await summarizeSlack(mockSlackMessages);
            return NextResponse.json({ messages: analyzed, source: 'mock' });
        }

        const analyzed = await summarizeSlack(mockSlackMessages);
        return NextResponse.json({ messages: analyzed, source: 'mock' });
    } catch (error) {
        console.error('Slack API error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch Slack messages' },
            { status: 500 }
        );
    }
}
