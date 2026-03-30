import { NextResponse } from 'next/server';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mcpClient = require('../../../services/mcp-client');
const { normalizeEmail } = require('../../../services/outlook-mcp');
const logger = require('../../../services/logger').child('EmailThread');

/**
 * Decode a raw MIME body (multipart / base64 / quoted-printable) to plain text.
 * Mirrors the server-side decodeMimeBody() in outlook-mcp.js.
 */
function decodeMimeBody(raw) {
    if (!raw) return '';
    if (!raw.includes('Content-Type:') && !raw.includes('--=')) return raw;
    try {
        const parts = [];
        const partRegex = /Content-Type:\s*(text\/(?:plain|html))[^\n]*\n(?:Content-Transfer-Encoding:\s*(\S+)\s*\n)?(?:[^\n]+\n)*?\n([\s\S]*?)(?=--=|$)/gim;
        let m;
        while ((m = partRegex.exec(raw)) !== null) {
            const mimeType = m[1].toLowerCase();
            const encoding = (m[2] || 'plain').toLowerCase().trim();
            let content = m[3] || '';
            if (encoding === 'base64') {
                try { content = Buffer.from(content.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch { content = ''; }
            } else if (encoding === 'quoted-printable') {
                content = content.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
            }
            if (mimeType === 'text/html') {
                content = content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
            }
            content = content.trim();
            if (content) parts.push({ mimeType, content });
        }
        const chosen = parts.find(p => p.mimeType === 'text/plain') || parts.find(p => p.mimeType === 'text/html');
        if (chosen) return chosen.content;
    } catch { /* fall through */ }
    return raw;
}

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
            body: decodeMimeBody(m.body || ''),
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
