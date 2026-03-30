import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');
const tracker = require('../../../services/usage-tracker');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const CACHE_FILE = path.join(process.cwd(), 'data', 'morning-briefing-cache.json');
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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
        const urgent = todayEmails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_now');
        const topSenders = [...new Set(urgent.map(e => (e.from || e.sender || '').split('<')[0].trim()))].slice(0, 3);
        sources.emails = {
            total: todayEmails.length,
            urgent: urgent.length,
            topUrgentSenders: topSenders,
            respondToday: todayEmails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_today').length,
        };
    } catch (e) { sources.emails = { total: 0, urgent: 0, topUrgentSenders: [], error: e.message }; }

    // 2. Calendar
    try {
        const calCache = localStore.getCalendar ? localStore.getCalendar() : { data: null };
        const allMeetings = calCache.data || [];
        const todayMeetings = allMeetings.filter(m => {
            const now = new Date();
            const s = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const e = new Date(s.getTime() + 86400000);
            const d = new Date(m.start?.dateTime || m.startTime || m.date);
            return !isNaN(d) && d >= s && d < e;
        });
        const sorted = [...todayMeetings].sort((a, b) =>
            new Date(a.start?.dateTime || a.startTime || a.date) - new Date(b.start?.dateTime || b.startTime || b.date)
        );
        const firstMeeting = sorted[0];
        const firstTime = firstMeeting ? new Date(firstMeeting.start?.dateTime || firstMeeting.startTime || firstMeeting.date) : null;
        sources.calendar = {
            totalMeetings: todayMeetings.length,
            firstMeeting: firstMeeting ? {
                title: firstMeeting.subject || firstMeeting.title || 'Meeting',
                time: firstTime ? firstTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '?',
            } : null,
        };
    } catch (e) { sources.calendar = { totalMeetings: 0, error: e.message }; }

    // 3. WBR Goals (Team Health)
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
                catch (e) { return false; }
            });
            const blocked = allGoals.filter(g => g.status === 'Blocked');
            const redGoals = allGoals.filter(g => g.statusColor === 'Red');
            sources.goals = {
                total: allGoals.length,
                green: byColor.Green || 0,
                yellow: byColor.Yellow || 0,
                red: byColor.Red || 0,
                missing: byColor.Missing || 0,
                missedEcds: missedEcds.length,
                missedEcdGoals: missedEcds.slice(0, 3).map(g => g.id),
                blockedCount: blocked.length,
                blockedGoals: blocked.slice(0, 3).map(g => g.id),
                redGoals: redGoals.slice(0, 3).map(g => ({ id: g.id, title: (g.title || '').substring(0, 40) })),
            };
        } else {
            sources.goals = null; // No WBR data configured
        }
    } catch (e) { sources.goals = null; }

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
                topPerformer: dash.engineers?.[0] ? {
                    name: dash.engineers[0].name,
                    crs: dash.engineers[0].crsCreated,
                } : null,
                decliningEngineers: (dash.engineers || []).filter(e => e.declining3w).length,
            };
        } else {
            sources.codeMetrics = null;
        }
    } catch (e) { sources.codeMetrics = null; }

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
            };
        } else {
            sources.tickets = null;
        }
    } catch (e) { sources.tickets = null; }

    // 6. Follow-ups & needs-reply (async, non-blocking — skip on failure)
    try {
        const { fetchSentEmails } = require('../../../services/outlook-mcp');
        const emailCache = localStore.getEmails ? localStore.getEmails() : { data: null };
        const allEmails = emailCache.data || [];
        const inbox = allEmails.filter(e => !e.isSent && e.folder !== 'Sent Items');

        // Follow-up detection: sent emails >3 days ago with no reply
        const sentEmails = await fetchSentEmails(60, 7);
        const inboxConvIds = new Set(inbox.map(e => e.conversationId || e.id).filter(Boolean));
        const nowMs = Date.now();
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
            subject: e.subject,
            to: (e.recipients || []).map(r => r?.name || r?.email || r).slice(0, 2).join(', '),
            daysSinceSent: Math.floor((nowMs - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24)),
        }));

        // Needs-reply: actionable inbox emails not yet replied to
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
            return e.aiCategory === 'respond_now' || e.aiCategory === 'respond_today';
        }).sort((a, b) => {
            if (a.aiCategory === 'respond_now' && b.aiCategory !== 'respond_now') return -1;
            if (b.aiCategory === 'respond_now' && a.aiCategory !== 'respond_now') return 1;
            return new Date(b.date || 0) - new Date(a.date || 0);
        }).slice(0, 5).map(e => ({
            subject: e.subject,
            from: typeof e.from === 'string' ? e.from.split('<')[0].trim() : (e.from?.name || e.from?.email || 'Unknown'),
            ageHours: Math.round((nowMs - new Date(e.date || 0).getTime()) / (1000 * 60 * 60)),
            priority: e.aiCategory || 'respond_today',
        }));

        sources.emailIntel = { followups, needsReply };
    } catch (e) { sources.emailIntel = null; }

    return sources;
}

// ─── Build the prompt ───

function buildPrompt(sources) {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'late night';
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    let dataBlock = `TODAY: ${dayName}, ${dateStr} (${timeOfDay})\n\n`;

    // Emails
    dataBlock += `📧 EMAILS:\n`;
    dataBlock += `- Total today: ${sources.emails.total}\n`;
    dataBlock += `- Urgent (respond now): ${sources.emails.urgent}\n`;
    dataBlock += `- Respond today: ${sources.emails.respondToday || 0}\n`;
    if (sources.emails.topUrgentSenders?.length > 0) {
        dataBlock += `- Top urgent senders: ${sources.emails.topUrgentSenders.join(', ')}\n`;
    }

    // Calendar
    dataBlock += `\n📅 CALENDAR:\n`;
    dataBlock += `- Meetings today: ${sources.calendar.totalMeetings}\n`;
    if (sources.calendar.firstMeeting) {
        dataBlock += `- First meeting: "${sources.calendar.firstMeeting.title}" at ${sources.calendar.firstMeeting.time}\n`;
    }

    // Goals
    if (sources.goals) {
        dataBlock += `\n🎯 TEAM GOALS (WBR):\n`;
        dataBlock += `- Total: ${sources.goals.total} | Green: ${sources.goals.green} | Yellow: ${sources.goals.yellow} | Red: ${sources.goals.red}\n`;
        if (sources.goals.missedEcds > 0) dataBlock += `- Missed ECDs: ${sources.goals.missedEcds} (${sources.goals.missedEcdGoals.join(', ')})\n`;
        if (sources.goals.blockedCount > 0) dataBlock += `- Blocked: ${sources.goals.blockedCount} (${sources.goals.blockedGoals.join(', ')})\n`;
        if (sources.goals.redGoals?.length > 0) dataBlock += `- Red goals: ${sources.goals.redGoals.map(g => `${g.id}: "${g.title}"`).join('; ')}\n`;
    }

    // Code metrics
    if (sources.codeMetrics) {
        dataBlock += `\n📊 CODE METRICS (this week):\n`;
        dataBlock += `- CRs created: ${sources.codeMetrics.crsCreated} (trend: ${sources.codeMetrics.crsTrend > 0 ? '+' : ''}${sources.codeMetrics.crsTrend}%)\n`;
        dataBlock += `- CRs reviewed: ${sources.codeMetrics.crsReviewed}\n`;
        dataBlock += `- Stale CRs (>5 days): ${sources.codeMetrics.staleCrs}\n`;
        dataBlock += `- Engineers: ${sources.codeMetrics.totalEngineers}\n`;
        if (sources.codeMetrics.topPerformer) dataBlock += `- Top performer: ${sources.codeMetrics.topPerformer.name} (${sources.codeMetrics.topPerformer.crs} CRs)\n`;
        if (sources.codeMetrics.decliningEngineers > 0) dataBlock += `- Engineers with 3-week decline: ${sources.codeMetrics.decliningEngineers}\n`;
    }

    // Tickets
    if (sources.tickets) {
        dataBlock += `\n🎫 TICKETS:\n`;
        dataBlock += `- Open: ${sources.tickets.totalOpen}\n`;
        dataBlock += `- Assigned to you: ${sources.tickets.assignedToMe}\n`;
        dataBlock += `- Aging >14 days: ${sources.tickets.aging14d}\n`;
        dataBlock += `- Aging >30 days: ${sources.tickets.aging30d}\n`;
        dataBlock += `- Resolved (30d): ${sources.tickets.resolved30d}\n`;
    }

    // Email intelligence: follow-ups & needs-reply
    if (sources.emailIntel) {
        const { followups, needsReply } = sources.emailIntel;
        if (followups?.length > 0) {
            dataBlock += `\n⏰ AWAITING REPLY (sent by you, no response yet):\n`;
            followups.forEach(f => {
                dataBlock += `- "${f.subject}" → ${f.to || 'recipient'} (${f.daysSinceSent}d ago, no reply)\n`;
            });
        }
        if (needsReply?.length > 0) {
            dataBlock += `\n💬 NEEDS YOUR REPLY:\n`;
            needsReply.forEach(n => {
                const urgency = n.priority === 'respond_now' ? '🔴' : '🟡';
                dataBlock += `- ${urgency} From ${n.from}: "${n.subject}" (${n.ageHours}h old)\n`;
            });
        }
    }

    return dataBlock;
}

const SYSTEM_PROMPT = `You are InGen — a sharp, confident AI executive assistant. Think Jarvis from Iron Man: competent, occasionally witty, always one step ahead. You respect your user's time.

PERSONALITY RULES:
1. WARM BUT PROFESSIONAL — Friendly greeting, not over-the-top. "Good morning. Here's what's on your plate." Confident, not gushing.
2. DRY WIT — Occasional clever observation, never forced. "That ticket is 16 days old — it's developing opinions." Keep humor subtle and sparse — maybe one quip per briefing.
3. DATA-SPECIFIC — Always cite actual numbers, goal IDs, names. Never vague. Lead with the most important thing.
4. CONCISE — This will be SPOKEN ALOUD. Maximum 6-8 sentences. Every word earns its place. No markdown, no bullet points, no headers. Just clean, flowing speech.
5. HONEST — When things are good, say so briefly. When things need attention, be direct and constructive. No sugarcoating.
6. NATURAL SIGN-OFF — Brief and motivating. "That's your day. Go make it count." or "You're set. I'll be here if you need me."

TIME-OF-DAY TONE:
- Morning: Crisp and energized
- Afternoon: Brief and efficient
- Evening: Slightly lighter, acknowledge the late hour
- Late night: Respect the hustle, keep it short

CRITICAL: Output ONLY spoken words. No formatting, no asterisks, no headers. Just natural spoken English that will be read aloud by a TTS voice.`;

// ─── Main Handler ───

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const forceRefresh = searchParams.get('refresh') === 'true';

        tracker.trackAPICall('/api/morning-briefing');
        tracker.trackAIGeneration('MorningBriefing');

        // Check cache
        if (!forceRefresh) {
            const cached = getCached();
            if (cached) {
                console.log('[MorningBriefing] Serving cached briefing');
                return streamCachedBriefing(cached);
            }
        }

        // Stream live briefing
        return streamLiveBriefing();
    } catch (error) {
        console.error('[MorningBriefing] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function streamCachedBriefing(cached) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            // Send source data immediately
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', data: cached.sources })}\n\n`));
            // Send briefing text as a single chunk
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

    const stream = new ReadableStream({
        async start(controller) {
            const send = (evt) => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)); } catch (e) { /* closed */ }
            };

            try {
                send({ type: 'status', message: 'Gathering your data...' });

                // Gather all sources
                const sources = await gatherAllData();
                send({ type: 'sources', data: sources });

                send({ type: 'status', message: 'Crafting your briefing...' });

                // Build prompt
                const dataBlock = buildPrompt(sources);
                const userPrompt = `Here is today's data for the morning briefing. Deliver it as a spoken briefing:\n\n${dataBlock}`;

                // Stream via Bedrock Sonnet (preferred) or Ollama fallback
                let fullText = '';
                const bedrockClient = require('../../../services/bedrock-client');

                if (bedrockClient.isAvailable()) {
                    console.log('[MorningBriefing] Using Bedrock Sonnet');
                    await bedrockClient.streamGenerate(userPrompt, (chunk) => {
                        fullText += chunk;
                        send({ type: 'chunk', text: chunk });
                    }, {
                        system: SYSTEM_PROMPT,
                        maxTokens: 1024,
                        temperature: 0.7,
                    });
                } else {
                    console.log('[MorningBriefing] Bedrock unavailable, using Ollama');
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
                            options: { temperature: 0.7 },
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
                            } catch (e) { /* skip */ }
                        }
                    }
                }

                // Cache the result
                writeCache({
                    cachedAt: new Date().toISOString(),
                    sources,
                    briefing: fullText,
                });

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
