import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'generate';

        if (view === 'prompt') {
            // Return the current WBR prompt
            const fs = require('fs');
            const path = require('path');
            const promptsPath = path.join(process.cwd(), 'config', 'prompts.json');
            const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
            return NextResponse.json({ prompt: prompts.wbrPrep?.promptTemplate || getDefaultPrompt() });
        }

        if (view === 'generate') {
            // Collect data from eng-metrics and WBR goals, then call AI
            const engMetrics = require('@/services/eng-metrics');
            const wbrReport = require('@/services/wbr-report');

            await engMetrics.init();

            // Get current week and previous week data
            const currentWeekId = engMetrics.getWeekId();
            const dashboard = await engMetrics.getOrgDashboard();

            // Get WBR goals (cached)
            let goals = null;
            try {
                goals = await wbrReport.generateWbrReport(false);
            } catch (e) {
                // Goals may not be configured
            }

            // CR details are pre-enriched during weekly sync (stored in SQLite with titles + comments)
            // No live enrichment needed — data is read from getOrgDashboard()

            // Build context for AI
            const context = buildContext(dashboard, goals, currentWeekId);

            // Get the prompt
            const fs = require('fs');
            const path = require('path');
            const promptsPath = path.join(process.cwd(), 'config', 'prompts.json');
            const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
            const prompt = prompts.wbrPrep?.promptTemplate || getDefaultPrompt();

            // Call AI
            const aiResult = await callAI(prompt, context);

            return NextResponse.json({
                weekId: currentWeekId,
                dateRange: dashboard.dateRange,
                result: aiResult,
                context: context,
                prompt: prompt,
            });
        }

        return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
    } catch (error) {
        console.error('WBR Prep error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();

        if (body.action === 'save-prompt') {
            const fs = require('fs');
            const path = require('path');
            const promptsPath = path.join(process.cwd(), 'config', 'prompts.json');
            const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
            if (!prompts.wbrPrep) prompts.wbrPrep = {};
            prompts.wbrPrep.promptTemplate = body.prompt;
            fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 4));
            return NextResponse.json({ ok: true });
        }

        if (body.action === 'reset-prompt') {
            const fs = require('fs');
            const path = require('path');
            const promptsPath = path.join(process.cwd(), 'config', 'prompts.json');
            const prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
            if (prompts.wbrPrep) {
                prompts.wbrPrep.promptTemplate = getDefaultPrompt();
            }
            fs.writeFileSync(promptsPath, JSON.stringify(prompts, null, 4));
            return NextResponse.json({ ok: true, prompt: getDefaultPrompt() });
        }

        if (body.action === 'regenerate') {
            // Re-generate with custom prompt
            const engMetrics = require('@/services/eng-metrics');
            const wbrReport = require('@/services/wbr-report');
            await engMetrics.init();
            const currentWeekId = engMetrics.getWeekId();
            const dashboard = await engMetrics.getOrgDashboard();
            let goals = null;
            try { goals = await wbrReport.generateWbrReport(false); } catch (e) { }
            const context = buildContext(dashboard, goals, currentWeekId);
            const aiResult = await callAI(body.prompt, context);
            return NextResponse.json({ weekId: currentWeekId, dateRange: dashboard.dateRange, result: aiResult, context, prompt: body.prompt });
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    } catch (error) {
        console.error('WBR Prep POST error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function getDefaultPrompt() {
    return `You are an engineering performance analyst. Given the following weekly engineering activity data, generate a data-driven executive summary suitable for leadership review.

## Input Data
- **Code checked in (commits/PRs merged):** {list of commits or PR titles, descriptions, and diffs}
- **Code reviews created:** {list of PRs opened with titles and descriptions}
- **Code reviews reviewed:** {list of PRs reviewed by the engineer/team}
- **Code review comments:** {list of review comments left or received}
- **Task comments:** {list of comments on tasks/tickets}
- **Subtask comments:** {list of comments on subtasks}

## Rules (MUST follow)
1. **No weasel words.** Do not use: "some", "several", "many", "a few", "various", "significant", "notable", "generally", "mostly", "often", "improved", "good", "great", "solid". Replace every such word with an exact count, percentage, or specific name.
2. **Quantify everything.** Every claim must include a number. Examples:
  - BAD: "Several PRs were merged this week."
  - GOOD: "12 PRs were merged this week across 4 repositories."
  - BAD: "Code review participation was strong."
  - GOOD: "6 engineers reviewed 18 PRs, leaving 47 comments total (2.6 comments/PR avg)."
3. **Name names.** Reference specific PR titles, task IDs, repository names, and engineer aliases — not generic descriptions.
4. **No filler sentences.** Every sentence must convey a fact, a number, or a concrete action item.

## Output: Executive Summary

### 1. Week-at-a-Glance (Metrics Table)

| Metric                        | Count |
|-------------------------------|-------|
| Commits merged                | #     |
| PRs created                   | #     |
| PRs reviewed                  | #     |
| Review comments left          | #     |
| Review comments received      | #     |
| Avg comments per PR           | #     |
| Task comments                 | #     |
| Subtask comments              | #     |
| Unique contributors           | #     |
| Repositories touched          | #     |

### 2. Overview
2–3 sentences. State the exact volume of work (X commits, Y PRs, Z reviews). Compare to prior week if data is available. No adjectives without numbers.

### 3. Wins
- List completed features, merged PRs, and resolved bugs by name/ID.
- Include the count of lines added/removed where visible in diffs.
- State turnaround time (PR opened → merged) if derivable from timestamps.

### 4. Misses / Risks
- List specific PRs or tasks that are stalled, with days open.
- Count unresolved review comments or rejected PRs.
- Identify exact technical debt items introduced (file names, patterns).

### 5. Collaboration & Code Review Insights
- State how many engineers participated as reviewers vs. authors.
- Report the distribution: top reviewer (alias, # reviews), least active reviewer (alias, # reviews).
- List the top 3 recurring review feedback themes with occurrence count (e.g., "missing unit tests — raised 5 times across 3 PRs").

### 6. Key Technical Insights
- Name specific architectural changes, new dependencies added (package name + version), or API changes.
- State the number of files and repositories affected.
- Flag cross-team impacts by naming the affected teams or services.

### 7. Recommended Actions
- List 2–4 actions. Each action must:
 - Reference a specific finding from sections 4–6.
 - Name the owner (team or individual).
 - Include a measurable target or deadline.
 - Example: "Resolve 3 stalled PRs (PR-1042, PR-1087, PR-1103) owned by TeamX by Friday EOD."

## Tone & Format
- Executive-friendly: direct, factual, zero fluff.
- Bullet points within each section.
- No adjective without an accompanying number.
- Length: 400–600 words total.`;
}

/**
 * Enrich CR details by fetching full titles, descriptions, and comments from code.amazon.com
 * Fetches ALL unique CRs across all engineers, batched 10 at a time.
 * Mutates dashboard.engineers[].crDetails in place with enriched data.
 */
async function enrichCrDetails(dashboard) {
    if (!dashboard?.engineers) return;

    const mcpClient = require('@/services/mcp-client');

    // Collect ALL unique CR IDs across all engineers
    const crToEngineerMap = {}; // crId -> { engineers: [alias], type: 'created'|'reviewed' }
    for (const eng of dashboard.engineers) {
        for (const cr of (eng.crDetails || [])) {
            if (cr.id && !crToEngineerMap[cr.id]) {
                crToEngineerMap[cr.id] = { engineers: [], type: cr.type };
            }
            if (cr.id) crToEngineerMap[cr.id].engineers.push(eng.alias);
        }
    }

    const allCrIds = Object.keys(crToEngineerMap);
    if (allCrIds.length === 0) return;

    console.log(`[WBR Prep] Enriching ${allCrIds.length} CRs with full details...`);

    // Fetch CR pages in batches of 10 with ?include-all-comments=true
    const CR_BATCH_SIZE = 10;
    const enrichedCrs = {}; // crId -> { title, description, comments, packages }

    for (let i = 0; i < allCrIds.length; i += CR_BATCH_SIZE) {
        const batch = allCrIds.slice(i, i + CR_BATCH_SIZE);
        const urls = batch.map(id => `https://code.amazon.com/reviews/${id}?include-all-comments=true`);

        try {
            const result = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
                inputs: urls,
                concurrencyLimit: CR_BATCH_SIZE
            });
            const content = result?.content;
            if (Array.isArray(content)) {
                for (let idx = 0; idx < content.length && idx < batch.length; idx++) {
                    const crId = batch[idx];
                    const text = content[idx]?.text || '';
                    const textStr = typeof text === 'string' ? text : JSON.stringify(text);

                    // Extract CR title/summary from the response
                    let title = '';
                    let description = '';
                    let comments = [];
                    let packages = [];

                    try {
                        // Try to parse structured JSON response
                        const parsed = JSON.parse(textStr);
                        const rev = parsed?.revisionSummary || parsed?.content?.revisionSummary || {};
                        const revDetails = parsed?.revisionDetails?.revision?.cr_revision || {};
                        title = rev.summary || rev.title || revDetails.description || '';
                        description = revDetails.description || '';
                        packages = (revDetails.packages || []).map(p => p.package?.name || p.name).filter(Boolean);

                        // Extract comments from the response
                        const allComments = parsed?.comments || parsed?.content?.comments || [];
                        if (Array.isArray(allComments)) {
                            comments = allComments.slice(0, 5).map(c => ({
                                author: c.author?.name || c.author || 'unknown',
                                message: (c.message || c.body || c.text || '').substring(0, 300)
                            }));
                        }
                    } catch (e) {
                        // Fallback: extract from text
                        const titleMatch = textStr.match(/(?:summary|title|description)[:\s]*"?([^"\n]{10,200})/i);
                        if (titleMatch) title = titleMatch[1].trim();

                        // Extract inline comments from markdown-style output
                        const commentLines = textStr.split('\n').filter(l => l.includes('comment') || l.includes('Comment'));
                        comments = commentLines.slice(0, 3).map(l => ({
                            author: 'reviewer',
                            message: l.replace(/[#*\-|]/g, '').trim().substring(0, 300)
                        }));
                    }

                    enrichedCrs[crId] = { title, description: description.substring(0, 500), comments, packages };
                }
            }
        } catch (e) {
            console.warn(`[WBR Prep] CR enrichment batch failed at offset ${i}: ${e.message}`);
        }

        // Small delay between batches
        if (i + CR_BATCH_SIZE < allCrIds.length) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // Update engineer crDetails in-place with enriched data
    let enrichedCount = 0;
    for (const eng of dashboard.engineers) {
        for (const cr of (eng.crDetails || [])) {
            const enriched = enrichedCrs[cr.id];
            if (enriched) {
                cr.title = enriched.title;
                cr.description = enriched.description;
                cr.comments = enriched.comments;
                cr.packages = enriched.packages;
                if (enriched.title) cr.snippet = enriched.title; // Override snippet with real title
                enrichedCount++;
            }
        }
    }

    console.log(`[WBR Prep] Enriched ${enrichedCount} CR entries with titles/comments from ${Object.keys(enrichedCrs).length} unique CRs`);
}

function buildContext(dashboard, goals, weekId) {
    let ctx = `WEEK: ${weekId}\n`;
    if (dashboard?.dateRange) {
        ctx += `DATE RANGE: ${dashboard.dateRange.start} to ${dashboard.dateRange.end}\n`;
    }

    // Org summary
    if (dashboard?.summary) {
        const s = dashboard.summary;
        ctx += `\nORG SUMMARY:\n`;
        ctx += `- Total CRs Created: ${s.crsCreated?.value || 0} (trend: ${s.crsCreated?.trend || 0}% WoW)\n`;
        ctx += `- Total CRs Reviewed: ${s.crsReviewed?.value || 0} (trend: ${s.crsReviewed?.trend || 0}% WoW)\n`;
        ctx += `- Stale CRs: ${s.staleCrs?.value || 0}\n`;
        ctx += `- Total Engineers: ${dashboard.totalEngineers || 0}\n`;
    }

    // Per-engineer data — ACTIVE engineers only (with CR details)
    if (dashboard?.engineers) {
        const sorted = [...dashboard.engineers].sort((a, b) => (b.crsCreated || 0) - (a.crsCreated || 0));
        const active = sorted.filter(e => e.crsCreated > 0 || e.crsReviewed > 0);
        const inactive = sorted.filter(e => e.crsCreated === 0 && e.crsReviewed === 0);
        const declining = sorted.filter(e => e.decliningStreak);

        ctx += `\nACTIVE ENGINEERS (${active.length} of ${sorted.length}):\n`;
        for (const e of active) {
            ctx += `- ${e.name} (${e.alias}): ${e.crsCreated} created, ${e.crsReviewed} reviewed`;
            if (e.crsCreatedDelta !== null && e.crsCreatedDelta !== undefined) {
                ctx += `, delta: ${e.crsCreatedDelta > 0 ? '+' : ''}${e.crsCreatedDelta} vs last week`;
            }
            if (e.decliningStreak) ctx += ` ⚠️ 3-week decline`;
            ctx += `\n`;

            // Only show CR details for engineers who created CRs
            const crDetails = e.crDetails || [];
            const created = crDetails.filter(cr => cr.type === 'created');
            if (created.length > 0) {
                for (const cr of created) {
                    // Only show title if it looks like a real title (not a reviewer comment)
                    const title = cr.title && cr.title.length > 5 && !cr.title.startsWith('Seems') && !cr.title.startsWith('I ') ? cr.title : '';
                    ctx += `  [Created] ${cr.id}${title ? ': "' + title.substring(0, 120) + '"' : ''}\n`;
                    if (cr.comments?.length > 0) {
                        for (const c of cr.comments.slice(0, 2)) {
                            ctx += `    💬 ${c.author}: ${c.message.substring(0, 200)}\n`;
                        }
                    }
                }
            }
            // For reviewed CRs, just list IDs with titles (no comments to save space)
            const reviewed = crDetails.filter(cr => cr.type === 'reviewed');
            if (reviewed.length > 0) {
                const reviewList = reviewed.map(cr => {
                    const title = cr.title && cr.title.length > 5 && !cr.title.startsWith('Seems') && !cr.title.startsWith('I ') ? cr.title : '';
                    return `${cr.id}${title ? ' "' + title.substring(0, 60) + '"' : ''}`;
                }).join(', ');
                ctx += `  Reviewed: ${reviewList}\n`;
            }
            if (e.packages && e.packages.length > 0) {
                ctx += `  Packages: ${e.packages.slice(0, 5).join(', ')}\n`;
            }
        }

        // Pre-computed insights for AI
        if (inactive.length > 0) {
            ctx += `\nZERO ACTIVITY ENGINEERS (${inactive.length}): ${inactive.map(e => `${e.name} (${e.alias})${e.crsCreatedDelta !== null && e.crsCreatedDelta < 0 ? ' [was ' + Math.abs(e.crsCreatedDelta) + ' last week]' : ''}`).join(', ')}\n`;
        }
        if (declining.length > 0) {
            ctx += `\nDECLINING STREAKS (3+ weeks): ${declining.map(e => `${e.name} (${e.alias})`).join(', ')}\n`;
        }
    }

    // Goals
    if (goals) {
        ctx += `\nGOAL STATUS SUMMARY:\n`;
        ctx += `- Total Goals: ${goals.totalGoals}\n`;
        if (goals.summary?.byStatus) {
            ctx += `- By Status: ${JSON.stringify(goals.summary.byStatus)}\n`;
        }
        if (goals.summary?.byColor) {
            ctx += `- By RAG: ${JSON.stringify(goals.summary.byColor)}\n`;
        }
        if (goals.summary?.missedEcd?.length > 0) {
            ctx += `- Missed ECDs: ${goals.summary.missedEcd.length}\n`;
            for (const m of goals.summary.missedEcd.slice(0, 5)) {
                ctx += `  - ${m.id}: "${m.title}" (ECD: ${m.ecd}, assignee: ${m.assignee})\n`;
            }
        }
        if (goals.summary?.ecdChanges?.slipped?.length > 0) {
            ctx += `- ECD Slips: ${goals.summary.ecdChanges.slipped.length}\n`;
        }

        // Active goals with recent announcements
        ctx += `\nACTIVE GOALS:\n`;
        const activeGoals = goals.sections?.find(s => s.name === 'Started')?.goals || [];
        for (const g of activeGoals.slice(0, 20)) {
            ctx += `- ${g.id}: ${g.title?.substring(0, 120)}\n`;
            ctx += `  Status: ${g.statusColor}, ECD: ${g.ecd}, Assignee: ${g.assignee}\n`;
            if (g.announcement?.text) {
                ctx += `  Latest Update: ${g.announcement.text.substring(0, 200)}\n`;
            }
        }
    }

    return ctx;
}

async function callAI(prompt, context) {
    const fullPrompt = `${prompt}\n\n--- TEAM ACTIVITY DATA ---\n${context}`;
    const systemMsg = 'You are an expert engineering manager. Write data-driven WBR reports. Every claim must cite a specific CR ID, goal ID, engineer name, or number. Never use filler words.';

    // Prefer Bedrock Opus if configured, fall back to Ollama
    const bedrockClient = require('@/services/bedrock-client');
    if (bedrockClient.isAvailable()) {
        try {
            console.log('[WBR Prep] Using Bedrock Opus for AI generation...');
            const result = await bedrockClient.generate(fullPrompt, {
                system: systemMsg,
                maxTokens: 8192,
            });
            return result;
        } catch (error) {
            console.error('[WBR Prep] Bedrock failed, falling back to Ollama:', error.message);
        }
    }

    // Fallback: Ollama local
    try {
        const ollamaClient = require('@/services/ollama-client');
        const result = await ollamaClient.generate(fullPrompt, {
            system: systemMsg,
            maxTokens: 8000,
        });
        return result;
    } catch (error) {
        console.error('AI call failed:', error.message);
        return `*AI engine unavailable (${error.message}). Raw data context collected successfully.*\n\nCollected ${context.split('\n').length} lines of context data from eng-metrics and WBR goals.`;
    }
}
