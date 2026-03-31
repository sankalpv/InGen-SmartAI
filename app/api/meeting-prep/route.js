import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const meetingPrep = require('../../../services/meeting-prep');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/meeting-prep
 *
 * Query params:
 *   preview=true      — return brief as JSON (no Slack delivery)
 *   send=true         — generate + send to Slack self-DM
 *   title=<string>    — filter by meeting title keyword
 *   date=<YYYY-MM-DD> — prep meeting on a specific date (default: today)
 *   eventId=<string>  — prep a specific event by ID
 *   list=true         — return today's prepped meetings list (no brief generation)
 */
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const preview  = searchParams.get('preview') === 'true';
        const send     = searchParams.get('send') === 'true';
        const list     = searchParams.get('list') === 'true';
        const title    = searchParams.get('title') || '';
        const date     = searchParams.get('date') || '';
        const eventId  = searchParams.get('eventId') || '';

        // List mode: return today's eligible meetings
        if (list) {
            const meetings = meetingPrep.getTodayMeetings();
            return NextResponse.json({
                meetings: meetings.map(e => ({
                    id: e.id,
                    title: e.title || e.subject,
                    startTime: e.startTime || e.start?.dateTime,
                    endTime: e.endTime || e.end?.dateTime,
                    organizer: e.organizer?.name || '',
                    attendees: (e.attendees || []).map(a => a?.name || a?.email || a).filter(Boolean),
                    location: e.location || '',
                })),
            });
        }

        // Preview or send mode: generate the brief
        if (preview || send) {
            const result = await meetingPrep.prepMeeting({ title, date, eventId });
            const { event, context, brief } = result;

            // If send=true, also post to Slack
            let slackSent = false;
            if (send) {
                try {
                    const slack = require('../../../services/slack');
                    const fs = require('fs');
                    const path = require('path');
                    const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

                    if (settings.phonetoolAlias && settings.mcpServers?.['slack-mcp']) {
                        const startTime = new Date(event.startTime || event.start?.dateTime || '');
                        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        const minsUntil = Math.round((startTime.getTime() - Date.now()) / 60000);
                        const attendeeStr = (event.attendees || []).length > 0
                            ? (event.attendees || []).map(a => a?.name?.split(',')[0] || a?.email || a).slice(0, 4).join(', ')
                            : `Organized by ${event.organizer?.name || 'unknown'}`;
                        const meetingTitle = event.title || event.subject || 'Meeting';
                        const INGEN_PREFIX = '🤖 <https://code.amazon.com/packages/InGen-SmartAI/trees/mainline|InGen>:';
                        const header = `📋 *Meeting Prep: "${meetingTitle}"* — ${minsUntil > 0 ? `in ${minsUntil} min (${timeStr})` : `at ${timeStr}`}\n👥 ${attendeeStr}`;
                        const divider = '─'.repeat(40);
                        const body = brief.replace(/\*\*(.+?)\*\*/g, '*$1*');
                        let footer = '';
                        if (context.slackMessages?.length > 0) {
                            const channels = [...new Set(context.slackMessages.map(m => m.channel).filter(c => c && !c.match(/^[DU]/)))];
                            if (channels.length > 0) footer = `\n_Sources: ${channels.map(c => `#${c}`).join(', ')}_`;
                        }
                        const fullMessage = `${INGEN_PREFIX}\n${header}\n${divider}\n${body}${footer}`;
                        const dmInfo = await slack.getMyDMs(1);
                        await slack.postBlockMessage(dmInfo.channelId, fullMessage);
                        slackSent = true;
                    }
                } catch (slackErr) {
                    console.error('[MeetingPrep] Slack send failed:', slackErr.message);
                }
            }

            return NextResponse.json({
                ok: true,
                slackSent,
                event: {
                    id: event.id,
                    title: event.title || event.subject,
                    startTime: event.startTime || event.start?.dateTime,
                    endTime: event.endTime || event.end?.dateTime,
                    organizer: event.organizer?.name || '',
                    attendees: (event.attendees || []).map(a => a?.name || a?.email || a).filter(Boolean),
                    location: event.location || '',
                },
                context: {
                    emailCount: context.emails.length,
                    slackCount: context.slackMessages.length,
                    quipCount: context.quipDocs.length,
                    ticketCount: context.tickets.length,
                    emails: context.emails,
                    slackMessages: context.slackMessages,
                    quipDocs: context.quipDocs,
                    tickets: context.tickets,
                },
                brief,
            });
        }

        return NextResponse.json({ error: 'Specify ?preview=true, ?send=true, or ?list=true' }, { status: 400 });
    } catch (error) {
        console.error('[MeetingPrep API] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
