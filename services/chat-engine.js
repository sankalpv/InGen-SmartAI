/**
 * Chat Engine — shared query processing for both HTTP API and Slack DM agent
 * 
 * Extracted from app/api/chat/route.js so both the web UI and the Slack agent
 * can use the same RAG + keyword + calendar + page-data orchestration.
 * 
 * CommonJS module (used by background services)
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('ChatEngine');
const ollamaClient = require('./ollama-client');
const promptLoader = require('./prompt-loader');

// ──────────────────────────────────────────────────────────
// Intent Detection & Date Parsing (extracted from chat/route.js)
// ──────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

function parseDateFromQuery(query) {
    const now = new Date();
    const q = query.toLowerCase();

    if (/\btoday\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (/\btomorrow\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (/\bday after tomorrow\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
    if (/\byesterday\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    const dayMatch = q.match(/\b(?:next|this|coming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayMatch) {
        const targetDay = DAY_NAMES.indexOf(dayMatch[1].toLowerCase());
        let daysAhead = targetDay - now.getDay();
        if (daysAhead <= 0) daysAhead += 7;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
    }

    const bareDayMatch = q.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (bareDayMatch) {
        const targetDay = DAY_NAMES.indexOf(bareDayMatch[1].toLowerCase());
        let daysAhead = targetDay - now.getDay();
        if (daysAhead <= 0) daysAhead += 7;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
    }

    const monthNames = Object.keys(MONTHS).join('|');
    const monthFirstMatch = q.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
    if (monthFirstMatch) {
        return new Date(now.getFullYear(), MONTHS[monthFirstMatch[1].toLowerCase()], parseInt(monthFirstMatch[2]));
    }

    const dayFirstMatch = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\b`, 'i'));
    if (dayFirstMatch) {
        return new Date(now.getFullYear(), MONTHS[dayFirstMatch[2].toLowerCase()], parseInt(dayFirstMatch[1]));
    }

    const numericMatch = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (numericMatch) {
        const month = parseInt(numericMatch[1]) - 1;
        const day = parseInt(numericMatch[2]);
        const year = numericMatch[3] ? (numericMatch[3].length === 2 ? 2000 + parseInt(numericMatch[3]) : parseInt(numericMatch[3])) : now.getFullYear();
        return new Date(year, month, day);
    }

    return null;
}

function detectQueryIntent(query) {
    const q = query.toLowerCase();
    const intents = [];

    if (/\b(ticket|tickets|sla|aging\s+ticket|resolver\s+group|sev\s*\d|severity|tt\b|trouble\s+ticket|open\s+ticket|ticket\s+health|baseline)/i.test(q)) intents.push('ticket-health');
    if (/\b(code\s+review|cr\b|crs?\b|review\s+ratio|engineering\s+metric|eng\s+metric|commits?|code\s+velocity|declining\s+streak|crs?\s+created|crs?\s+reviewed)/i.test(q)) intents.push('eng-metrics');
    if (/\b(goal|goals|ecd|red\s+goal|green\s+goal|yellow\s+goal|path\s+to\s+green|missed\s+ecd|goal\s+status|wbr|quad\b|deliverable|milestone)/i.test(q)) intents.push('my-team');
    if (/\b(issue|issues|team\s+pulse|sla\s+violation|alarm|who\s+is\s+working|team\s+activity|owner|assignee|taskei|sim\b)/i.test(q)) intents.push('team-pulse');
    if (/\b(meeting|meetings|calendar|schedule|when\s+is|agenda|attendees?|invite|1:1|1-on-1|prep\s+for|prepare\s+for|debrief|prebrief|interview)\b/i.test(q)) intents.push('calendar');
    if (/\b(email|emails|inbox|mail|sent\s+me|received|from\s+\w+|wrote|message)\b/i.test(q)) intents.push('email');

    if (intents.length === 0) intents.push('email');
    return intents;
}

// ──────────────────────────────────────────────────────────
// Context Gathering (RAG + keyword + calendar + page data)
// ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set(['what', 'about', 'with', 'from', 'that', 'this', 'have', 'been', 'they', 'their', 'does', 'said', 'tell', 'when', 'where', 'which', 'there', 'would', 'could', 'should', 'into', 'some', 'than', 'then', 'very', 'just', 'only', 'also', 'been', 'being', 'will', 'each', 'make', 'like', 'many', 'most', 'over', 'such', 'take', 'long', 'come', 'made']);

/**
 * Search emails via RAG vector store
 */
async function ragSearch(query, k = 5) {
    try {
        const vectorStore = require('./vector-store');
        const results = await vectorStore.search(query, k);
        logger.info(`RAG returned ${results.length} results`);
        return results;
    } catch (e) {
        logger.error('RAG search failed:', e.message);
        return [];
    }
}

/**
 * Keyword search on email cache
 */
function keywordSearch(query, allEmails) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
    if (queryWords.length === 0) return [];

    return allEmails.filter(e => {
        const text = `${e.subject || ''} ${e.from?.name || e.from || ''} ${e.snippet || ''}`.toLowerCase();
        return queryWords.some(w => {
            const wordBoundary = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (wordBoundary.test(text)) return true;
            if (w.length >= 6 && text.includes(w)) return true;
            return false;
        });
    }).map(e => {
        const text = `${e.subject || ''} ${e.from?.name || ''} ${e.snippet || ''}`.toLowerCase();
        const matchCount = queryWords.filter(w => text.includes(w)).length;
        return {
            id: e.id, subject: e.subject || '(No Subject)',
            sender: e.from?.name || e.from?.email || e.from || 'Unknown',
            received: e.date || e.received,
            snippet: (e.snippet || e.body || '').substring(0, 300),
            similarity: parseFloat((0.3 + (matchCount / queryWords.length) * 0.5).toFixed(2)),
            source: 'keyword-search',
        };
    }).sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}

/**
 * Calendar search from local cache
 */
function calendarSearch(query) {
    try {
        const calPath = path.join(process.cwd(), 'data', 'calendar.json');
        if (!fs.existsSync(calPath)) return [];
        const raw = JSON.parse(fs.readFileSync(calPath, 'utf8'));
        const events = raw.data || [];

        const targetDate = parseDateFromQuery(query);
        if (targetDate) {
            const targetStr = targetDate.toISOString().slice(0, 10);
            return events.filter(e => e.startTime && e.startTime.slice(0, 10) === targetStr)
                .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                .map(e => ({
                    id: `cal-${e.id}`, subject: `📅 ${e.title}`, sender: 'Calendar',
                    received: e.startTime,
                    snippet: `Meeting: ${e.title} on ${new Date(e.startTime).toLocaleString()} – ${new Date(e.endTime).toLocaleTimeString()} (${e.location || 'No location'})${e.attendees?.length ? ` · ${e.attendees.length} attendees` : ''}`,
                    similarity: 0.95, source: 'calendar',
                }));
        }

        // Title-based search
        const calStopWords = new Set([...STOP_WORDS, 'meeting', 'meetings', 'calendar', 'schedule', 'agenda', 'march', 'april', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'today', 'tomorrow', 'next', 'week']);
        const calQueryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !calStopWords.has(w));
        if (calQueryWords.length === 0) return [];

        return events.filter(e => {
            const title = (e.title || '').toLowerCase();
            return calQueryWords.some(w => title.includes(w));
        }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime)).slice(0, 5)
            .map(e => ({
                id: `cal-${e.id}`, subject: `📅 ${e.title}`, sender: 'Calendar',
                received: e.startTime,
                snippet: `Meeting: ${e.title} on ${new Date(e.startTime).toLocaleString()} (${e.location || 'No location'})`,
                similarity: 0.7, source: 'calendar',
            }));
    } catch (e) {
        logger.error('Calendar search failed:', e.message);
        return [];
    }
}

/**
 * Load all emails from local cache
 */
function loadEmailCache() {
    try {
        const emailsPath = path.join(process.cwd(), 'data', 'emails.json');
        if (!fs.existsSync(emailsPath)) return [];
        const raw = JSON.parse(fs.readFileSync(emailsPath, 'utf8'));
        return (raw.data || []).filter(e => !e.isSent && e.folder !== 'Sent Items');
    } catch (e) { return []; }
}

/**
 * Fetch page-specific context data by calling internal APIs
 */
async function fetchPageContext(pageContext) {
    const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`;
    let contextData = {};

    try {
        if (pageContext === 'ticket-health') {
            const res = await fetch(`${baseUrl}/api/ticket-health?view=dashboard`);
            if (res.ok) {
                const json = await res.json();
                const d = json.data;
                contextData = {
                    type: 'ticket-health', summary: d?.summary || {},
                    groups: (d?.groups || []).map(g => ({ name: g.name, role: g.role, open: g.open, resolved30d: g.resolved30d, oldestAge: g.oldestAge, statusBreakdown: g.statusBreakdown, baselineStatus: g.baselineStatus })),
                    agingTickets: (d?.agingTickets || []).slice(0, 20).map(t => ({ id: t.id, title: t.title, status: t.status, age: t.age, group: t.group, assignee: t.assignee })),
                    myTickets: (d?.myTickets || []).map(t => ({ id: t.id, title: t.title, status: t.status, age: t.age, group: t.group })),
                };
            }
        } else if (pageContext === 'eng-metrics') {
            const currentYear = new Date().getFullYear();
            const [dashRes, trendRes] = await Promise.all([
                fetch(`${baseUrl}/api/eng-metrics?view=dashboard`),
                fetch(`${baseUrl}/api/eng-metrics?view=trend&weeks=8`),
            ]);
            const dashJson = dashRes.ok ? await dashRes.json() : {};
            const trendJson = trendRes.ok ? await trendRes.json() : {};
            const dashboard = dashJson.data;
            contextData = {
                type: 'eng-metrics', weekId: dashboard?.weekId, totalEngineers: dashboard?.totalEngineers,
                summary: dashboard?.summary || {},
                engineers: (dashboard?.engineers || []).map(e => ({ name: e.name, alias: e.alias, crsCreated: e.crsCreated, crsReviewed: e.crsReviewed, reviewRatio: e.reviewRatioDisplay, decliningStreak: e.decliningStreak })),
                weeklyTrend: (trendJson.data || []).map(w => ({ week: w.weekLabel, crsCreated: w.crsCreated, crsReviewed: w.crsReviewed })),
            };
        } else if (pageContext === 'my-team') {
            const res = await fetch(`${baseUrl}/api/team?view=wbr`);
            if (res.ok) {
                const json = await res.json();
                const report = json.data;
                const allGoals = [];
                for (const section of (report?.sections || [])) {
                    for (const goal of (section.goals || [])) {
                        allGoals.push({ id: goal.id, title: goal.title, statusColor: goal.statusColor, ecd: goal.ecd, goalType: goal.goalType, theme: goal.theme, subtaskCount: goal.subtasks?.length || 0, quad: goal.quad, pathToGreen: goal.pathToGreen || null });
                    }
                }
                contextData = {
                    type: 'my-team', title: report?.title, totalGoals: report?.totalGoals,
                    summary: report?.summary || {},
                    statusSections: (report?.sections || []).map(s => ({ name: s.name, count: s.count })),
                    allGoals, missedEcd: report?.summary?.missedEcd || [], ecdSoon: report?.summary?.ecdSoon || [],
                };
            }
        } else if (pageContext === 'team-pulse') {
            const [statsRes, ownersRes, openRes] = await Promise.all([
                fetch(`${baseUrl}/api/issues?view=stats&days=7`),
                fetch(`${baseUrl}/api/issues?view=owners&days=7&resolveNames=true`),
                fetch(`${baseUrl}/api/issues?view=open&days=7`),
            ]);
            const statsData = statsRes.ok ? await statsRes.json() : {};
            const ownersData = ownersRes.ok ? await ownersRes.json() : {};
            const openData = openRes.ok ? await openRes.json() : {};
            const combined = ownersData.data?.combined || [];
            const names = ownersData.data?.names || {};
            contextData = {
                type: 'team-pulse', stats: statsData.data || {},
                teamMembers: combined.filter(p => p.person !== 'system' && p.person !== 'unknown').slice(0, 30).map(p => ({ alias: p.person, name: names[p.person] || p.person, ownedIssues: p.ownedIssueCount || 0, totalActivity: p.activityCount || 0 })),
                openIssues: (openData.data || []).slice(0, 20).map(i => ({ title: i.title, status: i.status, impact: i.impact, ageDays: i.ageDays, assignee: i.assigneeAlias, type: i.type })),
            };
        }
    } catch (e) {
        logger.error(`Failed to fetch ${pageContext} context:`, e.message);
    }

    return contextData;
}

// ──────────────────────────────────────────────────────────
// Main Query Processing — the "brain"
// ──────────────────────────────────────────────────────────

const PAGE_SYSTEM_PROMPTS = {
    'eng-metrics': 'You are a *Code Metrics Analyst*. Answer questions about CR activity, engineering velocity, and per-engineer trends using the provided data. Be data-driven, cite specific numbers.',
    'ticket-health': 'You are a *Ticket Health Analyst*. Answer questions about open tickets, aging, SLA, resolver groups, and assignments. Be specific about ticket IDs, ages, and groups.',
    'my-team': 'You are a *Goals & Team Health Analyst*. Answer questions about goals (Green/Yellow/Red), ECDs, blocked items, and team progress. Include goal IDs and status colors.',
    'team-pulse': 'You are a *Team Pulse Analyst*. Answer questions about team workload, member activity, issue ownership, and SLA health. Be thoughtful about people insights.',
};

/**
 * Process a user query and return a text response (non-streaming).
 * This is the main entry point for the Slack DM agent.
 * 
 * @param {string} query - The user's question
 * @param {Array} history - Conversation history [{ role, content }]
 * @returns {string} The AI-generated response
 */
async function processQuery(query, history = []) {
    const intents = detectQueryIntent(query);
    const pageIntents = intents.filter(i => ['ticket-health', 'eng-metrics', 'my-team', 'team-pulse'].includes(i));

    // ─── Page-specific query ───
    if (pageIntents.length > 0) {
        const pageContext = pageIntents[0];
        logger.info(`Processing page-specific query: ${pageContext}`);
        const contextData = await fetchPageContext(pageContext);
        
        const systemPrompt = PAGE_SYSTEM_PROMPTS[pageContext] || 'You are InGen, an AI assistant.';
        const historyStr = history.slice(-4).map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');
        
        const prompt = `${systemPrompt}

PAGE DATA (live from ${pageContext} dashboard):
${JSON.stringify(contextData, null, 2)}

CONVERSATION:
${historyStr}

QUESTION: ${query}

Be specific, cite numbers/IDs, use markdown. Be concise.`;

        // Try Bedrock first, fall back to Ollama
        try {
            const bedrockClient = require('./bedrock-client');
            if (bedrockClient.isAvailable()) {
                return await bedrockClient.generate(prompt, { maxTokens: 4096 });
            }
        } catch (e) { /* fall through */ }

        return await ollamaClient.generate(prompt, { maxTokens: 2000 });
    }

    // ─── General query (email/calendar/RAG) ───
    logger.info(`Processing general query: "${query.substring(0, 80)}"`);
    
    let contextDocs = [];
    const allEmails = loadEmailCache();

    // Broad query detection
    const isBroad = /\b(summarize|summary|overview|all\s+emails?|what happened|catch me up|brief me|inbox|today'?s?\s+emails?|this week|recent\s+emails?|what did i miss|update me|digest|recap)\b/i.test(query);
    
    if (isBroad) {
        contextDocs = allEmails.slice(0, 50).map(e => ({
            id: e.id, subject: e.subject || '(No Subject)', sender: e.from?.name || e.from || 'Unknown',
            received: e.date, snippet: (e.snippet || e.body || '').substring(0, 200),
            similarity: 1.0, source: 'full-cache',
        }));
    } else {
        // RAG + keyword + calendar hybrid
        contextDocs = await ragSearch(query, 5);
        const kwHits = keywordSearch(query, allEmails);
        const existingSubjects = new Set(contextDocs.map(d => (d.subject || '').toLowerCase()));
        const newKw = kwHits.filter(h => !existingSubjects.has((h.subject || '').toLowerCase()));
        contextDocs = [...contextDocs, ...newKw].slice(0, 10);

        // Calendar (only for meeting-related queries)
        if (intents.includes('calendar')) {
            const calHits = calendarSearch(query);
            if (calHits.length > 0) contextDocs = [...contextDocs, ...calHits];
        }
    }

    // Build prompt
    const system = `${promptLoader.get('system') || "You are InGen — an elite AI executive assistant."}\nAnswer using ONLY the provided context. Be direct, specific, cite sources. If data isn't available, say so.`;

    const contextStr = contextDocs.map((doc, i) => `[Source ${i + 1}] ${doc.source || 'Email'} | From: ${doc.sender || 'Unknown'} | Date: ${doc.received || 'Unknown'} | Subject: ${doc.subject || ''}\n${doc.snippet || ''}`).join('\n---\n');
    const historyStr = history.slice(-4).map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');

    const prompt = `CONTEXT:\n${contextStr || 'No relevant data found.'}\n\nCONVERSATION:\n${historyStr}\n\nQUESTION: ${query}\n\nBe concise and conversational. Cite [Source N] when referencing data.`;

    try {
        const bedrockClient = require('./bedrock-client');
        if (bedrockClient.isAvailable()) {
            return await bedrockClient.generate(`${system}\n\n${prompt}`, { maxTokens: 4096 });
        }
    } catch (e) { /* fall through */ }

    return await ollamaClient.generate(prompt, { system, maxTokens: 2000 });
}

module.exports = {
    processQuery,
    detectQueryIntent,
    parseDateFromQuery,
    ragSearch,
    keywordSearch,
    calendarSearch,
    fetchPageContext,
    loadEmailCache,
};
