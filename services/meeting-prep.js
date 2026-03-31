/**
 * Meeting Prep Service
 *
 * Detects meetings starting in 13-17 minutes, gathers context from:
 *   - Emails (subject keyword + organizer match, last 7 days)
 *   - Meeting summary emails (whitelisted senders)
 *   - Slack search (live via slack-mcp)
 *   - Quip docs linked in Slack/email bodies
 *   - Local ticket/issues store
 *
 * Generates a spoken AI brief and sends to the user's Slack self-DM.
 * State is persisted in data/meeting-prep-state.json to prevent double-firing.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('MeetingPrep');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'meeting-prep-state.json');

// ─── Constants ───

const PREP_WINDOW_EARLY_MS = 13 * 60 * 1000; // 13 min before
const PREP_WINDOW_LATE_MS  = 17 * 60 * 1000; // 17 min before

// Meeting titles to skip (personal/blocked time)
const SKIP_TITLE_PATTERNS = /\b(focus time|lunch|ooo|out of office|hold|block|commute|personal|1:1 prep|no meeting)\b/i;

// Email senders that are high-value meeting context (not FYI noise)
const MEETING_SUMMARY_SENDERS = [
    'meetex', 'amazon meetings', 'no-reply@mail.ses.pdxprod.aims',
    'zoom.us', 'teams.microsoft.com', 'calendar-notification',
];

const INGEN_PREFIX = '🤖 <https://code.amazon.com/packages/InGen-SmartAI/trees/mainline|InGen>:';

// ─── State helpers ───

function loadState() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) { /* ignore */ }
    return { briefedToday: {} };
}

function saveState(state) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) { /* ignore */ }
}

function markBriefed(eventId) {
    const state = loadState();
    const today = new Date().toDateString();
    // Prune old entries (keep only today)
    state.briefedToday = Object.fromEntries(
        Object.entries(state.briefedToday || {}).filter(([, v]) => v.date === today)
    );
    state.briefedToday[eventId] = { date: today, at: new Date().toISOString() };
    saveState(state);
}

function wasAlreadyBriefed(eventId) {
    const state = loadState();
    const today = new Date().toDateString();
    return state.briefedToday?.[eventId]?.date === today;
}

// ─── Meeting filtering ───

function shouldSkip(event) {
    const title = (event.title || event.subject || '').trim();
    if (!title) return true;
    if (event.isAllDay) return true;
    if (event.isCanceled) return true;
    if (SKIP_TITLE_PATTERNS.test(title)) return true;

    // Skip if ≤1 attendee (solo blocks or meetings you created alone)
    // Count attendees: use the attendees array + organizer if different
    const attendees = event.attendees || [];
    const organizer = event.organizer?.email || event.organizer?.name || '';
    // We can't always trust the attendee list (Outlook MCP often returns [])
    // So we only skip if attendees is explicitly populated AND has ≤1
    if (attendees.length > 0 && attendees.length <= 1) return true;

    return false;
}

/**
 * Get all meetings from local store starting today.
 */
function getTodayMeetings() {
    const localStore = require('./local-store');
    const cal = localStore.getCalendar ? localStore.getCalendar() : { data: null };
    const all = cal?.data || [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000);

    return all
        .filter(e => {
            const d = new Date(e.startTime || e.start?.dateTime || e.date || '');
            return !isNaN(d) && d >= startOfDay && d < endOfDay;
        })
        .filter(e => !shouldSkip(e))
        .sort((a, b) => {
            const da = new Date(a.startTime || a.start?.dateTime || 0);
            const db = new Date(b.startTime || b.start?.dateTime || 0);
            return da - db;
        });
}

/**
 * Find meetings that start in 13-17 minutes from now.
 */
function getMeetingsDueSoon() {
    const now = Date.now();
    return getTodayMeetings().filter(e => {
        const start = new Date(e.startTime || e.start?.dateTime || '').getTime();
        const diff = start - now;
        return diff >= PREP_WINDOW_EARLY_MS && diff <= PREP_WINDOW_LATE_MS;
    });
}

// ─── Context gathering ───

/**
 * Extract keywords from a meeting title for searching.
 * Strips common noise words, returns top 2-3 meaningful terms.
 */
function extractKeywords(title) {
    const stopWords = new Set([
        'meeting', 'sync', 'call', 'discussion', 'review', 'update',
        'the', 'and', 'for', 'with', 'on', 'in', 'at', 'to', 'of',
        'a', 'an', 'is', 'are', 'was', 'were', '&', '-', '#',
    ]);
    const words = title.replace(/[^a-zA-Z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));
    return [...new Set(words)].slice(0, 4);
}

/**
 * Gather relevant emails for a meeting.
 * Matches on: meeting title keywords, organizer name.
 * Whitelists meeting summary emails.
 */
function gatherEmails(event) {
    try {
        const localStore = require('./local-store');
        const allEmails = (localStore.getEmails ? localStore.getEmails() : { data: [] }).data || [];
        const keywords = extractKeywords(event.title || event.subject || '');
        const organizerName = (event.organizer?.name || '').toLowerCase();
        const organizerEmail = (event.organizer?.email || '').toLowerCase();
        const attendeeEmails = (event.attendees || []).map(a =>
            (typeof a === 'string' ? a : a?.email || a?.name || '').toLowerCase()
        ).filter(Boolean);

        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

        const scored = allEmails
            .filter(e => {
                const d = new Date(e.date || e.received || 0).getTime();
                return d > cutoff;
            })
            .map(e => {
                const subject = (e.subject || '').toLowerCase();
                const body = (e.body || e.snippet || '').toLowerCase().slice(0, 500);
                const fromStr = typeof e.from === 'string' ? e.from.toLowerCase()
                    : `${e.from?.name || ''} ${e.from?.email || ''}`.toLowerCase();
                const combined = `${subject} ${body} ${fromStr}`;

                let score = 0;

                // Whitelist: meeting summary emails get high score
                const isSummary = MEETING_SUMMARY_SENDERS.some(s => fromStr.includes(s));
                if (isSummary) {
                    const matches = keywords.filter(k => combined.includes(k.toLowerCase()));
                    if (matches.length > 0) score += 10;
                }

                // Keyword matches in subject (higher weight)
                keywords.forEach(k => {
                    if (subject.includes(k.toLowerCase())) score += 3;
                    else if (combined.includes(k.toLowerCase())) score += 1;
                });

                // Organizer match
                if (organizerName && fromStr.includes(organizerName)) score += 2;
                if (organizerEmail && fromStr.includes(organizerEmail)) score += 2;

                // Attendee match
                attendeeEmails.forEach(a => {
                    if (fromStr.includes(a)) score += 2;
                });

                return { email: e, score };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return new Date(b.email.date || 0) - new Date(a.email.date || 0);
            })
            .slice(0, 6)
            .map(({ email }) => ({
                subject: email.subject,
                from: typeof email.from === 'string' ? email.from.split('<')[0].trim()
                    : (email.from?.name || email.from?.email || 'Unknown'),
                date: email.date,
                snippet: (email.snippet || email.body || '').slice(0, 200).replace(/\s+/g, ' ').trim(),
                isSummary: MEETING_SUMMARY_SENDERS.some(s =>
                    (typeof email.from === 'string' ? email.from : email.from?.email || '').toLowerCase().includes(s)
                ),
            }));

        return scored;
    } catch (e) {
        logger.warn('gatherEmails failed:', e.message);
        return [];
    }
}

/**
 * Search Slack for recent messages related to the meeting topic.
 * Returns top 5 relevant messages.
 */
async function gatherSlackMessages(event) {
    try {
        const mcpClient = require('./mcp-client');
        const keywords = extractKeywords(event.title || event.subject || '');
        if (keywords.length === 0) return [];

        // Build search query from top keywords
        const query = keywords.slice(0, 3).map(k => `"${k}"`).join(' OR ');

        function parseResult(result) {
            try {
                const text = result?.content?.[0]?.text || '';
                return typeof text === 'string' ? JSON.parse(text) : text;
            } catch { return {}; }
        }

        const result = await mcpClient.callTool('slack-mcp', 'search', {
            query,
            scope: 'messages',
            count: 10,
            sort: 'timestamp',
            sort_dir: 'desc',
        });

        const data = parseResult(result);
        const matches = data?.messages?.matches || [];

        // Filter out InGen's own bot messages and very old messages
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return matches
            .filter(m => {
                if (m.username === 'sankalpv' && (m.text || '').includes('code.amazon.com/packages/InGen-SmartAI')) return false;
                const ts = parseFloat(m.ts || 0) * 1000;
                return ts > cutoff;
            })
            .slice(0, 5)
            .map(m => ({
                channel: m.channel?.name || m.channel?.id || 'DM',
                user: m.username || m.user,
                text: (m.text || '').slice(0, 400).replace(/\s+/g, ' ').trim(),
                ts: m.ts,
                permalink: m.permalink,
                threadParent: m.threadParent?.text ? m.threadParent.text.slice(0, 200) : null,
            }));
    } catch (e) {
        logger.warn('gatherSlackMessages failed:', e.message);
        return [];
    }
}

/**
 * Extract quip-amazon.com URLs from text and fetch their content.
 */
async function fetchLinkedQuipDocs(emailSnippets, slackMessages) {
    try {
        const quipPattern = /https?:\/\/quip-amazon\.com\/([A-Za-z0-9]+)/g;
        const seenIds = new Set();
        const urls = [];

        const allText = [
            ...emailSnippets.map(e => `${e.subject} ${e.snippet}`),
            ...slackMessages.map(s => s.text),
        ].join('\n');

        let match;
        while ((match = quipPattern.exec(allText)) !== null) {
            const docId = match[1];
            if (!seenIds.has(docId)) {
                seenIds.add(docId);
                urls.push(`https://quip-amazon.com/${docId}`);
            }
        }

        if (urls.length === 0) return [];

        const ReadInternalWebsites = require('./mcp-client');
        const results = [];

        for (const url of urls.slice(0, 3)) {
            try {
                // Use a timeout to avoid blocking
                const fetchPromise = new Promise(async (resolve) => {
                    try {
                        const r = await ReadInternalWebsites.callTool('builder-mcp', 'read_internal_websites', { inputs: [url] });
                        const text = r?.content?.[0]?.text || '';
                        if (text && !text.includes('error') && text.length > 100) {
                            resolve({ url, content: text.slice(0, 600).replace(/\s+/g, ' ').trim() });
                        } else {
                            resolve(null);
                        }
                    } catch (e) { resolve(null); }
                });
                const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3000));
                const result = await Promise.race([fetchPromise, timeoutPromise]);
                if (result) results.push(result);
            } catch (e) { /* skip */ }
        }

        return results;
    } catch (e) {
        logger.warn('fetchLinkedQuipDocs failed:', e.message);
        return [];
    }
}

/**
 * Get relevant open tickets for the meeting.
 */
function gatherTickets(event) {
    try {
        const localStore = require('./local-store');
        if (!localStore.getIssues) return [];
        const issues = (localStore.getIssues() || []).filter(i => i.status !== 'Closed');
        const keywords = extractKeywords(event.title || event.subject || '');
        if (keywords.length === 0) return [];

        return issues
            .filter(i => {
                const text = `${i.title || ''} ${i.description || ''}`.toLowerCase();
                return keywords.some(k => text.includes(k.toLowerCase()));
            })
            .slice(0, 4)
            .map(i => ({
                id: i.id,
                title: (i.title || '').slice(0, 80),
                status: i.status,
                assignee: i.assignee,
            }));
    } catch (e) {
        logger.warn('gatherTickets failed:', e.message);
        return [];
    }
}

// ─── AI brief generation ───

const SYSTEM_PROMPT = `You are InGen — a sharp executive assistant preparing a manager for a meeting.
Your job is to synthesize email threads, Slack discussions, and ticket context into a crisp meeting prep brief.

RULES:
1. Lead with the most important thing: unresolved decisions, open asks, risks, or context the manager needs.
2. Cite specific names, dates, ticket IDs, and CR numbers when available.
3. Be direct and concise — 4-7 sentences max. This will be read right before walking into the meeting.
4. Never just list the data — synthesize it into what actually matters.
5. End with one concrete "walk in ready to..." sentence.
6. NO markdown, NO bullet points, NO headers. Pure flowing prose for Slack delivery.`;

async function generateBrief(event, context) {
    const { emails, slackMessages, quipDocs, tickets } = context;
    const title = event.title || event.subject || 'Untitled Meeting';
    const startTime = new Date(event.startTime || event.start?.dateTime || '');
    const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const organizer = event.organizer?.name || 'Unknown organizer';
    const attendeeList = (event.attendees || [])
        .map(a => a?.name || a?.email || a)
        .filter(Boolean).slice(0, 5).join(', ') || `Organized by ${organizer}`;

    let dataBlock = `MEETING: "${title}" at ${timeStr}\nATTENDEES: ${attendeeList}\nORGANIZER: ${organizer}\n\n`;

    if (emails.length > 0) {
        dataBlock += `RECENT EMAILS (last 7 days):\n`;
        emails.forEach(e => {
            const tag = e.isSummary ? '[MEETING NOTES]' : '[EMAIL]';
            dataBlock += `${tag} From ${e.from}: "${e.subject}" — ${e.snippet}\n`;
        });
        dataBlock += '\n';
    }

    if (slackMessages.length > 0) {
        dataBlock += `SLACK DISCUSSIONS:\n`;
        slackMessages.forEach(m => {
            const ch = m.channel !== m.user ? `#${m.channel}` : 'DM';
            dataBlock += `[${ch}] @${m.user}: ${m.text}\n`;
            if (m.threadParent) dataBlock += `  (In reply to: "${m.threadParent}")\n`;
        });
        dataBlock += '\n';
    }

    if (quipDocs.length > 0) {
        dataBlock += `LINKED DOCS:\n`;
        quipDocs.forEach(d => {
            dataBlock += `[QUIP] ${d.url}: ${d.content}\n`;
        });
        dataBlock += '\n';
    }

    if (tickets.length > 0) {
        dataBlock += `OPEN TICKETS:\n`;
        tickets.forEach(t => {
            dataBlock += `[${t.id}] ${t.title} (${t.status}${t.assignee ? `, assigned: ${t.assignee}` : ', unassigned'})\n`;
        });
    }

    const userPrompt = `Prepare me for this meeting:\n\n${dataBlock}`;

    try {
        const bedrockClient = require('./bedrock-client');
        let brief = '';

        if (bedrockClient.isAvailable()) {
            await bedrockClient.streamGenerate(userPrompt, (chunk) => { brief += chunk; }, {
                system: SYSTEM_PROMPT,
                maxTokens: 600,
                temperature: 0.6,
            });
        } else {
            const ollamaClient = require('./ollama-client');
            const response = await fetch('http://127.0.0.1:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: ollamaClient.getConfig().llmModel,
                    system: SYSTEM_PROMPT,
                    prompt: userPrompt,
                    stream: false,
                    think: false,
                    options: { temperature: 0.6 },
                }),
            });
            const json = await response.json();
            brief = json.response || '';
        }

        return brief.trim();
    } catch (e) {
        logger.error('generateBrief LLM failed:', e.message);
        throw e;
    }
}

// ─── Slack delivery ───

async function sendToSlack(event, brief, context) {
    const fs2 = require('fs');
    const path2 = require('path');
    try {
        const settingsPath = path2.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs2.readFileSync(settingsPath, 'utf8'));
        if (!settings.phonetoolAlias || !settings.mcpServers?.['slack-mcp']) {
            logger.info('Slack not configured, skipping delivery');
            return false;
        }

        const slack = require('./slack');
        const title = event.title || event.subject || 'Meeting';
        const startTime = new Date(event.startTime || event.start?.dateTime || '');
        const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const minsUntil = Math.round((startTime.getTime() - Date.now()) / 60000);
        const attendeeCount = (event.attendees || []).length;
        const attendeeStr = attendeeCount > 0
            ? (event.attendees || []).map(a => a?.name?.split(',')[0] || a?.email || a).slice(0, 4).join(', ')
            : `Organized by ${event.organizer?.name || 'unknown'}`;

        // Format the Slack message
        const header = `📋 *Meeting Prep: "${title}"* — in ${minsUntil} min (${timeStr})\n👥 ${attendeeStr}`;
        const divider = '─'.repeat(40);
        const body = convertToSlackMrkdwn(brief);

        let footer = '';
        if (context.slackMessages.length > 0) {
            const channels = [...new Set(context.slackMessages.map(m => m.channel).filter(c => c && !c.match(/^[DU]/)))];
            if (channels.length > 0) footer = `\n_Sources: ${channels.map(c => `#${c}`).join(', ')}_`;
        }

        const fullMessage = `${INGEN_PREFIX}\n${header}\n${divider}\n${body}${footer}`;

        // Get self-DM channel
        const alias = settings.phonetoolAlias;
        const dmInfo = await slack.getMyDMs(1);
        await slack.postBlockMessage(dmInfo.channelId, fullMessage);

        logger.info(`Meeting prep sent to Slack for: ${title}`);
        return true;
    } catch (e) {
        logger.error('sendToSlack failed:', e.message);
        return false;
    }
}

function convertToSlackMrkdwn(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/`(.+?)`/g, '`$1`')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');
}

// ─── Main exported functions ───

/**
 * Called by background-agent every minute.
 * Finds meetings due in 13-17 min, generates + sends brief for each.
 */
async function checkAndSend() {
    try {
        const meetings = getMeetingsDueSoon();
        for (const event of meetings) {
            const eventId = event.id || `${event.title}_${event.startTime}`;
            if (wasAlreadyBriefed(eventId)) continue;

            logger.info(`Preparing brief for: ${event.title || event.subject}`);
            try {
                const context = await gatherContext(event);
                const brief = await generateBrief(event, context);
                await sendToSlack(event, brief, context);
                markBriefed(eventId);
            } catch (e) {
                logger.error(`Failed to prep for ${event.title}: ${e.message}`);
            }
        }
    } catch (e) {
        logger.error('checkAndSend failed:', e.message);
    }
}

/**
 * Gather all context for a meeting (emails, Slack, Quip, tickets).
 */
async function gatherContext(event) {
    const emails = gatherEmails(event);
    const tickets = gatherTickets(event);

    // Run Slack search and Quip fetch with timeouts
    let slackMessages = [];
    let quipDocs = [];

    try {
        slackMessages = await Promise.race([
            gatherSlackMessages(event),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
    } catch (e) {
        logger.warn('Slack search timed out or failed');
    }

    try {
        quipDocs = await Promise.race([
            fetchLinkedQuipDocs(emails, slackMessages),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
        ]);
    } catch (e) {
        logger.warn('Quip doc fetch timed out or failed');
    }

    return { emails, slackMessages, quipDocs, tickets };
}

/**
 * Preview prep for a specific meeting (used by API route for testing).
 * @param {object} options - { title, date, eventId, preview }
 * @returns {{ event, context, brief }}
 */
async function prepMeeting(options = {}) {
    const { title, date, eventId, ignoreWindow = true } = options;

    let meetings = getTodayMeetings();

    // If date specified, load that day's meetings
    if (date) {
        const localStore = require('./local-store');
        const cal = localStore.getCalendar ? localStore.getCalendar() : { data: null };
        const all = cal?.data || [];
        const targetDate = new Date(date);
        meetings = all
            .filter(e => {
                const d = new Date(e.startTime || e.start?.dateTime || '');
                return d.toDateString() === targetDate.toDateString();
            })
            .filter(e => !shouldSkip(e));
    }

    // Filter by title if provided
    if (title) {
        meetings = meetings.filter(e =>
            (e.title || e.subject || '').toLowerCase().includes(title.toLowerCase())
        );
    }

    // Filter by eventId if provided
    if (eventId) {
        meetings = meetings.filter(e => e.id === eventId);
    }

    if (meetings.length === 0) {
        throw new Error(`No matching meeting found${title ? ` for "${title}"` : ''}${date ? ` on ${date}` : ''}`);
    }

    const event = meetings[0];
    const context = await gatherContext(event);
    const brief = await generateBrief(event, context);
    return { event, context, brief };
}

module.exports = {
    checkAndSend,
    prepMeeting,
    getTodayMeetings,
    gatherContext,
    generateBrief,
    shouldSkip,
};
