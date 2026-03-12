import { NextResponse } from 'next/server';
import { chatWithData } from '@/services/ai';

export const runtime = 'nodejs';

export async function POST(req) {
    try {
        const body = await req.json();
        const { message, history, stream: useStream, pageContext } = body;

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

    // If pageContext is set, use page-specific data fetching
    if (pageContext && pageContext !== 'default') {
        return streamPageChat(query, history, pageContext, encoder);
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
        } catch (e) {
            console.error('Keyword search failed:', e.message);
        }

        // Step 3: Calendar search — OPT-IN only when query explicitly asks about meetings/schedule
        const calendarTriggers = /\b(meeting|meetings|calendar|schedule|when\s+is|agenda|attendees?|invite|1:1|1-on-1|prep\s+for|prepare\s+for|debrief|prebrief|interview)\b/i;
        if (calendarTriggers.test(query)) {
            try {
                const fs = await import('fs');
                const path = await import('path');
                const calPath = path.default.join(process.cwd(), 'data', 'calendar.json');
                if (fs.default.existsSync(calPath)) {
                    const raw = JSON.parse(fs.default.readFileSync(calPath, 'utf8'));
                    const events = raw.data || [];
                    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
                    
                    const calHits = events.filter(e => {
                        const title = (e.title || '').toLowerCase();
                        return queryWords.some(w => title.includes(w));
                    }).slice(0, 3).map(e => ({
                        id: `cal-${e.id}`,
                        subject: `📅 ${e.title}`,
                        sender: 'Calendar',
                        received: e.startTime,
                        snippet: `Meeting: ${e.title} on ${new Date(e.startTime).toLocaleString()} (${e.location || 'No location'})`,
                        similarity: 0.7,
                        source: 'calendar'
                    }));

                    if (calHits.length > 0) {
                        contextDocs = [...contextDocs, ...calHits];
                        console.log(`[Chat] Calendar search (triggered) added ${calHits.length} meeting results`);
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
