/**
 * Goal Narrative Tools — Insights, Misses, Key Updates
 * 
 * Three AI-powered tools that analyze WBR goal data + ticket health
 * and produce executive-quality narratives using Bedrock.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('GoalNarrative');

// ─── Shared Helpers ───

function loadGoalsFromCache() {
    const CACHE_PATH = path.join(process.cwd(), 'brain', 'wbr-cache.json');
    let goals = [];
    let report = null;
    try {
        if (fs.existsSync(CACHE_PATH)) {
            const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            report = cached?.report;
            if (report?.sections) {
                for (const section of report.sections) {
                    goals.push(...(section.goals || []));
                }
            }
        }
    } catch (e) {
        logger.warn('WBR cache load failed:', e.message);
    }
    return { goals, report };
}

async function callAI(prompt, system) {
    const bedrockClient = require('./bedrock-client');
    if (bedrockClient.isAvailable()) {
        try {
            return await bedrockClient.generate(prompt, { system, maxTokens: 4096 });
        } catch (e) {
            logger.warn('Bedrock failed:', e.message);
        }
    }
    // Fallback: Ollama
    try {
        const ollamaClient = require('./ollama-client');
        return await ollamaClient.generate(prompt, { system, maxTokens: 4000 });
    } catch (e) {
        return `AI unavailable: ${e.message}`;
    }
}

function buildGoalContext(goals, filter) {
    const filtered = filter ? goals.filter(filter) : goals;
    return filtered.map(g => {
        let ctx = `Goal ${g.id}: "${g.title}" | Status: ${g.statusColor || g.status} | ECD: ${g.ecd} | Assignee: ${g.assigneeName || g.assignee}`;
        if (g.goalType) ctx += ` | Type: ${g.goalType}`;
        if (g.announcement?.text) ctx += `\n  Latest Update: ${g.announcement.text.substring(0, 500)}`;
        if (g.pathToGreen) ctx += `\n  Path to Green: ${g.pathToGreen}`;
        if (g.blocked) ctx += `\n  ⚠️ BLOCKED: ${g.blockedReason || 'unknown reason'}`;
        const subs = (g.subtasks || []).slice(0, 5);
        if (subs.length > 0) {
            ctx += `\n  Child tasks: ${subs.map(s => `${s.id} "${s.title}" (${s.status}, ECD: ${s.ecd})`).join('; ')}`;
        }
        return ctx;
    }).join('\n\n');
}

// ─── Helper: Load eng-metrics CR data ───

async function loadEngMetricsCRs() {
    try {
        const engMetrics = require('./eng-metrics');
        await engMetrics.init();
        const dashboard = await engMetrics.getOrgDashboard();
        if (!dashboard?.engineers) return { engineers: [], totalCRs: 0, crSummary: '' };

        const active = dashboard.engineers.filter(e => e.crsCreated > 0 || e.crsReviewed > 0);
        let allCRs = [];
        for (const eng of active) {
            for (const cr of (eng.crDetails || [])) {
                if (cr.type === 'created') {
                    allCRs.push({
                        id: cr.id,
                        title: cr.title || cr.snippet || '',
                        author: eng.name || eng.alias,
                        packages: cr.packages || [],
                        comments: (cr.comments || []).slice(0, 2),
                    });
                }
            }
        }

        // Build a compact summary of all CRs for AI context
        const crSummary = allCRs.map(cr => {
            let line = `${cr.id} by ${cr.author}: "${cr.title}"`;
            if (cr.packages.length > 0) line += ` [${cr.packages.join(', ')}]`;
            return line;
        }).join('\n');

        return { engineers: active, totalCRs: allCRs.length, crSummary, allCRs, dateRange: dashboard.dateRange };
    } catch (e) {
        logger.warn('Eng-metrics load failed:', e.message);
        return { engineers: [], totalCRs: 0, crSummary: '' };
    }
}

// ─── Tool: goal_insights ───

async function executeGoalInsights({ days = 7 }) {
    const { goals, report } = loadGoalsFromCache();
    if (goals.length === 0) return { data: [], summary: 'No goals data available.', count: 0 };

    // Focus on active goals with recent announcements
    const activeGoals = goals.filter(g => g.status === 'Started' || g.status === 'In Planning');
    const goalCtx = buildGoalContext(activeGoals);

    // Load eng-metrics CR data for cross-referencing
    const engData = await loadEngMetricsCRs();
    const crContext = engData.totalCRs > 0
        ? `\nENGINEERING ACTIVITY THIS WEEK (${engData.dateRange?.start} to ${engData.dateRange?.end}):\n${engData.totalCRs} CRs created by ${engData.engineers.length} engineers:\n${engData.crSummary}`
        : '';

    const system = `You are a senior engineering leader writing technical insights for a weekly executive report. Each insight must be data-rich with specific metrics, dollar amounts, percentages, and technology names. You have access to both goal updates (with business impact) AND engineering code activity. Cross-reference them to derive insights.`;

    const prompt = `Analyze these team goals (with their latest updates describing business impact) AND this week's engineering code activity. Cross-reference them to extract 3-5 technical/strategic INSIGHTS.

A valid insight connects a goal's written impact/announcement with engineering activity (CRs) that advances that goal. Only surface insights where a goal has a written impact description AND there is correlated code activity.

GOLD STANDARD EXAMPLES (write EXACTLY like these):
1. "Catalog-Scale Index Strategy: Building a Custom Khoj Index for 15x Coverage at 80% Lower Cost: evaluation of AWS-managed solutions revealed three critical blockers... building an in-house vector search solution... 80%+ cost reduction (from $3.7M to $670K) — validated by 99.68% recall@50 on a 100M-record dataset."
2. "93% Cost Reduction in Clustering via Meta's FAISS: benchmarked two clustering algorithms... FAISS reduces cost from $150K to $10K, a 93% cost reduction."
3. "17% Coverage Improvements through RAG in Artemis teacher model: demonstrated 17% coverage improvements... 2.8% accuracy improvement (87.9% vs 85.1%) and 11% higher label coverage (80% vs 69%)."

RULES:
- Cross-reference CRs with goals: match by package name, keyword overlap, or engineer assignment
- Every insight MUST include specific numbers (dollars, percentages, counts, dataset sizes) from the goal announcements
- Name specific CRs, packages, technologies, and engineers that contributed
- Include the "why it matters" business impact from the goal's written update
- End with concrete next steps and ECDs where available
- Do NOT fabricate data — only use what's in the goal updates and CR data
- A CR without a related goal that has a written impact is NOT an insight

GOALS DATA:
${goalCtx}
${crContext}

OUTPUT: Return numbered insights, each with a bold headline and 3-5 sentence body. If no meaningful insights can be derived from cross-referencing goals with CRs, say so honestly.`;

    const aiResult = await callAI(prompt, system);
    const insightCount = (aiResult.match(/^\d+\./gm) || []).length;

    return {
        data: aiResult,
        summary: `Generated ${insightCount} insight(s) from ${activeGoals.length} active goals cross-referenced with ${engData.totalCRs} CRs from ${engData.engineers.length} engineers.`,
        count: insightCount,
        goalsAnalyzed: activeGoals.length,
        crsAnalyzed: engData.totalCRs,
        activeEngineers: engData.engineers.length,
    };
}

// ─── Tool: goal_misses ───

async function executeGoalMisses({ days = 7 }) {
    const { goals, report } = loadGoalsFromCache();
    if (goals.length === 0) return { data: [], summary: 'No goals data available.', count: 0 };

    // Identify at-risk goals
    const redYellow = goals.filter(g => g.statusColor === 'Red' || g.statusColor === 'Yellow');
    const blocked = goals.filter(g => g.blocked);
    const missedEcd = report?.summary?.missedEcd || [];
    const ecdSlips = report?.summary?.ecdChanges?.slipped || [];

    // Try to get ticket data for additional miss context
    let ticketContext = '';
    try {
        const ticketHealth = require('./ticket-health');
        const dashboard = await ticketHealth.buildDashboard();
        if (dashboard?.summary) {
            const s = dashboard.summary;
            ticketContext = `\nTICKET HEALTH: ${s.totalOpen} open tickets, ${s.aging30d} aging >30d, ${s.aging14d} aging >14d.`;
            const aging = (dashboard.agingTickets || []).slice(0, 5);
            if (aging.length > 0) {
                ticketContext += `\nAging tickets: ${aging.map(t => `${t.id} "${t.title}" (${t.age}d, ${t.group})`).join('; ')}`;
            }
        }
    } catch (e) { /* skip */ }

    const missCtx = [
        buildGoalContext(redYellow),
        blocked.length > 0 ? `\nBLOCKED GOALS:\n${buildGoalContext(blocked)}` : '',
        missedEcd.length > 0 ? `\nMISSED ECDs:\n${missedEcd.slice(0, 10).map(m => `${m.id}: "${m.title}" (ECD: ${m.ecd}, assignee: ${m.assignee})`).join('\n')}` : '',
        ecdSlips.length > 0 ? `\nECD SLIPS:\n${ecdSlips.slice(0, 10).map(s => `${s.id}: "${s.title}" slipped ${s.daysDiff}d (${s.previousEcd} → ${s.currentEcd})`).join('\n')}` : '',
        ticketContext,
    ].filter(Boolean).join('\n');

    if (!missCtx.trim()) {
        return { data: 'No misses detected — all goals are Green with no ECD slips or blocking tickets.', summary: 'No misses found.', count: 0 };
    }

    const system = `You are a senior engineering leader writing misses for a weekly executive report. Each miss must quantify impact with specific dollars, timeline slips, and resource costs.`;

    const prompt = `Analyze these at-risk goals, ECD slips, blocked items, and ticket health. Extract MISSES — things that went wrong or are at risk.

GOLD STANDARD EXAMPLE:
"$120k IMR impact due to models launched in sync during PLE ramp up: Starting on January 19, 2026, DIG spiked from ~11% to 24-50%... incurred $120k in additional computing expenses (daily cost of $9169, $271k monthly). On 02/05, mitigated by migrating 20 models to async mode, reducing daily cost to $446 ($13k monthly), avoiding $258k in potential monthly expense at a cost of 2 SDE weeks."

RULES:
- Quantify every miss with dollars, days, or SDE-weeks of impact
- Include root cause, timeline of events, and mitigation taken
- Assess risk to goals/timelines if unresolved
- Do NOT fabricate — only use provided data

AT-RISK DATA:
${missCtx}

OUTPUT: Return numbered misses, each with a bold headline quantifying the impact and a 3-5 sentence body.`;

    const aiResult = await callAI(prompt, system);
    const missCount = (aiResult.match(/^\d+\./gm) || []).length;

    return {
        data: aiResult,
        summary: `Generated ${missCount} miss(es) from ${redYellow.length} at-risk goals, ${missedEcd.length} missed ECDs, ${ecdSlips.length} slips.`,
        count: missCount,
        redGoals: redYellow.length,
        blockedGoals: blocked.length,
        missedEcds: missedEcd.length,
        ecdSlips: ecdSlips.length,
    };
}

// ─── Tool: goal_key_updates ───

async function executeGoalKeyUpdates({ days = 7 }) {
    const { goals } = loadGoalsFromCache();
    if (goals.length === 0) return { data: [], summary: 'No goals data available.', count: 0 };

    // Get goals with recent announcements
    const goalsWithUpdates = goals.filter(g =>
        g.status === 'Started' && g.announcement?.text && g.announcement.text.length > 20
    );

    const goalCtx = buildGoalContext(goalsWithUpdates);

    const system = `You are a senior engineering leader writing key updates for a weekly executive report. Each update should highlight notable progress, cross-team work, and upcoming milestones.`;

    const prompt = `Analyze these goal updates and extract KEY UPDATES — notable progress milestones, cross-team work, and upcoming deliverables.

GOLD STANDARD EXAMPLES:
1. "Generate drift signals for active CPP classes derisking $240MM in GMS: completed preliminary experiments to detect output drift across 20 Artemis classes spanning 4 programs... Early results showed algorithm flagged potential output drift on 6-12 classes per day, demonstrating feasibility at production scale (~800M-1B daily catalog records). By March 31st, we will vend raw output drift and FP/FN anomaly scores."
2. "Enabling AVX team for Image embedding inference as away team: AVX/GEM team working to support S-team goal for Project Monty to achieve 95% product coverage... AVX completed their away-team work on March 3, 2026, projecting to go live by March 31, 2026."

RULES:
- Include specific dates, milestones completed, and upcoming ECDs
- Name cross-team dependencies and stakeholders
- Quantify scale (records processed, coverage %, dollar impact)
- Do NOT fabricate — only use provided data

GOALS WITH UPDATES:
${goalCtx}

OUTPUT: Return numbered key updates, each with a bold headline and 3-5 sentence body.`;

    const aiResult = await callAI(prompt, system);
    const updateCount = (aiResult.match(/^\d+\./gm) || []).length;

    return {
        data: aiResult,
        summary: `Generated ${updateCount} key update(s) from ${goalsWithUpdates.length} goals with recent announcements.`,
        count: updateCount,
        goalsWithUpdates: goalsWithUpdates.length,
    };
}

// ─── Tool: oncall_report ───

async function executeOncallReport({ days = 7 }) {
    let mcpClient;
    try {
        mcpClient = require('./mcp-client');
    } catch (e) {
        return { data: [], summary: 'MCP client not available for on-call data.', count: 0 };
    }

    // Step 1: Get resolver group names + ticket summary from ticket-health dashboard
    const ticketHealth = require('./ticket-health');
    let resolverGroups = [];
    let ticketSummaryByGroup = {};
    let dashboardSummary = {};
    try {
        const dashboard = await ticketHealth.buildDashboard();
        resolverGroups = (dashboard.groups || []).map(g => g.name);
        dashboardSummary = dashboard.summary || {};
        // Build per-group ticket summary
        for (const g of (dashboard.groups || [])) {
            ticketSummaryByGroup[g.name] = {
                open: g.open || 0,
                resolved30d: g.resolved30d || 0,
                oldestAge: g.oldestAge || 0,
                statusBreakdown: g.statusBreakdown || {},
                role: g.role || 'Member',
            };
        }
    } catch (e) {
        logger.warn('Could not fetch resolver groups:', e.message);
    }

    if (resolverGroups.length === 0) {
        return { data: [], summary: 'No resolver groups found for on-call lookup.', count: 0 };
    }

    // Step 2: Search oncall teams that map to these resolver groups
    // Use unique search keywords from resolver group names
    const searchQueries = new Set();
    for (const rg of resolverGroups) {
        // Extract meaningful keywords from resolver group names
        const words = rg.split(/[\s\-_]+/).filter(w => w.length > 2);
        words.forEach(w => searchQueries.add(w.toLowerCase()));
    }

    // Search for oncall teams matching resolver group keywords
    const allOncallTeams = [];
    const searched = new Set();
    for (const query of searchQueries) {
        if (searched.has(query)) continue;
        searched.add(query);
        try {
            const result = await mcpClient.callTool('builder-mcp', 'OncallReadActions', {
                action: 'search-teams',
                query: query,
            });
            const text = result?.content?.map(c => c.text || '').join('') || '{}';
            const parsed = JSON.parse(text);
            const teams = parsed?.data || [];
            for (const team of teams) {
                if (!allOncallTeams.find(t => t.teamName === team.teamName)) {
                    allOncallTeams.push(team);
                }
            }
        } catch (e) {
            logger.debug(`Oncall search failed for "${query}": ${e.message}`);
        }
    }

    // Step 3: Filter oncall teams to only those whose resolver groups overlap with ours
    const resolverGroupSet = new Set(resolverGroups.map(rg => rg.toLowerCase()));
    const matchedTeams = allOncallTeams.filter(team => {
        const teamRGs = (team.aliases || []).flatMap(a =>
            (a.resolverGroups || []).map(rg => (rg.resolverGroup || '').toLowerCase())
        );
        return teamRGs.some(rg => resolverGroupSet.has(rg));
    });

    // Step 4: Build structured oncall report
    const oncallReport = matchedTeams.map(team => {
        const aliases = (team.aliases || []);
        const currentOncalls = [];
        for (const alias of aliases) {
            const oncall = alias.oncallDetails?.currentOncalls || [];
            if (oncall.length > 0) {
                currentOncalls.push({
                    aliasName: alias.aliasName,
                    aliasType: alias.aliasType,
                    oncallPersons: oncall,
                    shiftStart: alias.oncallDetails?.shiftStart,
                    shiftEnd: alias.oncallDetails?.shiftEnd,
                    resolverGroups: (alias.resolverGroups || []).map(rg => rg.resolverGroup),
                });
            }
        }
        return {
            teamName: team.teamName,
            description: team.description || '',
            members: team.members || [],
            owners: team.owners || [],
            currentOncalls,
        };
    }).filter(t => t.currentOncalls.length > 0);

    // Build comprehensive summary including ticket health per group
    const oncallPersons = new Set();
    oncallReport.forEach(t => t.currentOncalls.forEach(o => o.oncallPersons.forEach(p => oncallPersons.add(p))));

    // Build ticket summary text for AI consumption
    const ticketLines = resolverGroups.map(rg => {
        const ts = ticketSummaryByGroup[rg] || {};
        const statusParts = Object.entries(ts.statusBreakdown || {}).map(([s, c]) => `${c} ${s}`).join(', ');
        return `${rg}: ${ts.open} open${statusParts ? ` (${statusParts})` : ''}, ${ts.resolved30d} resolved/30d, oldest: ${ts.oldestAge}d, role: ${ts.role}`;
    });

    const s = dashboardSummary;
    const summaryParts = [
        `${resolverGroups.length} resolver groups`,
        `${s.totalOpen || 0} total open tickets`,
        `${s.totalResolved30d || 0} resolved last 30d`,
        `${s.aging7d || 0} aging >7d`,
        `${s.aging30d || 0} aging >30d`,
    ];

    const oncallSummary = oncallReport.length > 0
        ? `On-call: ${[...oncallPersons].join(', ')}.`
        : 'No matching on-call teams found.';

    const summary = `TICKET HEALTH SUMMARY:\n${summaryParts.join(', ')}.\n\nPER-GROUP BREAKDOWN:\n${ticketLines.join('\n')}\n\n${oncallSummary}`;

    return {
        data: { oncallTeams: oncallReport, ticketSummaryByGroup, dashboardSummary: s },
        summary,
        count: resolverGroups.length,
        resolverGroupsSearched: resolverGroups.length,
        oncallPersons: [...oncallPersons],
        ticketSummaryByGroup,
    };
}

module.exports = {
    executeGoalInsights,
    executeGoalMisses,
    executeGoalKeyUpdates,
    executeOncallReport,
};
