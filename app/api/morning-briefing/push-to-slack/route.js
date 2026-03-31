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

    const label = meta ? `${meta.emoji} *${meta.label}*` : '🌅 *Briefing*';
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    return [
        `${label} — ${dateStr}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        ...slackLines,
        '',
        `_Sent by InGen · ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}_`,
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
            // Parse user ID from result
            let userId;
            if (meResult?.id) userId = meResult.id;
            else if (meResult?.content?.[0]?.text) {
                try { userId = JSON.parse(meResult.content[0].text)?.id; } catch { /* ignore */ }
            }
            if (!userId) throw new Error('Could not resolve user ID for sankalpv');

            const dmResult = await mcpClient.callTool('slack-mcp', 'open_dm_channel', { userIds: userId });
            if (dmResult?.channel_id) dmChannelId = dmResult.channel_id;
            else if (dmResult?.content?.[0]?.text) {
                try { dmChannelId = JSON.parse(dmResult.content[0].text)?.channel_id; } catch { /* ignore */ }
            }
            if (!dmChannelId) throw new Error('Could not open DM channel');
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
