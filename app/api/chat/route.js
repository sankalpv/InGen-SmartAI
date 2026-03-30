import { NextResponse } from 'next/server';
import { chatWithData } from '@/services/ai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const tracker = require('../../../services/usage-tracker');

export const runtime = 'nodejs';

/**
 * Parse natural language date references from a query string.
 * Handles: "March 23", "23rd March", "March 23rd", "3/23", "tomorrow", "today",
 * "next Monday", "this Friday", "day after tomorrow", etc.
 * Returns a Date object (date only, no time) or null if no date found.
 */
function parseDateFromQuery(query) {
    const now = new Date();
    const q = query.toLowerCase();

    // "today"
    if (/\btoday\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // "tomorrow"
    if (/\btomorrow\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // "day after tomorrow"
    if (/\bday after tomorrow\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    // "yesterday"
    if (/\byesterday\b/.test(q)) return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    // "next Monday", "this Friday", etc.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayMatch = q.match(/\b(?:next|this|coming)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayMatch) {
        const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase());
        const currentDay = now.getDay();
        let daysAhead = targetDay - currentDay;
        if (daysAhead <= 0) daysAhead += 7; // always go forward
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
    }

    // Just a day name without "next"/"this" — assume nearest future occurrence
    const bareDayMatch = q.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (bareDayMatch) {
        const targetDay = dayNames.indexOf(bareDayMatch[1].toLowerCase());
        const currentDay = now.getDay();
        let daysAhead = targetDay - currentDay;
        if (daysAhead <= 0) daysAhead += 7;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
    }

    // Month name + day: "March 23", "March 23rd", "23 March", "23rd March", "23rd of March"
    const months = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
    const monthNames = Object.keys(months).join('|');

    // "March 23" or "March 23rd"
    const monthFirstMatch = q.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
    if (monthFirstMatch) {
        const month = months[monthFirstMatch[1].toLowerCase()];
        const day = parseInt(monthFirstMatch[2], 10);
        const year = now.getFullYear();
        return new Date(year, month, day);
    }

    // "23 March" or "23rd March" or "23rd of March"
    const dayFirstMatch = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\b`, 'i'));
    if (dayFirstMatch) {
        const day = parseInt(dayFirstMatch[1], 10);
        const month = months[dayFirstMatch[2].toLowerCase()];
        const year = now.getFullYear();
        return new Date(year, month, day);
    }

    // Numeric: "3/23", "03/23", "3/23/2026"
    const numericMatch = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (numericMatch) {
        const month = parseInt(numericMatch[1], 10) - 1;
        const day = parseInt(numericMatch[2], 10);
        const year = numericMatch[3] ? (numericMatch[3].length === 2 ? 2000 + parseInt(numericMatch[3]) : parseInt(numericMatch[3])) : now.getFullYear();
        return new Date(year, month, day);
    }

    return null;
}

/**
 * Detect the intent/domain of a query regardless of which page the user is on.
 * Returns an array of detected intents (can be multiple for cross-domain queries).
 * Possible values: 'ticket-health', 'eng-metrics', 'my-team', 'team-pulse', 'calendar', 'email'
 */
function detectQueryIntent(query) {
    const q = query.toLowerCase();
    const intents = [];

    // Ticket health patterns
    if (/\b(ticket|tickets|sla|aging\s+ticket|resolver\s+group|sev\s*\d|severity|tt\b|trouble\s+ticket|open\s+ticket|ticket\s+health|baseline)/i.test(q)) {
        intents.push('ticket-health');
    }

    // Eng metrics patterns  
    if (/\b(code\s+review|cr\b|crs?\b|review\s+ratio|engineering\s+metric|eng\s+metric|commits?|code\s+velocity|declining\s+streak|crs?\s+created|crs?\s+reviewed)/i.test(q)) {
        intents.push('eng-metrics');
    }

    // My team / goals patterns
    if (/\b(goal|goals|ecd|red\s+goal|green\s+goal|yellow\s+goal|path\s+to\s+green|missed\s+ecd|goal\s+status|wbr|quad\b|deliverable|milestone)/i.test(q)) {
        intents.push('my-team');
    }

    // Team pulse / issues patterns
    if (/\b(issue|issues|team\s+pulse|sla\s+violation|alarm|who\s+is\s+working|team\s+activity|owner|assignee|taskei|sim\b)/i.test(q)) {
        intents.push('team-pulse');
    }

    // Calendar patterns
    if (/\b(meeting|meetings|calendar|schedule|when\s+is|agenda|attendees?|invite|1:1|1-on-1|prep\s+for|prepare\s+for|debrief|prebrief|interview)\b/i.test(q)) {
        intents.push('calendar');
    }

    // Email patterns (explicit detection, not just fallback)
    if (/\b(email|emails|inbox|mail|sent\s+me|received|from\s+\w+|wrote|message)\b/i.test(q)) {
        intents.push('email');
    }

    // Default to email if no specific intent detected
    if (intents.length === 0) {
        intents.push('email');
    }

    return intents;
}

export async function POST(req) {
    try {
        const body = await req.json();
        const { message, history, stream: useStream, pageContext } = body;

        tracker.trackAPICall('/api/chat');
        tracker.trackAIGeneration('ChatResponse');

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Phase 3: Streaming mode — ChatGPT-style word-by-word
        if (useStream) {
            return streamChat(message, history || [], pageContext);
        }

        // Standard mode (backwards compatible)
        const result = await chatWithData(message, history || []);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

async function streamChat(query, history, pageContext) {
    const encoder = new TextEncoder();

    // Smart cross-page routing: detect what the user is actually asking about
    const intents = detectQueryIntent(query);
    const pageSpecificIntents = intents.filter(i => ['ticket-health', 'eng-metrics', 'my-team', 'team-pulse'].includes(i));

    // If user is on a page with context, check if query matches that page or a different one
    if (pageContext && pageContext !== 'default') {
        // Email or calendar intent → bypass page context, use general email/calendar search below
        const hasEmailOrCalendarIntent = intents.some(i => i === 'email' || i === 'calendar');
        if (hasEmailOrCalendarIntent && pageSpecificIntents.length === 0) {
            console.log(`[Chat] Cross-page routing: user on "${pageContext}" but asking about "${intents[0]}" — falling through to general search`);
            // Fall through to general email/calendar search below
        }
        // Query matches a DIFFERENT page than where the user is — re-route
        else if (pageSpecificIntents.length > 0 && !pageSpecificIntents.includes(pageContext)) {
            console.log(`[Chat] Cross-page routing: user on "${pageContext}" but asking about "${pageSpecificIntents[0]}" — re-routing`);
            return streamPageChat(query, history, pageSpecificIntents[0], encoder);
        }
        // Query matches current page or is ambiguous — use current page's data
        else {
            return streamPageChat(query, history, pageContext, encoder);
        }
    }

    // No page context (dashboard) — check if query is about a specific page's data
    if (pageSpecificIntents.length > 0) {
        console.log(`[Chat] Dashboard smart-routing: query about "${pageSpecificIntents[0]}" — fetching page data`);
        return streamPageChat(query, history, pageSpecificIntents[0], encoder);
    }

    // Detect broad queries that need full email context (not just RAG top-5)
    const broadPatterns = /\b(summarize|summary|overview|all\s+emails?|what happened|catch me up|brief me|inbox|today'?s?\s+emails?|this week|recent\s+emails?|what did i miss|what'?s new|update me|digest|recap|round.?up)\b/i;
    const isBroadQuery = broadPatterns.test(query);

    let contextDocs = [];
    if (isBroadQuery) {
        // Broad query: pull full email cache for comprehensive summary
        try {
            const fs = await import('fs');
            const path = await import('path');
            const emailsPath = path.default.join(process.cwd(), 'data', 'emails.json');
            if (fs.default.existsSync(emailsPath)) {
                const raw = JSON.parse(fs.default.readFileSync(emailsPath, 'utf8'));
                const emails = (raw.data || []).filter(e => !e.isSent && e.folder !== 'Sent Items');
                // Include all recent inbox emails as context (subjects + senders + dates + snippets)
                contextDocs = emails.slice(0, 100).map(e => ({
                    id: e.id,
                    subject: e.subject || '(No Subject)',
                    sender: e.from?.name || e.from?.email || 'Unknown',
                    received: e.date,
                    snippet: (e.snippet || e.body || '').substring(0, 200),
                    similarity: 1.0,
                    source: 'full-cache'
                }));
                console.log(`[Chat] Broad query detected: "${query}" — using full cache (${contextDocs.length} emails)`);
            }
        } catch (e) {
            console.error('Full cache load failed, falling back to RAG:', e.message);
        }
    }

    // Targeted query: use RAG vector search + keyword fallback + calendar
    if (contextDocs.length === 0) {
        // Step 1: RAG vector search (semantic similarity)
        try {
            const { default: vectorStore } = await import('@/services/vector-store.js');
            contextDocs = await vectorStore.search(query, 5);
            console.log(`[Chat] RAG returned ${contextDocs.length} results`);
        } catch (e) {
            console.error('Chat vector search failed:', e);
        }

        // Step 2: Keyword search on full email cache (catches names, exact terms RAG misses)
        try {
            const fs = await import('fs');
            const path = await import('path');
            const emailsPath = path.default.join(process.cwd(), 'data', 'emails.json');
            if (fs.default.existsSync(emailsPath)) {
                const raw = JSON.parse(fs.default.readFileSync(emailsPath, 'utf8'));
                const allEmails = (raw.data || []).filter(e => !e.isSent && e.folder !== 'Sent Items');
                
                // Extract keywords (words > 3 chars, skip stop words)
                const stopWords = new Set(['what', 'about', 'with', 'from', 'that', 'this', 'have', 'been', 'they', 'their', 'does', 'said', 'tell', 'when', 'where', 'which', 'there', 'would', 'could', 'should', 'into', 'some', 'than', 'then', 'very', 'just', 'only', 'also', 'been', 'being', 'will', 'each', 'make', 'like', 'many', 'most', 'over', 'such', 'take', 'long', 'come', 'made']);
                const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
                
                if (queryWords.length > 0) {
                    const keywordHits = allEmails.filter(e => {
                        const text = `${e.subject || ''} ${e.from?.name || ''} ${e.snippet || ''}`.toLowerCase();
                        // Use word boundary matching — "interview" should NOT match "interviewers"
                        // But allow partial match for names (raghuvarun) and technical terms
                        return queryWords.some(w => {
                            // Try exact word boundary first
                            const wordBoundary = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                            if (wordBoundary.test(text)) return true;
                            // For longer words (likely names), allow substring match
                            if (w.length >= 6 && text.includes(w)) return true;
                            return false;
                        });
                    }).map(e => {
                        // Calculate match quality: how many query words matched?
                        const text = `${e.subject || ''} ${e.from?.name || ''} ${e.snippet || ''}`.toLowerCase();
                        const matchCount = queryWords.filter(w => text.includes(w)).length;
                        const matchRatio = matchCount / queryWords.length;
                        return {
                            id: e.id,
                            subject: e.subject || '(No Subject)',
                            sender: e.from?.name || e.from?.email || 'Unknown',
                            received: e.date,
                            snippet: (e.snippet || e.body || '').substring(0, 300),
                            similarity: parseFloat((0.3 + matchRatio * 0.5).toFixed(2)), // 0.3-0.8 based on match quality
                            source: 'keyword-search'
                        };
                    }).sort((a, b) => b.similarity - a.similarity).slice(0, 10);

                    // Merge: dedup by subject, keyword hits first for name/term queries
                    const existingSubjects = new Set(contextDocs.map(d => (d.subject || '').toLowerCase()));
                    const newHits = keywordHits.filter(h => !existingSubjects.has((h.subject || '').toLowerCase()));
                    contextDocs = [...contextDocs, ...newHits].slice(0, 10);
                    if (newHits.length > 0) console.log(`[Chat] Keyword search added ${newHits.length} results`);
                }
            }

            // Also search local store (data/emails.json) for fresh emails not yet in vector store
            try {
                const emailsFile = path.default.join(process.cwd(), 'data', 'emails.json');
                if (fs.default.existsSync(emailsFile)) {
                    const cached = JSON.parse(fs.default.readFileSync(emailsFile, 'utf8'));
                    const localEmails = cached.data || [];
                    if (localEmails.length > 0) {
                        const queryLower = query.toLowerCase();
                        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
                        // For "latest" queries, sort by date and take most recent
                        const isLatestQuery = /latest|recent|newest|last|today/i.test(query);
                        let localHits;
                        if (isLatestQuery) {
                            localHits = [...localEmails]
                                .sort((a, b) => new Date(b.received || b.date || 0) - new Date(a.received || a.date || 0))
                                .slice(0, 5);
                        } else {
                            localHits = localEmails.filter(e => {
                                const text = `${e.subject || ''} ${e.from || ''} ${e.snippet || ''}`.toLowerCase();
                                return queryWords.some(w => text.includes(w));
                            }).slice(0, 5);
                        }
                        const existingSubjects = new Set(contextDocs.map(d => (d.subject || '').toLowerCase()));
                        const freshHits = localHits
                            .filter(h => !existingSubjects.has((h.subject || '').toLowerCase()))
                            .map(e => ({ ...e, source: 'local-store' }));
                        if (freshHits.length > 0) {
                            contextDocs = [...freshHits, ...contextDocs].slice(0, 12);
                            console.log(`[Chat] Local store added ${freshHits.length} fresh emails`);
                        }
                    }
                }
            } catch (e) {
                console.warn('[Chat] Local store search failed:', e.message);
            }
        } catch (e) {
            console.error('Keyword search failed:', e.message);
        }

        // Step 3: Calendar search — OPT-IN only when query explicitly asks about meetings/schedule
        const calendarTriggers = /\b(meeting|meetings|calendar|schedule|when\s+is|agenda|attendees?|invite|1:1|1-on-1|prep\s+for|prepare\s+for|debrief|prebrief|interview|busiest|free\s+time|free\s+slot|availability|busy|block|my\s+week|this\s+week|next\s+week|today['']?s?\s+(schedule|meeting)|tomorrow['']?s?\s+(schedule|meeting)|day\s+this\s+week)\b/i;
        if (calendarTriggers.test(query)) {
            try {
                // Fetch live from MCP so the AI always sees current calendar data
                const outlookMcp = require('../../../services/outlook-mcp');
                // lookbackDays=1 (include today), forwardDays=14
                let events = [];
                try {
                    events = await outlookMcp.fetchOutlookCalendar(null, 1, 14);
                    console.log(`[Chat] Live MCP calendar: ${events.length} events`);
                    // Also write-through so other consumers stay fresh
                    const localStore = require('../../../services/local-store');
                    if (events.length > 0) localStore.saveCalendar(events);
                } catch (mcpErr) {
                    console.warn('[Chat] MCP calendar fetch failed, falling back to file:', mcpErr.message);
                    const fs = await import('fs');
                    const path = await import('path');
                    const calPath = path.default.join(process.cwd(), 'data', 'calendar.json');
                    if (fs.default.existsSync(calPath)) {
                        const raw = JSON.parse(fs.default.readFileSync(calPath, 'utf8'));
                        events = raw.data || [];
                    }
                }
                if (events.length > 0) {

                    // --- Date-aware calendar search ---
                    // Parse natural language dates from the query
                    const targetDate = parseDateFromQuery(query);
                    let calHits = [];

                    if (targetDate) {
                        // Date-based search: return ALL events on that date
                        const targetStr = targetDate.toISOString().slice(0, 10); // "2026-03-23"
                        calHits = events.filter(e => {
                            if (!e.startTime) return false;
                            const eventDate = e.startTime.slice(0, 10);
                            return eventDate === targetStr;
                        }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                        .map(e => ({
                            id: `cal-${e.id}`,
                            subject: `📅 ${e.title}`,
                            sender: 'Calendar',
                            received: e.startTime,
                            snippet: `Meeting: ${e.title} on ${new Date(e.startTime).toLocaleString()} – ${new Date(e.endTime).toLocaleTimeString()} (${e.location || 'No location'})${e.attendees?.length ? ` · ${e.attendees.length} attendees` : ''}`,
                            similarity: 0.95,
                            source: 'calendar'
                        }));
                        console.log(`[Chat] Calendar date search for ${targetStr}: found ${calHits.length} events`);
                    }

                    // Title-based search (for "when is my 1:1 with Fardeen" type queries)
                    if (calHits.length === 0) {
                        const calStopWords = new Set(['what', 'about', 'with', 'from', 'that', 'this', 'have', 'been', 'they', 'their', 'does', 'said', 'tell', 'when', 'where', 'which', 'there', 'would', 'could', 'should', 'into', 'some', 'than', 'then', 'very', 'just', 'only', 'also', 'been', 'being', 'will', 'each', 'make', 'like', 'many', 'most', 'over', 'such', 'take', 'long', 'come', 'made', 'meeting', 'meetings', 'calendar', 'schedule', 'agenda', 'march', 'april', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'today', 'tomorrow', 'next', 'week']);
                        const calQueryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !calStopWords.has(w));

                        if (calQueryWords.length > 0) {
                            calHits = events.filter(e => {
                                const title = (e.title || '').toLowerCase();
                                return calQueryWords.some(w => title.includes(w));
                            }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
                            .slice(0, 5)
                            .map(e => ({
                                id: `cal-${e.id}`,
                                subject: `📅 ${e.title}`,
                                sender: 'Calendar',
                                received: e.startTime,
                                snippet: `Meeting: ${e.title} on ${new Date(e.startTime).toLocaleString()} (${e.location || 'No location'})`,
                                similarity: 0.7,
                                source: 'calendar'
                            }));
                        }
                    }

                    if (calHits.length > 0) {
                        contextDocs = [...contextDocs, ...calHits];
                        console.log(`[Chat] Calendar search added ${calHits.length} meeting results`);
                    }

                    // For "busiest day / free time / my week" queries include ALL events this week
                    const weekOverviewTrigger = /\b(busiest|free\s+time|availability|my\s+week|this\s+week|next\s+week|free\s+slot|busy|day\s+this\s+week)\b/i;
                    if (weekOverviewTrigger.test(query) && calHits.length === 0) {
                        const now = new Date();
                        const weekEnd = new Date(now);
                        weekEnd.setDate(weekEnd.getDate() + 7);
                        const weekEvents = events.filter(e => {
                            if (!e.startTime) return false;
                            const d = new Date(e.startTime);
                            return d >= now && d <= weekEnd;
                        }).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
                        if (weekEvents.length > 0) {
                            contextDocs = [...contextDocs, ...weekEvents.map(e => ({
                                id: `cal-${e.id}`,
                                subject: `📅 ${e.title}`,
                                sender: 'Calendar',
                                received: e.startTime,
                                snippet: `${e.title} — ${new Date(e.startTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(e.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${e.location ? ` (${e.location})` : ''}`,
                                similarity: 0.9,
                                source: 'calendar'
                            }))];
                            console.log(`[Chat] Week overview: injected ${weekEvents.length} events`);
                        }
                    }
                }
            } catch (e) {
                console.error('Calendar search failed:', e.message);
            }
        }
    }

    const stream = new ReadableStream({
        async start(controller) {
            try {
                // Send sources first (include snippet + date for expandable detail panel)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'sources',
                    sources: contextDocs.map(doc => ({
                        id: doc.id,
                        subject: doc.subject,
                        from: doc.sender || doc.from?.name || doc.from,
                        similarity: doc.similarity || 0,
                        received: doc.received || doc.date,
                        snippet: (doc.snippet || '').substring(0, 200),
                        source: doc.source || 'rag'
                    }))
                })}\n\n`));

                // Stream the AI response
                const { streamChatResponse } = await import('@/services/ai-stream');

                await streamChatResponse(query, contextDocs, history, (chunk) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`));
                });

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
            } catch (error) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`));
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

/**
 * Stream a page-context-aware chat response.
 * Fetches data from the appropriate service based on pageContext.
 */
async function streamPageChat(query, history, pageContext, encoder) {
    const stream = new ReadableStream({
        async start(controller) {
            try {
                let contextData = {};

                const baseUrl = process.env.NEXTAUTH_URL || `http://localhost:${process.env.PORT || 3000}`;

                // Fetch page-specific data via internal API routes
                if (pageContext === 'eng-metrics') {
                    try {
                        const currentYear = new Date().getFullYear();
                        const [dashRes, trendRes, yearRes] = await Promise.all([
                            fetch(`${baseUrl}/api/eng-metrics?view=dashboard`),
                            fetch(`${baseUrl}/api/eng-metrics?view=trend&weeks=8`),
                            fetch(`${baseUrl}/api/eng-metrics?view=org-year-trend&year=${currentYear}`),
                        ]);

                        const dashJson = dashRes.ok ? await dashRes.json() : {};
                        const trendJson = trendRes.ok ? await trendRes.json() : {};
                        const yearJson = yearRes.ok ? await yearRes.json() : {};

                        const dashboard = dashJson.data;
                        const weeklyTrend = trendJson.data || [];
                        const yearTrend = (yearJson.data || []).filter(w => w.hasData);

                        contextData = {
                            type: 'eng-metrics',
                            weekId: dashboard?.weekId,
                            totalEngineers: dashboard?.totalEngineers,
                            summary: dashboard?.summary || {},
                            engineers: (dashboard?.engineers || []).map(e => ({
                                name: e.name, alias: e.alias, team: e.team,
                                crsCreated: e.crsCreated, crsReviewed: e.crsReviewed,
                                reviewRatio: e.reviewRatioDisplay, decliningStreak: e.decliningStreak,
                                crsCreatedDelta: e.crsCreatedDelta, crsReviewedDelta: e.crsReviewedDelta,
                            })),
                            weeklyTrend: weeklyTrend.map(w => ({
                                week: w.weekLabel, crsCreated: w.crsCreated, crsReviewed: w.crsReviewed,
                            })),
                            yearTrend: yearTrend.slice(-12).map(w => ({
                                week: w.weekLabel, crsCreated: w.crsCreated, crsReviewed: w.crsReviewed,
                            })),
                        };
                    } catch (e) {
                        console.error('Failed to fetch eng-metrics for chat:', e.message);
                    }
                } else if (pageContext === 'ticket-health') {
                    try {
                        const res = await fetch(`${baseUrl}/api/ticket-health?view=dashboard`);
                        if (res.ok) {
                            const json = await res.json();
                            const dashboard = json.data;
                            contextData = {
                                type: 'ticket-health',
                                summary: dashboard?.summary || {},
                                groups: (dashboard?.groups || []).map(g => ({
                                    name: g.name, role: g.role, open: g.open,
                                    resolved30d: g.resolved30d, oldestAge: g.oldestAge,
                                    statusBreakdown: g.statusBreakdown, baselineStatus: g.baselineStatus,
                                })),
                                agingTickets: (dashboard?.agingTickets || []).slice(0, 20).map(t => ({
                                    id: t.id, title: t.title, status: t.status, age: t.age,
                                    group: t.group, assignee: t.assignee,
                                })),
                                myTickets: (dashboard?.myTickets || []).map(t => ({
                                    id: t.id, title: t.title, status: t.status, age: t.age,
                                    group: t.group,
                                })),
                            };
                        }
                    } catch (e) {
                        console.error('Failed to fetch ticket-health for chat:', e.message);
                    }
                } else if (pageContext === 'my-team') {
                    try {
                        const res = await fetch(`${baseUrl}/api/team?view=wbr`);
                        if (res.ok) {
                            const json = await res.json();
                            const report = json.data;
                            // Include ALL goals from all sections
                            const allGoals = [];
                            for (const section of (report?.sections || [])) {
                                for (const goal of (section.goals || [])) {
                                    allGoals.push({
                                        id: goal.id, title: goal.title,
                                        statusColor: goal.statusColor, ecd: goal.ecd,
                                        goalType: goal.goalType, theme: goal.theme,
                                        subtaskCount: goal.subtasks?.length || 0,
                                        quad: goal.quad,
                                        pathToGreen: goal.pathToGreen || null,
                                    });
                                }
                            }
                            contextData = {
                                type: 'my-team',
                                title: report?.title,
                                totalGoals: report?.totalGoals,
                                summary: report?.summary || {},
                                statusSections: (report?.sections || []).map(s => ({
                                    name: s.name, count: s.count,
                                })),
                                allGoals,
                                missedEcd: report?.summary?.missedEcd || [],
                                ecdSoon: report?.summary?.ecdSoon || [],
                                ecdChanges: report?.summary?.ecdChanges || null,
                            };
                        }
                    } catch (e) {
                        console.error('Failed to fetch my-team WBR data for chat:', e.message);
                    }
                } else if (pageContext === 'team-pulse') {
                    try {
                        const [statsRes, ownersRes, openRes, slaRes, agingRes] = await Promise.all([
                            fetch(`${baseUrl}/api/issues?view=stats&days=7`),
                            fetch(`${baseUrl}/api/issues?view=owners&days=7&resolveNames=true`),
                            fetch(`${baseUrl}/api/issues?view=open&days=7`),
                            fetch(`${baseUrl}/api/issues?view=sla&days=7`),
                            fetch(`${baseUrl}/api/issues?view=aging&minDays=7`),
                        ]);
                        const statsData = statsRes.ok ? await statsRes.json() : {};
                        const ownersData = ownersRes.ok ? await ownersRes.json() : {};
                        const openData = openRes.ok ? await openRes.json() : {};
                        const slaData = slaRes.ok ? await slaRes.json() : {};
                        const agingData = agingRes.ok ? await agingRes.json() : {};

                        // Build per-person summary with resolved names
                        const combined = ownersData.data?.combined || [];
                        const names = ownersData.data?.names || {};
                        const owners = ownersData.data?.owners || [];

                        contextData = {
                            type: 'team-pulse',
                            stats: statsData.data || {},
                            teamMembers: combined.filter(p => p.person !== 'system' && p.person !== 'unknown').slice(0, 30).map(p => ({
                                alias: p.person,
                                name: names[p.person] || p.person,
                                ownedIssues: p.ownedIssueCount || 0,
                                contributedIssues: p.actedOnIssueCount || 0,
                                totalActivity: p.activityCount || 0,
                                lastActive: p.lastActiveAt,
                            })),
                            issueOwners: owners.slice(0, 20).map(o => ({
                                owner: o.owner,
                                name: names[o.owner] || o.owner,
                                totalOwned: o.totalOwned,
                                taskeiCount: o.taskeiCount,
                                simCount: o.simCount,
                                alarmCount: o.alarmCount,
                            })),
                            openIssues: (openData.data || []).slice(0, 20).map(i => ({
                                title: i.title, status: i.status, impact: i.impact,
                                ageDays: i.ageDays, assignee: i.assigneeAlias, type: i.type,
                            })),
                            slaViolations: (slaData.data || []).slice(0, 10).map(s => ({
                                title: s.title, resolverGroup: s.resolverGroup, eventType: s.eventType,
                            })),
                            agingIssues: (agingData.data || []).slice(0, 10).map(a => ({
                                title: a.title, ageDays: a.ageDays, assignee: a.assigneeAlias,
                            })),
                        };
                    } catch (e) {
                        console.error('Failed to fetch team-pulse data for chat:', e.message);
                    }
                }

                // Send empty sources (page data doesn't have email-style sources)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'sources',
                    sources: []
                })}\n\n`));

                // Stream the AI response with page context
                const { streamPageChatResponse } = await import('@/services/ai-stream');

                await streamPageChatResponse(query, pageContext, contextData, history, (chunk) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`));
                });

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
            } catch (error) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`));
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
