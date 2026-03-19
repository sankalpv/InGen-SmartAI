/**
 * InGen Agent Tool Registry — Phase 1
 * 
 * Central registry for all tools the agent can invoke.
 * Each tool has: name, description, icon, execute(params) → { data, summary }
 * 
 * Tools wrap existing InGen services (calendar, emails, people, goals, tickets, etc.)
 */

const logger = require('./logger').child('ToolRegistry');

// ─── Tool Definitions ───

const tools = new Map();

/**
 * Register a tool in the registry.
 * @param {Object} tool - { name, description, icon, parameters, execute }
 */
function register(tool) {
    if (!tool.name || !tool.execute) {
        throw new Error(`Tool registration failed: missing name or execute. Got: ${JSON.stringify(tool)}`);
    }
    tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
}

/**
 * Get a tool by name.
 */
function get(name) {
    return tools.get(name);
}

/**
 * List all registered tools (for LLM tool-use prompt).
 */
function listAll() {
    return Array.from(tools.values()).map(t => ({
        name: t.name,
        description: t.description,
        icon: t.icon,
        parameters: t.parameters || {},
    }));
}

/**
 * Execute a tool by name with given params.
 */
async function execute(name, params = {}) {
    const tool = tools.get(name);
    if (!tool) {
        throw new Error(`Tool not found: ${name}`);
    }
    const start = Date.now();
    try {
        const result = await tool.execute(params);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        logger.info(`Tool "${name}" completed in ${elapsed}s`);
        return { ...result, _elapsed: elapsed };
    } catch (err) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        logger.error(`Tool "${name}" failed after ${elapsed}s:`, err.message);
        return { data: null, summary: `Error: ${err.message}`, _elapsed: elapsed, _error: true };
    }
}

// ─── Built-in Tools ───

// 1. Calendar Search
register({
    name: 'calendar_search',
    description: 'Search upcoming calendar events by keyword. Returns matching meetings with attendees, time, and location.',
    icon: '📅',
    parameters: {
        query: { type: 'string', description: 'Search keyword (meeting title, attendee name, etc.)' },
        days: { type: 'number', description: 'Number of days ahead to search (default: 7)' },
    },
    async execute({ query, days = 7 }) {
        const fs = require('fs');
        const path = require('path');
        const calPath = path.join(process.cwd(), 'data', 'calendar.json');

        if (!fs.existsSync(calPath)) {
            return { data: [], summary: 'No calendar data available. Run sync first.' };
        }

        const raw = JSON.parse(fs.readFileSync(calPath, 'utf8'));
        const events = raw.data || [];
        const now = new Date();
        const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        const queryLower = (query || '').toLowerCase().trim();

        // Split query into keywords for OR matching
        const keywords = queryLower.split(/\s+/).filter(w => w.length > 1);

        // Detect day-of-week names in query (monday=1, ..., sunday=0)
        const DAY_NAMES = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        const dayFilters = keywords.filter(w => DAY_NAMES[w] !== undefined).map(w => DAY_NAMES[w]);
        const contentKeywords = keywords.filter(w => DAY_NAMES[w] === undefined);

        // Also detect relative day references
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        if (keywords.includes('tomorrow')) {
            // No day filter needed, just narrow the date window
        }

        const matches = events.filter(e => {
            const start = new Date(e.startTime || e.start?.dateTime);
            if (isNaN(start.getTime()) || start < now || start > cutoff) return false;

            // Day-of-week filter: if user said "friday", only show Friday events
            if (dayFilters.length > 0 && !dayFilters.includes(start.getDay())) return false;

            // If only day names were in the query (e.g., just "friday"), match all events on that day
            if (contentKeywords.length === 0) return true;

            // Keyword OR matching: match if ANY content keyword appears in title/attendees/description
            const searchText = `${e.title || ''} ${(e.attendees || []).map(a => a.name || a.email || '').join(' ')} ${e.description || ''}`.toLowerCase();
            return contentKeywords.some(kw => searchText.includes(kw));
        }).slice(0, 10);

        const summary = matches.length === 0
            ? `No calendar events found matching "${query}".`
            : `Found ${matches.length} event(s) matching "${query}".`;

        return {
            data: matches.map(e => ({
                title: e.title,
                start: e.startTime || e.start?.dateTime,
                end: e.endTime || e.end?.dateTime,
                location: e.location || 'No location',
                attendees: (e.attendees || []).map(a => a.name || a.email || 'Unknown'),
                description: (e.description || '').substring(0, 300),
            })),
            summary,
            count: matches.length,
        };
    },
});

// 2. Email Search (hybrid: RAG + keyword, centralized via email-search.js)
register({
    name: 'email_search',
    description: 'Search recent emails by keyword, sender name, or subject. Uses semantic RAG search + keyword matching for best results. Returns matching email threads with sender, subject, date, and snippet.',
    icon: '📧',
    parameters: {
        query: { type: 'string', description: 'Search keyword (subject, sender, content)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
    },
    async execute({ query, limit = 10 }) {
        const emailSearch = require('./email-search');
        try {
            const results = await emailSearch.hybridSearch(query, limit);
            const summary = results.length === 0
                ? `No emails found matching "${query}".`
                : `Found ${results.length} email(s) matching "${query}" (RAG + keyword hybrid).`;
            return { data: results, summary, count: results.length };
        } catch (e) {
            return { data: [], summary: `Email search failed: ${e.message}`, count: 0 };
        }
    },
});

// 3. People Lookup (4-tier: org.db → email senders → phonetool MCP → calendar)
register({
    name: 'people_lookup',
    description: 'Look up people by name or alias. Searches org database, email senders, Phonetool (MCP), and calendar attendees. Returns name, team, email, and role.',
    icon: '👤',
    parameters: {
        query: { type: 'string', description: 'Person name or alias to search' },
    },
    async execute({ query }) {
        const fs = require('fs');
        const path = require('path');
        const queryLower = (query || '').toLowerCase().trim();
        const keywords = queryLower.split(/\s+/).filter(w => w.length > 1);
        let results = [];
        let sources = [];

        // Tier 1: org.db SQLite (38+ org members, instant)
        try {
            const dbPath = path.join(process.cwd(), 'data', 'org.db');
            if (fs.existsSync(dbPath)) {
                const sqlite3 = require('sqlite3').verbose();
                const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);
                const rows = await new Promise((resolve, reject) => {
                    const likePatterns = keywords.map(kw => `%${kw}%`);
                    const whereClauses = likePatterns.map(() => `(LOWER(name) LIKE ? OR LOWER(alias) LIKE ? OR LOWER(team) LIKE ?)`);
                    const sql = `SELECT alias, name, email, team, managerAlias, isManager, depth FROM org_members WHERE ${whereClauses.join(' OR ')} LIMIT 10`;
                    const params = likePatterns.flatMap(p => [p, p, p]);
                    db.all(sql, params, (err, rows) => {
                        db.close();
                        if (err) reject(err); else resolve(rows || []);
                    });
                });
                if (rows.length > 0) {
                    results = rows.map(r => ({
                        name: r.name,
                        alias: r.alias,
                        email: r.email || `${r.alias}@amazon.com`,
                        team: r.team || '',
                        isManager: !!r.isManager,
                        managerAlias: r.managerAlias || '',
                        source: 'org-database',
                    }));
                    sources.push('org.db');
                }
            }
        } catch (e) {
            logger.warn('Org DB lookup failed:', e.message);
        }

        // Tier 2: Email sender search (find people from email threads)
        if (results.length === 0) {
            try {
                const emailSearch = require('./email-search');
                const senders = emailSearch.searchSenders(query);
                if (senders.length > 0) {
                    results = senders.map(s => ({
                        name: s.name,
                        alias: s.alias,
                        email: s.email,
                        team: '',
                        lastEmailSubject: s.lastSubject,
                        lastEmailDate: s.lastDate,
                        source: 'email-sender',
                    }));
                    sources.push('email-senders');
                }
            } catch (e) {
                logger.warn('Email sender search failed:', e.message);
            }
        }

        // Tier 3: Phonetool MCP (live lookup by alias)
        if (results.length === 0 && queryLower.match(/^[a-z]+$/)) {
            // Looks like an alias (single word, lowercase letters only)
            try {
                const phonetool = require('./phonetool');
                const name = await phonetool.fetchPersonName(queryLower);
                if (name) {
                    results = [{
                        name,
                        alias: queryLower,
                        email: `${queryLower}@amazon.com`,
                        team: '',
                        source: 'phonetool-mcp',
                    }];
                    sources.push('phonetool');
                }
            } catch (e) {
                logger.warn('Phonetool lookup failed:', e.message);
            }
        }

        // Tier 3b: If we found people from email, try to enrich with Phonetool
        if (results.length > 0 && results[0].source === 'email-sender' && results[0].alias) {
            try {
                const phonetool = require('./phonetool');
                for (let i = 0; i < Math.min(results.length, 3); i++) {
                    const alias = results[i].alias;
                    if (alias && alias.length > 2) {
                        const ptName = phonetool.getCachedName(alias);
                        if (ptName) {
                            results[i].name = ptName;
                            results[i].source = 'email+phonetool';
                        }
                    }
                }
            } catch (e) { /* skip enrichment */ }
        }

        // Tier 4: Calendar attendee search — search by name OR by meeting topic
        if (results.length === 0) {
            try {
                const calPath = path.join(process.cwd(), 'data', 'calendar.json');
                if (fs.existsSync(calPath)) {
                    const raw = JSON.parse(fs.readFileSync(calPath, 'utf8'));
                    const events = raw.data || [];
                    const peopleSet = new Map();

                    // Strategy A: Search attendee names directly
                    for (const e of events) {
                        for (const a of (e.attendees || [])) {
                            const aName = a.name || a.email || '';
                            if (keywords.some(kw => aName.toLowerCase().includes(kw))) {
                                if (!peopleSet.has(aName.toLowerCase())) {
                                    peopleSet.set(aName.toLowerCase(), {
                                        name: a.name || 'Unknown',
                                        email: a.email || '',
                                        alias: (a.email || '').split('@')[0],
                                        source: 'calendar-attendee',
                                    });
                                }
                            }
                        }
                    }

                    // Strategy B: If no person name matched, search by meeting TOPIC
                    // (e.g., "interview" → find the interview meeting → return all attendees)
                    if (peopleSet.size === 0) {
                        const topicMatches = events.filter(e => {
                            const title = (e.title || '').toLowerCase();
                            const desc = (e.description || '').toLowerCase();
                            return keywords.some(kw => title.includes(kw) || desc.includes(kw));
                        }).slice(0, 3); // Top 3 matching meetings

                        for (const e of topicMatches) {
                            for (const a of (e.attendees || [])) {
                                const aName = a.name || a.email || '';
                                if (aName && !peopleSet.has(aName.toLowerCase())) {
                                    peopleSet.set(aName.toLowerCase(), {
                                        name: a.name || 'Unknown',
                                        email: a.email || '',
                                        alias: (a.email || '').split('@')[0],
                                        meetingTitle: e.title,
                                        meetingDate: e.startTime || e.start?.dateTime,
                                        source: 'meeting-attendee',
                                    });
                                }
                            }
                        }
                    }

                    results = Array.from(peopleSet.values()).slice(0, 10);
                    if (results.length > 0) sources.push('calendar');
                }
            } catch (e) {
                logger.warn('Calendar attendee search failed:', e.message);
            }
        }

        const sourceStr = sources.length > 0 ? ` (via ${sources.join(' + ')})` : '';
        const summary = results.length > 0
            ? `Found ${results.length} person(s) matching "${query}"${sourceStr}.`
            : `No people found matching "${query}". Searched: org database, email senders, calendar attendees.`;

        return { data: results, summary, count: results.length };
    },
});

// 4. Goal Status
register({
    name: 'goal_status',
    description: 'Search team goals/OKRs by keyword. Returns goal status (Green/Yellow/Red), ECD, owner, AND all subtasks with their assignees (engineers working on the goal).',
    icon: '🎯',
    parameters: {
        query: { type: 'string', description: 'Goal title, ID, or keyword' },
    },
    async execute({ query }) {
        const fs = require('fs');
        const path = require('path');

        // Try fetching from WBR cache first (has subtasks with assignees), then goals.json
        const wbrCachePath = path.join(process.cwd(), 'brain', 'wbr-cache.json');
        const wbrPath = path.join(process.cwd(), 'data', 'wbr-cache.json');
        const goalsPath = path.join(process.cwd(), 'data', 'goals.json');

        let goals = [];

        for (const p of [wbrCachePath, goalsPath, wbrPath]) {
            if (fs.existsSync(p)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
                    // WBR cache format: { report: { sections: [...] } }
                    const sections = raw.report?.sections || raw.sections;
                    if (sections) {
                        for (const section of sections) {
                            goals.push(...(section.goals || []));
                        }
                    } else if (raw.data) {
                        goals = raw.data;
                    } else if (Array.isArray(raw)) {
                        goals = raw;
                    }
                    if (goals.length > 0) break;
                } catch (e) { /* continue */ }
            }
        }

        if (goals.length === 0) {
            return { data: [], summary: 'No goals data available.', count: 0 };
        }

        const queryLower = (query || '').toLowerCase().replace(/[-_]/g, ' ');
        const matches = goals.filter(g => {
            const text = `${g.title || ''} ${g.id || ''} ${g.theme || ''} ${g.owner || ''} ${g.goalType || ''}`.toLowerCase().replace(/[-_]/g, ' ');
            return !queryLower || text.includes(queryLower);
        }).slice(0, 5);

        return {
            data: await Promise.all(matches.map(async (g) => {
                // Extract subtasks from WBR cache
                let subtasks = (g.subtasks || g.children || []).map(s => ({
                    id: s.id || s.shortId,
                    title: s.title || s.name || '',
                    status: s.status || 'Open',
                    assignee: s.assignee || s.assigneeName || 'unassigned',
                    ecd: s.ecd || 'Not set',
                }));

                // Depth-3 fetch: milestones are "unassigned" — engineer tasks are one level deeper
                // Check cache first (6-day TTL matching WBR cache)
                const DEPTH3_CACHE_PATH = path.join(process.cwd(), 'brain', 'goal-depth3-cache.json');
                const DEPTH3_TTL = 6 * 24 * 60 * 60 * 1000; // 6 days
                let depth3Cache = {};
                try { if (fs.existsSync(DEPTH3_CACHE_PATH)) depth3Cache = JSON.parse(fs.readFileSync(DEPTH3_CACHE_PATH, 'utf8')); } catch (e) { /* fresh */ }

                const cachedGoal = depth3Cache[g.id];
                if (cachedGoal && (Date.now() - cachedGoal.timestamp < DEPTH3_TTL)) {
                    // Use cached depth-3 data
                    subtasks = cachedGoal.subtasks;
                } else {
                    // Live MCP fetch: for each milestone, get ITS subtasks (engineer tasks)
                    const hasAssignees = subtasks.some(s => s.assignee && s.assignee !== 'unassigned');
                    if (!hasAssignees && subtasks.length > 0) {
                        try {
                            const mcpClient = require('./mcp-client');
                            const allEngineerTasks = [];
                            for (let i = 0; i < Math.min(subtasks.length, 20); i++) {
                                try {
                                    const result = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
                                        taskId: subtasks[i].id,
                                        includeCustomAttributes: true,
                                        commentLimit: 2,
                                    });
                                    const text = result.content?.map(c => c.text || '').join('') || '{}';
                                    const taskData = JSON.parse(text);
                                    const task = taskData.task || {};

                                    // Update milestone assignee if available
                                    if (task.assignee?.username) {
                                        subtasks[i].assignee = task.assignee.username;
                                        subtasks[i].assigneeName = task.assignee.name || task.assignee.username;
                                    }

                                    // Depth-3: collect engineer tasks inside this milestone
                                    const children = task.subtasks || [];
                                    for (const child of children) {
                                        const fmtDate = (d) => { if (!d) return 'Missing'; try { const dt = new Date(d); return `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}-${dt.getFullYear()}`; } catch(e) { return 'Missing'; } };
                                        const latestComment = (task.combinedThread?.items || []).filter(ti => ti.payload?.type === 'COMMENT').slice(0, 1).map(ti => ({ message: ti.payload?.comment?.message?.substring(0, 200), author: ti.payload?.comment?.author?.name }));

                                        allEngineerTasks.push({
                                            id: child.shortId || child.id,
                                            title: child.name || '',
                                            status: child.status || 'Open',
                                            assignee: child.assignee?.username || 'unassigned',
                                            assigneeName: child.assignee?.name || '',
                                            ecd: fmtDate(child.estimatedCompletionDate),
                                            description: (child.description || '').substring(0, 300),
                                            blocked: child.blocked || false,
                                            blockedReason: child.blockedReason || null,
                                            priority: child.priority || null,
                                            labels: (child.labels || []).map(l => l.name || l),
                                            parentMilestone: subtasks[i].id,
                                            parentMilestoneTitle: subtasks[i].title,
                                        });
                                    }
                                } catch (e) { /* skip individual milestone fetch failures */ }
                            }

                            // If we found engineer tasks, replace subtasks with them
                            if (allEngineerTasks.length > 0) {
                                subtasks = allEngineerTasks;
                            }

                            // Cache depth-3 results
                            try {
                                depth3Cache[g.id] = { timestamp: Date.now(), subtasks };
                                const brainDir = path.join(process.cwd(), 'brain');
                                if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
                                fs.writeFileSync(DEPTH3_CACHE_PATH, JSON.stringify(depth3Cache, null, 2));
                            } catch (e) { /* cache write failure is non-fatal */ }
                        } catch (e) { /* MCP not available */ }
                    }
                }

                // Collect unique engineers working on this goal
                const engineers = [...new Set(subtasks.map(s => s.assignee).filter(a => a && a !== 'unassigned'))];

                return {
                    id: g.id,
                    title: g.title,
                    status: g.statusColor || g.status || 'Unknown',
                    ecd: g.ecd || 'Not set',
                    owner: g.owner || g.assigneeName || '',
                    theme: g.theme || '',
                    pathToGreen: g.pathToGreen || null,
                    subtaskCount: subtasks.length,
                    subtasks: subtasks.slice(0, 20),
                    engineers,
                    engineerCount: engineers.length,
                };
            })),
            summary: matches.length
                ? matches.map(g => {
                    const subs = g.subtasks || g.children || [];
                    const engineers = [...new Set(subs.map(s => s.assignee || s.assigneeName).filter(Boolean))];
                    return `${g.id} "${(g.title || '').substring(0, 40)}" [${g.statusColor || g.status}] — ${subs.length} tasks, ${engineers.length} engineer(s): ${engineers.join(', ') || 'none assigned'}`;
                }).join('\n')
                : `No goals found matching "${query}".`,
            count: matches.length,
        };
    },
});

// 5. Ticket Search — powered by ticket-health.js (live MCP data from resolver groups)
register({
    name: 'ticket_search',
    description: 'Search tickets/issues across all resolver groups. Uses live ticket-health MCP data. Returns ticket ID, title, status, age, assignee, and group. Includes both open and recently resolved tickets.',
    icon: '🎫',
    parameters: {
        query: { type: 'string', description: 'Search keyword (ticket title, ID, assignee)' },
        status: { type: 'string', description: 'Filter by status: open, resolved, all (default: all)' },
    },
    async execute({ query, status = 'all' }) {
        const ticketHealth = require('./ticket-health');

        try {
            const dashboard = await ticketHealth.buildDashboard();

            if (dashboard.empty) {
                return { data: [], summary: dashboard.message || 'No resolver groups found.', count: 0 };
            }

            const queryLower = (query || '').toLowerCase().trim();
            const keywords = queryLower.split(/\s+/).filter(w => w.length > 1);

            // Collect all tickets (open + aging)
            let allTickets = (dashboard.allTickets || []).map(t => ({
                id: t.id,
                title: t.title,
                status: t.status || 'Open',
                assignee: t.assignee || 'Unassigned',
                age: t.age,
                ageBucket: t.ageBucket,
                group: t.group || '',
                createDate: t.createDate,
                lastUpdatedDate: t.lastUpdatedDate,
                ticketType: 'open',
            }));

            // Status filter
            if (status === 'open') {
                allTickets = allTickets.filter(t => t.ticketType === 'open');
            }

            // Keyword filter
            let matches = allTickets;
            if (keywords.length > 0) {
                matches = allTickets.filter(t => {
                    const text = `${t.title || ''} ${t.id || ''} ${t.assignee || ''} ${t.group || ''} ${t.status || ''}`.toLowerCase();
                    return keywords.some(kw => text.includes(kw));
                });
            }

            // Sort by age descending
            matches.sort((a, b) => (b.age || 0) - (a.age || 0));
            matches = matches.slice(0, 30);

            // Build summary with dashboard stats
            const s = dashboard.summary || {};
            const summaryParts = [
                `${s.totalOpen || 0} open across ${s.totalGroups || 0} groups`,
                `${s.totalResolved30d || 0} resolved last 30d`,
                `${s.aging7d || 0} aging >7d`,
                `${s.aging30d || 0} aging >30d`,
            ];
            const summary = matches.length > 0
                ? `Found ${matches.length} ticket(s)${queryLower ? ` matching "${query}"` : ''}. Dashboard: ${summaryParts.join(', ')}.`
                : `No tickets found${queryLower ? ` matching "${query}"` : ''}. Dashboard: ${summaryParts.join(', ')}.`;

            return {
                data: matches,
                summary,
                count: matches.length,
                dashboardSummary: s,
            };
        } catch (e) {
            logger.error('ticket_search via ticket-health failed:', e.message);
            return { data: [], summary: `Ticket search failed: ${e.message}`, count: 0, _error: true };
        }
    },
});

// 6. RAG / Vector Search (semantic search over all ingested data)
register({
    name: 'knowledge_search',
    description: 'Semantic search across all ingested knowledge (emails, docs, notes). Uses vector embeddings to find contextually relevant information.',
    icon: '🔍',
    parameters: {
        query: { type: 'string', description: 'Natural language query' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
    },
    async execute({ query, limit = 5 }) {
        try {
            const vectorStore = (await import('./vector-store.js')).default;
            const results = await vectorStore.search(query, limit);
            return {
                data: results.map(r => ({
                    subject: r.subject,
                    from: r.sender || r.from?.name || 'Unknown',
                    date: r.received || r.date || '',
                    snippet: (r.snippet || r.body || '').substring(0, 300),
                    similarity: r.similarity,
                    source: r.source || 'email',
                })),
                summary: results.length ? `Found ${results.length} relevant document(s).` : 'No relevant documents found.',
                count: results.length,
            };
        } catch (e) {
            return { data: [], summary: `Vector search unavailable: ${e.message}`, count: 0 };
        }
    },
});

// (Slack search tool removed — no Slack integration currently)

// 8. Goal Wins — Derive insights from tasks closed against goals in the last week (depth 3)
register({
    name: 'goal_wins',
    description: 'Derive weekly wins from tasks closed against goals in the last 7 days. Traverses Goal → Child Tasks → Subtasks (depth 3) to surface completed work as wins.',
    icon: '🏆',
    parameters: {
        days: { type: 'number', description: 'Number of days to look back for closed tasks (default: 7)' },
    },
    async execute({ days = 7 }) {
        const fs = require('fs');
        const path = require('path');
        const logger = require('./logger').child('GoalWins');

        const CACHE_PATH = path.join(process.cwd(), 'brain', 'wbr-cache.json');
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Helper: parse mm-dd-yyyy date format used in WBR
        const parseWbrDate = (dateStr) => {
            if (!dateStr || dateStr === 'Missing') return null;
            try {
                const [mm, dd, yyyy] = dateStr.split('-').map(Number);
                return new Date(yyyy, mm - 1, dd);
            } catch (e) { return null; }
        };

        // Helper: check if a date string (ISO or mm-dd-yyyy) is within the lookback window
        const isRecentlyClosed = (dateStr) => {
            if (!dateStr || dateStr === 'Missing') return false;
            // Try ISO format first
            let d = new Date(dateStr);
            if (isNaN(d.getTime())) d = parseWbrDate(dateStr);
            return d && d >= cutoffDate;
        };

        let goals = [];
        let dataSource = 'none';

        // Load WBR report cache (contains goals with subtasks)
        try {
            if (fs.existsSync(CACHE_PATH)) {
                const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
                if (cached?.report?.sections) {
                    for (const section of cached.report.sections) {
                        goals.push(...(section.goals || []));
                    }
                    dataSource = 'wbr-cache';
                    logger.info(`Loaded ${goals.length} goals from WBR cache`);
                }
            }
        } catch (e) {
            logger.warn('WBR cache load failed:', e.message);
        }

        // Fallback: try goals.json
        if (goals.length === 0) {
            try {
                const goalsPath = path.join(process.cwd(), 'data', 'goals.json');
                if (fs.existsSync(goalsPath)) {
                    const raw = JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
                    goals = raw.data || raw.goals || [];
                    dataSource = 'goals.json';
                }
            } catch (e) { /* skip */ }
        }

        if (goals.length === 0) {
            return { data: [], summary: 'No goals data available. Run WBR sync first.', count: 0, wins: [] };
        }

        // Depth-3 traversal: Goal → Child Tasks → Subtasks
        // For each goal, fetch child tasks and their subtasks via MCP if available
        const wins = [];
        const closedStatuses = ['Completed', 'Completed Late', 'Closed', 'Resolved', 'Cut'];

        // Try to fetch depth-3 data from MCP (Taskei)
        let mcpAvailable = false;
        let mcpClient = null;
        try {
            mcpClient = require('./mcp-client');
            mcpAvailable = true;
        } catch (e) { /* MCP not available */ }

        for (const goal of goals) {
            const goalClosedTasks = [];

            // Check if the goal itself was recently completed
            const goalIsClosed = closedStatuses.includes(goal.status);
            if (goalIsClosed && isRecentlyClosed(goal.lastUpdated)) {
                goalClosedTasks.push({
                    id: goal.id,
                    title: goal.title,
                    type: 'goal',
                    status: goal.status,
                    assignee: goal.assigneeName || goal.assignee || 'unknown',
                    closedDate: goal.lastUpdated,
                    depth: 1,
                });
            }

            // Depth 2: Check child tasks / subtasks from WBR data
            const subtasks = goal.subtasks || goal.children || [];
            for (const child of subtasks) {
                const childIsClosed = closedStatuses.includes(child.status) || child.status === 'Closed';
                if (childIsClosed && isRecentlyClosed(child.lastUpdated || child.ecd)) {
                    goalClosedTasks.push({
                        id: child.id,
                        title: child.title || child.name || '',
                        type: 'task',
                        status: child.status,
                        assignee: child.assigneeName || child.assignee || 'unknown',
                        closedDate: child.lastUpdated || child.ecd,
                        depth: 2,
                        parentGoalId: goal.id,
                    });
                }

                // Depth 3: Fetch subtasks of each child task via MCP
                if (mcpAvailable && child.id) {
                    try {
                        const result = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
                            taskId: child.id,
                            includeCustomAttributes: false,
                            commentLimit: 0
                        });
                        const text = result.content?.map(c => c.text || '').join('') || '{}';
                        const taskData = JSON.parse(text);
                        const grandchildren = taskData.task?.subtasks || taskData.task?.children || [];

                        for (const grandchild of grandchildren) {
                            const gcStatus = grandchild.status || '';
                            const gcIsClosed = gcStatus === 'Closed' || closedStatuses.includes(gcStatus);
                            const gcDate = grandchild.lastUpdatedDate || grandchild.estimatedCompletionDate;
                            if (gcIsClosed && isRecentlyClosed(gcDate)) {
                                goalClosedTasks.push({
                                    id: grandchild.shortId || grandchild.id,
                                    title: grandchild.name || grandchild.title || '',
                                    type: 'subtask',
                                    status: gcStatus,
                                    assignee: grandchild.assignee?.username || grandchild.assignee?.name || 'unknown',
                                    closedDate: gcDate,
                                    depth: 3,
                                    parentTaskId: child.id,
                                    parentGoalId: goal.id,
                                });
                            }
                        }
                    } catch (e) {
                        // Skip depth-3 for this child if MCP fails
                        logger.debug(`Depth-3 fetch failed for ${child.id}: ${e.message}`);
                    }
                }
            }

            // If this goal has recently closed tasks, it's a win
            if (goalClosedTasks.length > 0) {
                wins.push({
                    goalId: goal.id,
                    goalTitle: goal.title,
                    goalStatus: goal.statusColor || goal.status,
                    goalAssignee: goal.assigneeName || goal.assignee || 'unknown',
                    goalType: goal.goalType || '',
                    closedTasks: goalClosedTasks,
                    totalClosed: goalClosedTasks.length,
                    depth1: goalClosedTasks.filter(t => t.depth === 1).length,
                    depth2: goalClosedTasks.filter(t => t.depth === 2).length,
                    depth3: goalClosedTasks.filter(t => t.depth === 3).length,
                });
            }
        }

        // Sort wins: most closed tasks first
        wins.sort((a, b) => b.totalClosed - a.totalClosed);

        // Build human-readable summary
        const totalClosedCount = wins.reduce((sum, w) => sum + w.totalClosed, 0);
        const summaryLines = wins.map(w => {
            const taskNames = w.closedTasks.map(t => `${t.id} ("${t.title}")`).join(', ');
            return `🏆 **${w.goalTitle}** (${w.goalId}) — ${w.totalClosed} task(s) completed: ${taskNames}`;
        });

        const summary = wins.length > 0
            ? `Found ${totalClosedCount} task(s) closed across ${wins.length} goal(s) in the last ${days} days.\n${summaryLines.join('\n')}`
            : `No tasks were closed against any goals in the last ${days} days.`;

        logger.info(`Goal wins: ${totalClosedCount} tasks closed across ${wins.length} goals (depth: 3, lookback: ${days}d, source: ${dataSource})`);

        return {
            data: wins,
            summary,
            count: totalClosedCount,
            wins,
            goalsScanned: goals.length,
            lookbackDays: days,
            dataSource,
        };
    },
});

// 9-12. Goal Narrative Tools (insights, misses, key updates, oncall)
const goalNarrative = require('./goal-narrative-tools');

register({
    name: 'goal_insights',
    description: 'Extract technical/strategic insights from goal updates using AI. Produces data-rich narratives with metrics, cost analyses, and architecture decisions.',
    icon: '🔬',
    parameters: { days: { type: 'number', description: 'Lookback days (default: 7)' } },
    execute: goalNarrative.executeGoalInsights,
});

register({
    name: 'goal_misses',
    description: 'Extract misses and risks from at-risk goals, ECD slips, blocked items, and ticket health. Quantifies impact with dollars, timeline slips, and resource costs.',
    icon: '⚠️',
                parameters: { days: { type: 'number', description: 'Lookback days (default: 7)' } },
    execute: goalNarrative.executeGoalMisses,
});

register({
    name: 'goal_key_updates',
    description: 'Extract key updates and milestones from active goals with recent announcements. Highlights cross-team work, progress, and upcoming deliverables.',
    icon: '📢',
    parameters: { days: { type: 'number', description: 'Lookback days (default: 7)' } },
    execute: goalNarrative.executeGoalKeyUpdates,
});

register({
    name: 'oncall_report',
    description: 'Fetch on-call schedules and incident data from resolver groups via builder-mcp OncallReadActions.',
    icon: '🚨',
    parameters: { days: { type: 'number', description: 'Lookback days (default: 7)' } },
    execute: goalNarrative.executeOncallReport,
});

module.exports = { register, get, execute, listAll };
module.exports.default = { register, get, execute, listAll };
