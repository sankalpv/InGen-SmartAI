import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const mcpClient = require('../../../../services/mcp-client');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CACHE_FILE = path.join(process.cwd(), 'data', 'morning-briefing-cache.json');

// Convert markdown briefing to Slack mrkdwn text (Slack doesn't render full markdown)
function briefingToSlack(text, meta) {
    if (!text) return '';
    const lines = text.split('\n');
    const slackLines = [];

    for (const line of lines) {
        // H2 → bold + divider feel
        if (/^## /.test(line)) {
            slackLines.push('');
            slackLines.push(`*${line.replace(/^## /, '').trim()}*`);
            slackLines.push('─────────────────────');
        }
        // Table rows → preserve as monospace
        else if (/^\|/.test(line) && !/^\|[-\s|]+\|$/.test(line)) {
            slackLines.push(line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()).join('  |  '));
        }
        // Separator rows → skip
        else if (/^\|[-\s|]+\|$/.test(line)) {
            // skip
        }
        // Bullet points
        else if (/^[•\-\*] /.test(line)) {
            slackLines.push(`• ${line.replace(/^[•\-\*] /, '').replace(/\*\*(.*?)\*\*/g, '*$1*')}`);
        }
        // Numbered list
        else if (/^\d+\. /.test(line)) {
            slackLines.push(line.replace(/\*\*(.*?)\*\*/g, '*$1*'));
        }
        // Normal text — convert **bold** to *bold*
        else {
            slackLines.push(line.replace(/\*\*(.*?)\*\*/g, '*$1*'));
        }
    }

    const INGEN_PREFIX = '🤖 <https://code.amazon.com/packages/InGen-SmartAI/trees/mainline|InGen>:';
    const briefingLabel = meta ? `${meta.emoji} *${meta.label}*` : '🌅 *Briefing*';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return [
        `${INGEN_PREFIX} ${briefingLabel} — ${dateStr}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...slackLines,
        '',
        `_Sent at ${timeStr}_`,
    ].join('\n');
}

export async function POST(req) {
    try {
        // Read from cache
        if (!fs.existsSync(CACHE_FILE)) {
            return NextResponse.json({ error: 'No briefing available. Open the briefing first to generate it.' }, { status: 404 });
        }

        const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        if (!cached.briefing) {
            return NextResponse.json({ error: 'Cached briefing is empty.' }, { status: 404 });
        }

        const slackText = briefingToSlack(cached.briefing, cached.meta);

        // Get own user ID and open self-DM
        // slack-mcp: look up current user, then open DM channel
        let dmChannelId;
        try {
            const meResult = await mcpClient.callTool('slack-mcp', 'lookup_user', { query: 'sankalpv' });
            console.log('[Briefing/Push] lookup_user raw:', JSON.stringify(meResult)?.slice(0, 300));

            // Extract user ID — try multiple field shapes
            function extractUserId(r) {
                if (!r) return null;
                // Direct fields
                if (r.id) return r.id;
                if (r.userId) return r.userId;
                if (r.user_id) return r.user_id;
                if (r.user?.id) return r.user.id;
                // Envelope: content[0].text → JSON
                const text = r.content?.[0]?.text || r.text || '';
                if (text) {
                    try {
                        const p = JSON.parse(text);
                        return p.id || p.userId || p.user_id || p.user?.id || null;
                    } catch { /* ignore */ }
                }
                return null;
            }

            const userId = extractUserId(meResult);
            if (!userId) throw new Error(`Could not resolve user ID for sankalpv. Raw: ${JSON.stringify(meResult)?.slice(0, 200)}`);

            const dmResult = await mcpClient.callTool('slack-mcp', 'open_dm_channel', { userIds: userId });
            console.log('[Briefing/Push] open_dm_channel raw:', JSON.stringify(dmResult)?.slice(0, 300));

            // Extract channel ID — try multiple field shapes
            function extractChannelId(r) {
                if (!r) return null;
                if (r.channel_id) return r.channel_id;
                if (r.channelId) return r.channelId;
                if (r.channel?.id) return r.channel.id;
                if (r.channel && typeof r.channel === 'string') return r.channel;
                if (r.id && r.id.startsWith('D')) return r.id; // DM channel IDs start with D
                // Envelope
                const text = r.content?.[0]?.text || r.text || '';
                if (text) {
                    try {
                        const p = JSON.parse(text);
                        return p.channel_id || p.channelId || p.channel?.id || (typeof p.channel === 'string' ? p.channel : null) || null;
                    } catch { /* ignore */ }
                }
                return null;
            }

            dmChannelId = extractChannelId(dmResult);
            if (!dmChannelId) throw new Error(`Could not extract DM channel ID. Raw: ${JSON.stringify(dmResult)?.slice(0, 200)}`);
        } catch (e) {
            console.error('[Briefing/Push] DM open failed:', e.message);
            return NextResponse.json({ error: `Could not open Slack DM: ${e.message}` }, { status: 500 });
        }

        // Post the briefing as a DM
        await mcpClient.callTool('slack-mcp', 'post_message', {
            channel: dmChannelId,
            text: slackText,
        });

        return NextResponse.json({ ok: true, channel: dmChannelId });
    } catch (error) {
        console.error('[Briefing/Push] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
