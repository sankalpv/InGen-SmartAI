import { NextResponse } from 'next/server';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mcpClient = require('../../../services/mcp-client');
const logger = require('../../../services/logger').child('EmailThread');

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
        return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    try {
        const result = await mcpClient.callTool('aws-outlook-mcp', 'email_read', { conversationId });
        const raw = JSON.parse(result.content[0].text);

        if (!raw.success) {
            return NextResponse.json({ error: 'MCP returned failure', detail: raw }, { status: 500 });
        }

        const emails = (raw.content?.emails || []).map(m => ({
            id: m.itemId,
            sender: m.sender || {},
            receivedAt: m.recievedAt,
            subject: m.subject,
            body: m.body || '',         // HTML body
            recipients: m.recipients || [],
            cc: m.ccRecipients || [],
        }));

        // Sort oldest → newest so conversation reads top-to-bottom
        emails.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt));

        logger.info(`Thread for conversationId returned ${emails.length} message(s)`);
        return NextResponse.json({ success: true, messages: emails, total: emails.length });

    } catch (err) {
        logger.error('email-thread fetch failed:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
