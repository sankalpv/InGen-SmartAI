import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const phonetool = require('../../../services/phonetool');
const personInsights = require('../../../services/person-insights');
const wbrReport = require('../../../services/wbr-report');
const orgStore = require('../../../services/org-store');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'tree';
        const alias = searchParams.get('alias');
        const days = parseInt(searchParams.get('days') || '14');

        let data;

        switch (view) {
            case 'tree': {
                // Try SQLite first, fall back to live Phonetool
                const orgTree = await orgStore.getOrgTree();
                if (orgTree) {
                    data = orgTree;
                } else {
                    const rootAlias = phonetool.getAlias();
                    if (!rootAlias) {
                        return NextResponse.json({ error: 'No Phonetool alias configured. Go to Settings to set it.' }, { status: 400 });
                    }
                    data = await phonetool.fetchOrgTree(rootAlias);
                    // Save to SQLite for future queries
                    if (data) await orgStore.saveOrgTree(data, rootAlias);
                }
                break;
            }

            case 'flat': {
                const populated = await orgStore.isPopulated();
                if (populated) {
                    data = await orgStore.getAllMembers();
                } else {
                    const rootAlias = phonetool.getAlias();
                    if (!rootAlias) {
                        return NextResponse.json({ error: 'No Phonetool alias configured.' }, { status: 400 });
                    }
                    data = await phonetool.getOrgFlatList(rootAlias);
                }
                break;
            }

            case 'org-sync': {
                // Force re-fetch org tree from Phonetool and save to SQLite
                const rootAlias = phonetool.getAlias();
                if (!rootAlias) {
                    return NextResponse.json({ error: 'No Phonetool alias configured.' }, { status: 400 });
                }
                const count = await orgStore.populateFromPhoneTool(rootAlias);
                data = { rootAlias, memberCount: count, lastFetched: new Date().toISOString() };
                break;
            }

            case 'org-status': {
                const populated = await orgStore.isPopulated();
                data = {
                    populated,
                    memberCount: populated ? await orgStore.getMemberCount() : 0,
                    rootAlias: await orgStore.getRootAlias(),
                    lastFetched: await orgStore.getLastFetched(),
                    managers: populated ? (await orgStore.getManagers()).map(m => ({ alias: m.alias, name: m.name, depth: m.depth })) : [],
                };
                break;
            }

            case 'person': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                const name = await phonetool.fetchPersonName(alias) || alias;
                data = await personInsights.generatePersonInsight(alias, name, days);
                break;
            }

            case 'person-quick': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                // Quick view without AI — just emails, meetings, issues counts
                const emails = personInsights.getEmailsForPerson(alias, days);
                const meetings = personInsights.getMeetingsForPerson(alias, days);
                const issues = await personInsights.getIssuesForPerson(alias, days);
                const name = phonetool.getCachedName(alias) || alias;
                data = {
                    alias,
                    name,
                    emailCount: emails.length,
                    meetingCount: meetings.length,
                    issueCount: issues.length,
                    recentEmails: emails.slice(0, 5).map(e => ({
                        subject: e.subject,
                        from: e.from || e.sender,
                        date: e.date || e.receivedAt,
                    })),
                    recentIssues: issues.slice(0, 5).map(i => ({
                        title: i.title,
                        action: i.action,
                        type: i.type,
                        timestamp: i.timestamp,
                    })),
                };
                break;
            }

            case 'wbr': {
                const forceRefresh = searchParams.get('refresh') === 'true';
                data = await wbrReport.generateWbrReport(forceRefresh);
                break;
            }

            case 'wbr-ai-summary': {
                // Generate AI summary using WBR report data + Ollama (no depth scanning)
                const wbrData = await wbrReport.generateWbrReport(false);
                if (!wbrData || !wbrData.sections) {
                    return NextResponse.json({ error: 'No WBR report data available. Load Team Health first.' }, { status: 400 });
                }

                const today = new Date(new Date().toDateString());

                // Compile goal-level stats from WBR report (level-0 and level-1 only)
                const allGoals = [];
                for (const section of wbrData.sections) {
                    for (const goal of (section.goals || [])) allGoals.push(goal);
                }

                const goalDetails = allGoals.map(goal => {
                    const children = goal.subtasks || [];
                    const closed = children.filter(s => s.status === 'Closed').length;
                    const total = children.length;
                    const pct = total > 0 ? Math.round((closed / total) * 100) : 0;
                    return `${goal.id} "${(goal.title || '').substring(0, 60)}" [${goal.statusColor}/${goal.status}] ECD:${goal.ecd} Tasks:${closed}/${total}(${pct}%)`;
                });

                // Pre-compute stats
                const missedEcd = wbrData.summary?.missedEcd || [];
                const ecdChanges = wbrData.summary?.ecdChanges || { totalChanged: 0, slipped: [], pulledIn: [] };
                const totalTasks = allGoals.reduce((s, g) => s + (g.subtasks || []).length, 0);
                const closedTasks = allGoals.reduce((s, g) => s + (g.subtasks || []).filter(s => s.status === 'Closed').length, 0);
                const taskPct = totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 100) : 0;

                // Goals with passed ECDs
                const goalsWithPassedEcd = allGoals.filter(g => {
                    if (!g.ecd || g.ecd === 'Missing') return false;
                    try {
                        const [mm, dd, yyyy] = g.ecd.split('-').map(Number);
                        return new Date(yyyy, mm - 1, dd) < today;
                    } catch(e) { return false; }
                }).map(g => `${g.id}(ECD:${g.ecd})`);

                const ollama = require('../../../services/ollama-client');
                const todayStr = new Date().toISOString().split('T')[0];

                const prompt = `You are writing an executive status report for a Weekly Business Review (WBR). Write in Amazon style: data-first, short sentences, no filler words.

TODAY'S DATE: ${todayStr}
REPORTING PERIOD: ${wbrData.subtitle}

GOAL SUMMARY:
- Total Goals: ${wbrData.totalGoals}
- Status Colors: Green=${wbrData.summary?.byColor?.Green||0}, Yellow=${wbrData.summary?.byColor?.Yellow||0}, Red=${wbrData.summary?.byColor?.Red||0}, Missing=${wbrData.summary?.byColor?.Missing||0}
- Blocked Goals: ${allGoals.filter(g => g.status === 'Blocked').length > 0 ? allGoals.filter(g => g.status === 'Blocked').map(g => g.id).join(', ') : 'None'}
- Goals with passed ECD: ${goalsWithPassedEcd.length > 0 ? goalsWithPassedEcd.join('; ') : 'None'}
- Missed ECDs: ${missedEcd.length} (${missedEcd.filter(e => e.type === 'goal').length} goals, ${missedEcd.filter(e => e.type === 'child').length} tasks)
- ECD Drift: ${ecdChanges.slipped?.length || 0} slipped, ${ecdChanges.pulledIn?.length || 0} pulled in
- Task Completion: ${closedTasks}/${totalTasks} (${taskPct}%)

PER-GOAL DETAIL:
${goalDetails.join('\n')}

Write a summary with these sections:
1. **Executive Summary** (2-3 sentences covering overall health)
2. **Key Risks** (bullet points with specific goal IDs and data)
3. **Positive Signals** (bullet points showing progress)
4. **Recommended Actions** (2-3 specific, actionable items)

Be specific. Use goal IDs. Quote numbers. Do not be generic.`;

                try {
                    const aiResult = await ollama.generate(prompt, { temperature: 0.3 });
                    data = {
                        summary: aiResult,
                        generatedAt: new Date().toISOString(),
                        tasksScanned: allGoals.length,
                    };
                } catch (aiError) {
                    data = {
                        summary: null,
                        error: `AI generation failed: ${aiError.message}`,
                        generatedAt: new Date().toISOString(),
                    };
                }
                break;
            }

            case 'subtasks': {
                // Fetch subtasks for a specific issue on-demand
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required (issue ID)' }, { status: 400 });
                }
                const mcpClient = require('../../../services/mcp-client');
                try {
                    const result = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
                        taskId: alias,
                        includeCustomAttributes: false,
                        commentLimit: 0
                    });
                    const text = result.content?.map(c => c.text || '').join('') || '{}';
                    const taskData = JSON.parse(text);
                    const task = taskData.task || {};
                    const fmtDate = (d) => {
                        if (!d) return 'Missing';
                        try {
                            const dt = new Date(d);
                            return `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}-${dt.getFullYear()}`;
                        } catch(e) { return 'Missing'; }
                    };
                    data = {
                        id: task.shortId || task.id || alias,
                        name: task.name || '',
                        status: task.status || 'Open',
                        workflowAction: task.workflowAction || '',
                        ecd: fmtDate(task.estimatedCompletionDate),
                        subtasks: (task.subtasks || []).map(s => ({
                            id: s.shortId || s.id,
                            title: s.name || '',
                            status: s.status || 'Open',
                            assignee: s.assignee?.username || 'unassigned',
                            assigneeName: s.assignee?.name || '',
                            ecd: fmtDate(s.estimatedCompletionDate),
                        }))
                    };
                } catch (e) {
                    data = { id: alias, subtasks: [], error: e.message };
                }
                break;
            }

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }

        return NextResponse.json({ view, data });
    } catch (error) {
        console.error('[API/Team] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}