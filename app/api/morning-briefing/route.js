import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');
const tracker = require('../../../services/usage-tracker');
const mcpClient = require('../../../services/mcp-client');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const CACHE_FILE = path.join(process.cwd(), 'data', 'morning-briefing-cache.json');
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ─── Time-aware label ───

function getBriefingLabel() {
    const h = new Date().getHours();
    if (h < 12) return { label: 'Morning Briefing', emoji: '🌅', period: 'morning' };
    if (h < 16) return { label: 'Afternoon Briefing', emoji: '☀️', period: 'afternoon' };
    if (h < 20) return { label: 'Evening Briefing', emoji: '🌆', period: 'evening' };
    return { label: 'Late Night Briefing', emoji: '🌙', period: 'late night' };
}

// ─── Helpers ───

function filterToToday(items, dateField) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    return items.filter(item => {
        let val = item;
        for (const p of dateField.split('.')) val = val?.[p];
        if (!val) return false;
        const d = new Date(val);
        return !isNaN(d) && d >= startOfDay && d < endOfDay;
    });
}

function ensureDataDir() {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getCached() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const c = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (Date.now() - new Date(c.cachedAt).getTime() < CACHE_TTL) return c;
        }
    } catch (e) { /* ignore */ }
    return null;
}

function writeCache(data) {
    try { ensureDataDir(); fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2)); } catch (e) { /* ignore */ }
}

// ─── Rule-based email triage ───

function quickCategory(e) {
    if (e.aiCategory && e.aiCategory !== 'fyi') return e.aiCategory;
    const subject = (e.subject || '').toLowerCase();
    const snippet = (e.snippet || e.body || '').toLowerCase().slice(0, 300);
    const from = typeof e.from === 'string' ? e.from.toLowerCase()
        : `${e.from?.name || ''} ${e.from?.email || ''}`.toLowerCase();
    const combined = `${subject} ${snippet} ${from}`;
    const recipientCount = (e.recipients || []).length;

    if (/\bno[-_]?reply\b|\bnewsletter\b|\bunsubscribe\b|\bauto[-_]?generated\b|\bdo not reply\b/.test(combined)) return 'fyi';
    if (from.includes('no-reply') || from.includes('noreply') || from.includes('donotreply')) return 'fyi';
    if (from.includes('notification') || from.includes('elmo-') || from.includes('alerts@') || from.includes('reports@') || from.includes('sdo-') || from.includes('security-') || from.includes('aws-') || from.includes('jira@') || from.includes('github@') || from.includes('pagerduty')) return 'fyi';
    if (recipientCount > 10) return 'fyi';
    if (/\booo\b|out of office|on vacation/.test(combined)) return 'fyi';
    if (/\b(weekly|daily|monthly)\s+(report|digest|summary|newsletter)\b/.test(subject)) return 'fyi';
    if (/^(member (added|removed)|you (have been|were) (added|removed|subscribed|unsubscribed))/.test(subject)) return 'fyi';
    if (/\b(shepherd report|security report|compliance report|audit report)\b/.test(subject)) return 'fyi';
    if (/^(re: action required|fyi:|for your information)/.test(subject) && recipientCount > 5) return 'fyi';
    if (/\b(build (succeeded|failed)|pipeline|deployment|test results|alarm (triggered|resolved))\b/.test(subject)) return 'fyi';

    if (/\baction required\b|\burgent\b|\basap\b|\bblocking\b|\bplease (review|approve|confirm|respond|reply)\b|\baction item\b|\bescalat/.test(combined)) return 'respond_now';
    if (/\bneed your (approval|sign-?off|input|feedback|decision)\b|\bwhat (do you think|are your thoughts)\b/.test(combined)) return 'respond_now';

    if (/\bfollowing up\b|\bfollow.?up\b|\bcircling back\b|\bany update\b|\blet me know\b|\blmk\b|\bquick (question|ask)\b/.test(combined)) return 'respond_today';
    if (/\bimportant\b|\bdeadline\b|\b1:1|one.on.one\b/.test(combined)) return 'respond_today';

    if (recipientCount <= 3) {
        const ageMs = Date.now() - new Date(e.date || e.received || 0).getTime();
        if (ageMs / (1000 * 60 * 60 * 24) <= 2) return 'respond_today';
    }
    return 'fyi';
}

// ─── Slack data fetch ───

// Unwrap the MCP tool response envelope (content[0].text → JSON)
function parseMcpResult(result) {
    try {
        const text = result?.content?.[0]?.text || '';
        if (typeof text === 'string' && text.startsWith('{')) return JSON.parse(text);
        if (typeof text === 'string' && text.startsWith('[')) return JSON.parse(text);
        return text || result || {};
    } catch {
        return result || {};
    }
}

async function fetchSlackData() {
    const allMessages = [];
    const seenTs = new Set();

    function addMessages(msgs, channelName, isDM) {
        for (const m of (msgs || [])) {
            if (!m.ts || seenTs.has(m.ts)) continue;
            seenTs.add(m.ts);
            allMessages.push({
                user: m.user?.display_name || m.user?.real_name || m.username || m.user || 'unknown',
                channel: channelName,
                text: (m.text || '').slice(0, 200).replace(/\n/g, ' ').trim(),
                ts: m.ts,
                time: new Date(parseFloat(m.ts) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                isDM: !!isDM,
            });
        }
    }

    function hasUnreads(ch) {
        return !!(ch.has_unreads || (ch.unread_count && ch.unread_count > 0) || (ch.unread_count_display && ch.unread_count_display > 0));
    }

    try {
        // 1. Get channels the user is a member of
        // list_my_channels returns a section-based structure: { sections: [{channels:[...]}, ...] }
        // Flatten all channels from all sections into a single array.
        const channelsResult = await mcpClient.callTool('slack-mcp', 'list_my_channels', {});
        const channelsData = parseMcpResult(channelsResult);

        let channels = [];
        if (Array.isArray(channelsData)) {
            channels = channelsData;
        } else if (Array.isArray(channelsData?.channels)) {
            channels = channelsData.channels;
        } else if (Array.isArray(channelsData?.sections)) {
            // Flatten section-based structure
            for (const section of channelsData.sections) {
                if (Array.isArray(section.channels)) channels.push(...section.channels);
            }
        }

        // Only fetch channels/DMs with unread messages
        const unreadRegular = channels.filter(c => !c.is_im && !c.is_mpim && !c.is_archived && hasUnreads(c)).slice(0, 12);
        const unreadDMs = channels.filter(c => (c.is_im || c.is_mpim) && hasUnreads(c)).slice(0, 15);

        // 2. Fetch unread messages from channels with activity
        for (const ch of unreadRegular) {
            try {
                const r = await mcpClient.callTool('slack-mcp', 'get_messages', {
                    channel: ch.id || ch.name,
                    limit: ch.unread_count ? Math.min(ch.unread_count + 2, 20) : 10,
                    includeThreadReplies: false,
                });
                const data = parseMcpResult(r);
                addMessages(data?.messages || data || [], ch.name || ch.id, false);
            } catch { /* skip channel on error */ }
        }

        // 3. Fetch unread DMs
        for (const dm of unreadDMs) {
            try {
                const r = await mcpClient.callTool('slack-mcp', 'get_messages', {
                    channel: dm.id,
                    limit: dm.unread_count ? Math.min(dm.unread_count + 2, 10) : 5,
                    includeThreadReplies: false,
                });
                const data = parseMcpResult(r);
                // Use the DM partner name if available
                const dmName = dm.topic || dm.name || 'DM';
                addMessages(data?.messages || data || [], dmName, true);
            } catch { /* skip */ }
        }
    } catch (e) {
        console.error('[Briefing] Slack fetch failed:', e.message);
        return { total: 0, dmCount: 0, channelCount: 0, messages: [], byChannel: {}, error: e.message };
    }

    allMessages.sort((a, b) => parseFloat(b.ts || 0) - parseFloat(a.ts || 0));

    const byChannel = {};
    for (const m of allMessages) {
        if (!byChannel[m.channel]) byChannel[m.channel] = [];
        byChannel[m.channel].push(m);
    }

    return {
        total: allMessages.length,
        dmCount: allMessages.filter(m => m.isDM).length,
        channelCount: Object.keys(byChannel).filter(c => c !== 'DM').length,
        messages: allMessages,
        byChannel,
    };
}

// ─── Gather all data sources ───

async function gatherAllData() {
    const sources = {};

    // 1. Emails
    try {
        const emailCache = localStore.getEmails ? localStore.getEmails() : { data: null };
        const allEmails = emailCache.data || [];
        const received = allEmails.filter(e => !e.isSent && e.folder !== 'Sent Items');
        const todayEmails = filterToToday(received, 'received').length > 0
            ? filterToToday(received, 'received')
            : filterToToday(received, 'date');
        const urgent = todayEmails.filter(e => quickCategory(e) === 'respond_now');
        const respondToday = todayEmails.filter(e => quickCategory(e) === 'respond_today');
        const topUrgent = urgent.slice(0, 5).map(e => ({
            from: typeof e.from === 'string' ? e.from.split('<')[0].trim() : (e.from?.name || e.from?.email || 'Unknown'),
            subject: (e.subject || '').slice(0, 60),
            ageHours: Math.round((Date.now() - new Date(e.date || e.received || 0).getTime()) / (1000 * 60 * 60)),
        }));
        sources.emails = {
            total: todayEmails.length,
            urgent: urgent.length,
            respondToday: respondToday.length,
            fyi: todayEmails.length - urgent.length - respondToday.length,
            topUrgent,
        };
    } catch (e) { sources.emails = { total: 0, urgent: 0, respondToday: 0, fyi: 0, topUrgent: [], error: e.message }; }

    // 2. Calendar
    try {
        const calCache = localStore.getCalendar ? localStore.getCalendar() : { data: null };
        const allMeetings = calCache.data || [];
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 86400000);
        const todayMeetings = allMeetings.filter(m => {
            const d = new Date(m.start?.dateTime || m.startTime || m.date);
            return !isNaN(d) && d >= startOfDay && d < endOfDay;
        });
        const sorted = [...todayMeetings].sort((a, b) =>
            new Date(a.start?.dateTime || a.startTime || a.date) - new Date(b.start?.dateTime || b.startTime || b.date)
        );
        const upcoming = sorted.filter(m => new Date(m.start?.dateTime || m.startTime || m.date) > now);
        sources.calendar = {
            totalToday: todayMeetings.length,
            upcomingCount: upcoming.length,
            meetings: sorted.map(m => {
                const start = new Date(m.start?.dateTime || m.startTime || m.date);
                const end = m.end?.dateTime || m.endTime ? new Date(m.end?.dateTime || m.endTime) : null;
                const duration = end ? Math.round((end - start) / 60000) : null;
                return {
                    title: (m.subject || m.title || 'Meeting').slice(0, 60),
                    time: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                    duration: duration ? `${duration}min` : null,
                    attendees: m.attendees?.length || m.attendeeCount || null,
                    isPast: start < now,
                };
            }),
        };
    } catch (e) { sources.calendar = { totalToday: 0, upcomingCount: 0, meetings: [], error: e.message }; }

    // 3. WBR Goals
    try {
        const wbrReport = require('../../../services/wbr-report');
        const wbr = await wbrReport.generateWbrReport(false);
        if (wbr && wbr.sections) {
            const allGoals = wbr.sections.flatMap(s => s.goals || []);
            const byColor = wbr.summary?.byColor || {};
            const today = new Date(new Date().toDateString());
            const missedEcds = allGoals.filter(g => {
                if (!g.ecd || g.ecd === 'Missing') return false;
                try { const [mm, dd, yyyy] = g.ecd.split('-').map(Number); return new Date(yyyy, mm - 1, dd) < today; }
                catch { return false; }
            });
            const blocked = allGoals.filter(g => g.status === 'Blocked');
            const redGoals = allGoals.filter(g => g.statusColor === 'Red');
            const yellowGoals = allGoals.filter(g => g.statusColor === 'Yellow');
            sources.goals = {
                total: allGoals.length,
                green: byColor.Green || 0,
                yellow: byColor.Yellow || 0,
                red: byColor.Red || 0,
                missing: byColor.Missing || 0,
                missedEcds: missedEcds.map(g => ({ id: g.id, title: (g.title || '').slice(0, 50), ecd: g.ecd, owner: g.owner || 'unassigned' })).slice(0, 5),
                blocked: blocked.map(g => ({ id: g.id, title: (g.title || '').slice(0, 50), owner: g.owner || 'unassigned' })).slice(0, 5),
                redGoals: redGoals.map(g => ({ id: g.id, title: (g.title || '').slice(0, 50), owner: g.owner || 'unassigned', ecd: g.ecd })).slice(0, 5),
                yellowGoals: yellowGoals.map(g => ({ id: g.id, title: (g.title || '').slice(0, 50), owner: g.owner || 'unassigned' })).slice(0, 5),
            };
        } else {
            sources.goals = null;
        }
    } catch { sources.goals = null; }

    // 4. Engineering Metrics
    try {
        const engMetrics = require('../../../services/eng-metrics');
        await engMetrics.init();
        const hasData = await engMetrics.hasDataForWeek();
        if (hasData) {
            const dash = await engMetrics.getOrgDashboard();
            sources.codeMetrics = {
                crsCreated: dash.summary?.crsCreated?.value || 0,
                crsReviewed: dash.summary?.crsReviewed?.value || 0,
                staleCrs: dash.alerts?.staleCrs || 0,
                totalEngineers: dash.totalEngineers || 0,
                crsTrend: dash.summary?.crsCreated?.trend || 0,
                topPerformer: dash.engineers?.[0] ? { name: dash.engineers[0].name, crs: dash.engineers[0].crsCreated } : null,
                decliningEngineers: (dash.engineers || []).filter(e => e.declining3w).map(e => e.name),
            };
        } else {
            sources.codeMetrics = null;
        }
    } catch { sources.codeMetrics = null; }

    // 5. Ticket Health
    try {
        const ticketHealth = require('../../../services/ticket-health');
        const tickets = await ticketHealth.buildDashboard();
        if (tickets && !tickets.empty) {
            sources.tickets = {
                totalOpen: tickets.summary?.totalOpen || 0,
                assignedToMe: tickets.summary?.assignedToMe || 0,
                aging14d: tickets.summary?.aging14d || 0,
                aging30d: tickets.summary?.aging30d || 0,
                resolved30d: tickets.summary?.resolved30d || 0,
                groups: (tickets.groups || []).slice(0, 5).map(g => ({
                    name: g.name,
                    open: g.open,
                    oldestAge: g.oldestAge,
                })),
                topAging: (tickets.aging || []).slice(0, 5).map(t => ({
                    id: t.id,
                    title: (t.title || '').slice(0, 50),
                    ageDays: t.ageDays,
                    assignee: t.assignee || 'unassigned',
                })),
            };
        } else {
            sources.tickets = null;
        }
    } catch { sources.tickets = null; }

    // 6. Email intelligence (follow-ups + needs reply)
    try {
        const { fetchSentEmails } = require('../../../services/outlook-mcp');
        const emailCache = localStore.getEmails ? localStore.getEmails() : { data: null };
        const allEmails = emailCache.data || [];
        const inbox = allEmails.filter(e => !e.isSent && e.folder !== 'Sent Items');
        const nowMs = Date.now();

        const sentEmails = await fetchSentEmails(60, 7);
        const inboxConvIds = new Set(inbox.map(e => e.conversationId || e.id).filter(Boolean));

        const followups = sentEmails.filter(e => {
            if (!e.subject || !e.date) return false;
            const subj = (e.subject || '').toLowerCase();
            if (/^(re:|fwd:|fw:)/.test(subj)) return false;
            if (/calendar|invite|declined|accepted|tentative/.test(subj)) return false;
            const ageDays = (nowMs - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays < 3) return false;
            const convId = e.conversationId || e.id;
            return convId && !inboxConvIds.has(convId);
        }).slice(0, 5).map(e => ({
            subject: (e.subject || '').slice(0, 60),
            to: (e.recipients || []).map(r => r?.name || r?.email || r).slice(0, 2).join(', '),
            daysSinceSent: Math.floor((nowMs - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24)),
        }));

        let sentConvIds = new Set();
        try { sentConvIds = new Set(sentEmails.map(e => e.conversationId || e.id).filter(Boolean)); } catch {}
        const needsReply = inbox.filter(e => {
            const from = typeof e.from === 'string' ? e.from : (e.from?.email || '');
            if (/no-?reply|noreply|donotreply/.test(from.toLowerCase())) return false;
            if ((e.recipients || []).length > 10) return false;
            const ageMs = nowMs - new Date(e.date || e.received || 0).getTime();
            if (ageMs < 2 * 60 * 60 * 1000) return false;
            const convId = e.conversationId || e.id;
            if (convId && sentConvIds.has(convId)) return false;
            const cat = quickCategory(e);
            return cat === 'respond_now' || cat === 'respond_today';
        }).sort((a, b) => {
            const catA = quickCategory(a);
            const catB = quickCategory(b);
            if (catA === 'respond_now' && catB !== 'respond_now') return -1;
            if (catB === 'respond_now' && catA !== 'respond_now') return 1;
            return new Date(b.date || 0) - new Date(a.date || 0);
        }).slice(0, 5).map(e => ({
            subject: (e.subject || '').slice(0, 60),
            from: typeof e.from === 'string' ? e.from.split('<')[0].trim() : (e.from?.name || e.from?.email || 'Unknown'),
            ageHours: Math.round((nowMs - new Date(e.date || 0).getTime()) / (1000 * 60 * 60)),
            priority: quickCategory(e),
        }));

        sources.emailIntel = { followups, needsReply };
    } catch { sources.emailIntel = null; }

    // 7. Slack
    sources.slack = await fetchSlackData();

    return sources;
}

// ─── Build the data block for the AI prompt ───

function buildPrompt(sources, briefingMeta) {
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    let block = `=== DATA FOR ${briefingMeta.label.toUpperCase()} ===\n`;
    block += `Date: ${dayName}, ${dateStr} at ${timeStr}\n\n`;

    // Emails
    block += `--- EMAIL DATA ---\n`;
    block += `Total received today: ${sources.emails.total}\n`;
    block += `Urgent (respond now): ${sources.emails.urgent}\n`;
    block += `Respond today: ${sources.emails.respondToday}\n`;
    block += `FYI/automated: ${sources.emails.fyi}\n`;
    if (sources.emails.topUrgent?.length > 0) {
        block += `Top urgent emails:\n`;
        sources.emails.topUrgent.forEach(e => {
            block += `  - From: ${e.from} | Subject: "${e.subject}" | Age: ${e.ageHours}h\n`;
        });
    }
    if (sources.emailIntel?.needsReply?.length > 0) {
        block += `Needs your reply:\n`;
        sources.emailIntel.needsReply.forEach(n => {
            block += `  - [${n.priority === 'respond_now' ? 'URGENT' : 'TODAY'}] From: ${n.from} | "${n.subject}" | ${n.ageHours}h old\n`;
        });
    }
    if (sources.emailIntel?.followups?.length > 0) {
        block += `Awaiting reply from others (you sent, no response):\n`;
        sources.emailIntel.followups.forEach(f => {
            block += `  - To: ${f.to} | "${f.subject}" | ${f.daysSinceSent} days ago\n`;
        });
    }
    block += `\n`;

    // Slack
    block += `--- SLACK DATA ---\n`;
    if (sources.slack?.error && sources.slack.total === 0) {
        block += `Slack: unavailable (${sources.slack.error})\n`;
    } else {
        block += `Total recent messages (last 8h): ${sources.slack.total}\n`;
        block += `DMs: ${sources.slack.dmCount} | Channel messages: ${sources.slack.channelCount} channels\n`;
        if (sources.slack.messages?.length > 0) {
            block += `Messages by channel:\n`;
            const byChannel = sources.slack.byChannel || {};
            for (const [channel, msgs] of Object.entries(byChannel).slice(0, 8)) {
                block += `  #${channel} (${msgs.length} msg${msgs.length !== 1 ? 's' : ''}):\n`;
                msgs.slice(0, 3).forEach(m => {
                    block += `    @${m.user} at ${m.time}: "${m.text.replace(/\n/g, ' ').slice(0, 120)}"\n`;
                });
            }
        }
    }
    block += `\n`;

    // Calendar
    block += `--- CALENDAR DATA ---\n`;
    block += `Meetings today: ${sources.calendar.totalToday} (${sources.calendar.upcomingCount} still upcoming)\n`;
    if (sources.calendar.meetings?.length > 0) {
        sources.calendar.meetings.forEach(m => {
            const parts = [`${m.time}`, m.duration ? `(${m.duration})` : '', `"${m.title}"`];
            if (m.attendees) parts.push(`${m.attendees} attendees`);
            if (m.isPast) parts.push('[done]');
            block += `  - ${parts.filter(Boolean).join(' | ')}\n`;
        });
    } else {
        block += `  No meetings today.\n`;
    }
    block += `\n`;

    // Tickets
    block += `--- TICKET DATA ---\n`;
    if (!sources.tickets) {
        block += `No ticket data available.\n`;
    } else {
        block += `Open tickets: ${sources.tickets.totalOpen}\n`;
        block += `Assigned to you: ${sources.tickets.assignedToMe}\n`;
        block += `Aging >14 days: ${sources.tickets.aging14d}\n`;
        block += `Aging >30 days: ${sources.tickets.aging30d}\n`;
        block += `Resolved last 30d: ${sources.tickets.resolved30d}\n`;
        if (sources.tickets.topAging?.length > 0) {
            block += `Oldest open tickets:\n`;
            sources.tickets.topAging.forEach(t => {
                block += `  - ${t.id}: "${t.title}" | ${t.ageDays} days old | ${t.assignee}\n`;
            });
        }
    }
    block += `\n`;

    // Goals
    block += `--- GOALS DATA (WBR) ---\n`;
    if (!sources.goals) {
        block += `No WBR goals data available.\n`;
    } else {
        block += `Total goals: ${sources.goals.total} | 🟢 Green: ${sources.goals.green} | 🟡 Yellow: ${sources.goals.yellow} | 🔴 Red: ${sources.goals.red} | ⬜ Missing: ${sources.goals.missing}\n`;
        if (sources.goals.redGoals?.length > 0) {
            block += `Red goals:\n`;
            sources.goals.redGoals.forEach(g => {
                block += `  - ${g.id}: "${g.title}" | Owner: ${g.owner} | ECD: ${g.ecd || 'none'}\n`;
            });
        }
        if (sources.goals.yellowGoals?.length > 0) {
            block += `Yellow goals:\n`;
            sources.goals.yellowGoals.forEach(g => {
                block += `  - ${g.id}: "${g.title}" | Owner: ${g.owner}\n`;
            });
        }
        if (sources.goals.blocked?.length > 0) {
            block += `Blocked goals:\n`;
            sources.goals.blocked.forEach(g => {
                block += `  - ${g.id}: "${g.title}" | Owner: ${g.owner}\n`;
            });
        }
        if (sources.goals.missedEcds?.length > 0) {
            block += `Missed ECDs:\n`;
            sources.goals.missedEcds.forEach(g => {
                block += `  - ${g.id}: "${g.title}" | ECD: ${g.ecd} | Owner: ${g.owner}\n`;
            });
        }
    }
    block += `\n`;

    // Code Metrics
    block += `--- CODE METRICS (this week) ---\n`;
    if (!sources.codeMetrics) {
        block += `No engineering metrics data available.\n`;
    } else {
        block += `CRs created: ${sources.codeMetrics.crsCreated} (trend: ${sources.codeMetrics.crsTrend > 0 ? '+' : ''}${sources.codeMetrics.crsTrend}%)\n`;
        block += `CRs reviewed: ${sources.codeMetrics.crsReviewed}\n`;
        block += `Stale CRs (>5 days unreviewed): ${sources.codeMetrics.staleCrs}\n`;
        block += `Total engineers: ${sources.codeMetrics.totalEngineers}\n`;
        if (sources.codeMetrics.topPerformer) block += `Top performer: ${sources.codeMetrics.topPerformer.name} (${sources.codeMetrics.topPerformer.crs} CRs)\n`;
        if (sources.codeMetrics.decliningEngineers?.length > 0) block += `3-week decline: ${sources.codeMetrics.decliningEngineers.join(', ')}\n`;
    }

    return block;
}

// ─── System prompt ───

const SYSTEM_PROMPT = `You are InGen, a data-driven AI executive assistant. Your job is to transform raw data into a structured, scannable briefing.

OUTPUT FORMAT — produce exactly these 6 sections in order, using this exact markdown:

## 🔔 Needs Your Attention
[Numbered list of ACTION items only — things requiring the user to do something today. Format each as:]
1. [URGENT/TODAY] **Action verb** — detail with names, IDs, ages. Example: "Reply to Alice Chen re: 'JIRA-4421 API blocker' (sent 2d ago, no response)"

## 📧 Email Summary
[Table or bullet list. Include: total count, urgent count, respond-today count, FYI count. List each urgent/respond-today email as: "• **From:** Name | **Subject:** '...' | **Age:** Xh | **Priority:** URGENT/TODAY"]

## 💬 Slack Summary
[Channel-by-channel breakdown. Format: "**#channel-name** (N messages): bullet key messages with @user: 'exact quote'". Highlight any DMs requiring response.]

## 📅 Meeting Summary
[Table: Time | Meeting | Duration | Attendees. Mark past meetings [done]. Note any meetings without prep.]

## 🎫 Ticket Summary
[Stats line: X open, Y assigned to me, Z aging >14d. Then table of oldest tickets: ID | Title | Age | Assignee]

## 🎯 Goals Summary
[Stats line: X green, Y yellow, Z red. Table of non-green goals: Goal ID | Title | Status | Owner | ECD]

STRICT RULES:
1. EVERY bullet must contain at least one of: a number, a person's name, a quoted string, a date, or an ID
2. No prose sentences — only structured lists, tables, and stats lines
3. Use markdown tables (| col | col |) when comparing 3+ items
4. Names are always first-last or alias — never "a team member" or "someone"
5. Exact quotes from Slack/email enclosed in single quotes: 'message text'
6. If a section has no data, write: "No data available."
7. DO NOT add commentary, analysis, or opinion — only organize what the data says
8. Needs Your Attention must only contain items requiring action — not informational items`;

// ─── Main Handler ───

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const forceRefresh = searchParams.get('refresh') === 'true';

        tracker.trackAPICall('/api/morning-briefing');
        tracker.trackAIGeneration('MorningBriefing');

        if (!forceRefresh) {
            const cached = getCached();
            if (cached) {
                console.log('[Briefing] Serving cached briefing');
                return streamCachedBriefing(cached);
            }
        }

        return streamLiveBriefing();
    } catch (error) {
        console.error('[Briefing] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function streamCachedBriefing(cached) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', data: cached.meta })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', data: cached.sources })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: cached.briefing })}\n\n`));
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', cached: true })}\n\n`));
            controller.close();
        }
    });
    return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
}

async function streamLiveBriefing() {
    const encoder = new TextEncoder();
    const briefingMeta = getBriefingLabel();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (evt) => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)); } catch { /* closed */ }
            };

            try {
                send({ type: 'meta', data: briefingMeta });
                send({ type: 'status', message: 'Gathering emails, calendar, tickets, goals...' });

                const sources = await gatherAllData();
                send({ type: 'sources', data: sources });

                send({ type: 'status', message: 'Fetching Slack messages...' });
                // Slack is already gathered in gatherAllData(), status update only

                send({ type: 'status', message: 'Generating briefing...' });

                const dataBlock = buildPrompt(sources, briefingMeta);
                const userPrompt = `Generate the ${briefingMeta.label} for today using the data below. Follow all formatting rules exactly.\n\n${dataBlock}`;

                let fullText = '';
                const bedrockClient = require('../../../services/bedrock-client');

                if (bedrockClient.isAvailable()) {
                    await bedrockClient.streamGenerate(userPrompt, (chunk) => {
                        fullText += chunk;
                        send({ type: 'chunk', text: chunk });
                    }, {
                        system: SYSTEM_PROMPT,
                        maxTokens: 3000,
                        temperature: 0.1, // Low temperature — data formatting, not creative writing
                    });
                } else {
                    const ollamaClient = require('../../../services/ollama-client');
                    const response = await fetch('http://127.0.0.1:11434/api/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: ollamaClient.getConfig().llmModel,
                            system: SYSTEM_PROMPT,
                            prompt: userPrompt,
                            stream: true,
                            think: false,
                            options: { temperature: 0.1 },
                        }),
                    });
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        const chunk = decoder.decode(value, { stream: true });
                        for (const line of chunk.split('\n').filter(Boolean)) {
                            try {
                                const json = JSON.parse(line);
                                if (json.response) {
                                    fullText += json.response;
                                    send({ type: 'chunk', text: json.response });
                                }
                            } catch { /* skip */ }
                        }
                    }
                }

                writeCache({ cachedAt: new Date().toISOString(), meta: briefingMeta, sources, briefing: fullText });
                send({ type: 'done', cached: false });
            } catch (error) {
                send({ type: 'error', message: error.message });
            }

            controller.close();
        }
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }
    });
}
