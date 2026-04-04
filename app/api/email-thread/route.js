import { NextResponse } from 'next/server';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mcpClient = require('../../../services/mcp-client');
const bedrockClient = require('../../../services/bedrock-client');
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

/**
 * Generate an AI summary of a full email thread.
 * Returns { summary, ask, decision, myAction } or null on failure.
 */
async function summarizeThread(messages) {
    if (!messages || messages.length === 0) return null;

    // Build readable thread text (last 8 messages to stay within token limits)
    const recentMsgs = messages.slice(-8);
    const threadText = recentMsgs.map((m, i) => {
        const from = m.sender?.name || m.sender?.address || 'Unknown';
        const date = m.receivedAt ? new Date(m.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const body = (m.body || '').slice(0, 800).trim();
        return `[Message ${i + 1} — ${from} on ${date}]\n${body}`;
    }).join('\n\n---\n\n');

    const prompt = `You are summarizing an email thread for a busy engineering manager. Be concise and specific.

EMAIL THREAD (${messages.length} messages total, showing last ${recentMsgs.length}):
${threadText}

Respond in this exact JSON format:
{
  "summary": "1-2 sentence overview of what this thread is about",
  "ask": "What is being asked of the recipient? (or 'None' if FYI only)",
  "decision": "What was decided or agreed upon? (or 'No decision yet' if pending)",
  "myAction": "What should the manager do next? Be specific. (or 'No action needed')"
}

Respond with ONLY the JSON object, no other text.`;

    try {
        let responseText = '';
        if (bedrockClient.isAvailable()) {
            responseText = await bedrockClient.generate(prompt, { temperature: 0.1, maxTokens: 512 });
        } else {
            const ollamaClient = require('../../../services/ollama-client');
            responseText = await ollamaClient.generate(prompt, { temperature: 0.1 });
        }

        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (e) {
        logger.warn('Thread summarization failed:', e.message);
        return null;
    }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const summarize = searchParams.get('summarize') === 'true';

    if (!conversationId) {
        return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    try {
        const result = await mcpClient.callTool('aws-outlook-mcp', 'email_read', { conversationId });

        // The MCP server double-wraps: outer envelope is { content: [{ type:'text', text: '<JSON>' }] }
        // where the inner text is the actual { success, content: { emails: [...] } } payload.
        let outerText = result.content[0].text;
        // aws-outlook-mcp v0.3.2+ wraps responses in <untrusted_content_*> XML tags
        outerText = outerText.replace(/<\/?untrusted_content_[a-f0-9]+>/gi, '').trim();
        let outer;
        try {
            outer = JSON.parse(outerText);
        } catch (parseErr) {
            // Fallback: extract first JSON object or array from text
            const match = outerText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (match) {
                outer = JSON.parse(match[1]);
            } else {
                throw new Error(`Failed to parse MCP response: ${parseErr.message}`);
            }
        }

        // Unwrap one more level if needed
        let raw;
        if (outer.success !== undefined) {
            // Already unwrapped (direct payload)
            raw = outer;
        } else if (outer.content && Array.isArray(outer.content) && outer.content[0]?.text) {
            // Double-wrapped: parse the inner text (also strip untrusted_content tags)
            let innerText = outer.content[0].text.replace(/<\/?untrusted_content_[a-f0-9]+>/gi, '').trim();
            raw = JSON.parse(innerText);
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

        // Optionally generate AI summary
        let aiSummary = null;
        if (summarize && emails.length > 0) {
            aiSummary = await summarizeThread(emails);
        }

        return NextResponse.json({
            success: true,
            messages: emails,
            total: emails.length,
            ...(aiSummary ? { aiSummary } : {}),
        });

    } catch (err) {
        logger.error('email-thread fetch failed:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
