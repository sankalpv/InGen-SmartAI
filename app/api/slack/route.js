import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { fetchSlackMessages } = require('@/services/slack');
        const messages = await fetchSlackMessages();

        // AI summarize if we have messages and ai module
        if (messages.length > 0) {
            try {
                const { summarizeSlack } = await import('@/services/ai');
                const analyzed = await summarizeSlack(messages);
                return NextResponse.json({ messages: analyzed, source: 'mcp' });
            } catch {
                // AI summarize failed, return raw messages
                return NextResponse.json({ messages, source: 'mcp' });
            }
        }

        return NextResponse.json({ messages: [], source: 'mcp' });
    } catch (error) {
        console.error('Slack API error:', error);
        // Fallback to mock data
        try {
            const { mockSlackMessages } = require('@/services/mock-data');
            const { summarizeSlack } = await import('@/services/ai');
            const analyzed = await summarizeSlack(mockSlackMessages);
            return NextResponse.json({ messages: analyzed, source: 'mock' });
        } catch {
            return NextResponse.json({ messages: [], source: 'error', error: error.message });
        }
    }
}
