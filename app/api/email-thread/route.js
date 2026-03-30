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

        // The MCP server double-wraps: outer envelope is { content: [{ type:'text', text: '<JSON>' }] }
        // where the inner text is the actual { success, content: { emails: [...] } } payload.
        const outerText = result.content[0].text;
        const outer = JSON.parse(outerText);

        // Unwrap one more level if needed
        let raw;
        if (outer.success !== undefined) {
            // Already unwrapped (direct payload)
            raw = outer;
        } else if (outer.content && Array.isArray(outer.content) && outer.content[0]?.text) {
            // Double-wrapped: parse the inner text
            raw = JSON.parse(outer.content[0].text);
        } else {
            return NextResponse.json({ error: 'Unexpected MCP response shape', detail: outer }, { status: 500 });
        }

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
