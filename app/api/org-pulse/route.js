import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const orgStore = require('../../../services/org-store');
const engMetrics = require('../../../services/eng-metrics');
const tracker = require('../../../services/usage-tracker');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'stream';

    tracker.trackAPICall('/api/org-pulse');

    if (view === 'stream') {
        return streamOrgPulse();
    }

    return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
}

/**
 * Progressive SSE stream — sends data as each source loads.
 * Tier 1: Org tree (instant from SQLite)
 * Tier 2: Eng metrics (fast from SQLite)  
 * Tier 3: Ticket health (slower, MCP with cache)
 * Tier 4: Goal status (slower, MCP with cache)
 */
function streamOrgPulse() {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (evt) => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`)); }
                catch (e) { /* stream closed */ }
            };

            const startTime = Date.now();

            // ─── Tier 1: Org Tree (instant from SQLite) ───
            try {
                const populated = await orgStore.isPopulated();
                if (populated) {
                    const members = await orgStore.getAllMembers();
                    const managers = await orgStore.getManagers();
                    const rootAlias = await orgStore.getRootAlias();
                    const lastFetched = await orgStore.getLastFetched();

                    // Group members by manager
                    const teams = {};
                    for (const mgr of managers) {
                        const reports = members.filter(m => m.managerAlias === mgr.alias && m.alias !== mgr.alias);
                        teams[mgr.alias] = {
                            manager: { alias: mgr.alias, name: mgr.name, depth: mgr.depth },
                            members: reports.map(r => ({
                                alias: r.alias,
                                name: r.name,
                                isManager: !!r.isManager,
                                team: r.team || '',
                            })),
                        };
                    }

                    send({
                        type: 'org-tree',
                        data: { teams, totalMembers: members.length, rootAlias, lastFetched },
                        elapsed: `${Date.now() - startTime}ms`,
                    });
                } else {
                    send({ type: 'org-tree', data: null, message: 'Org not synced. Go to Settings → Sync Org.' });
                }
            } catch (e) {
                send({ type: 'org-tree', data: null, error: e.message });
            }

            // ─── Tier 2: Eng Metrics (fast from SQLite) ───
            try {
                await engMetrics.init();
                const hasData = await engMetrics.hasDataForWeek();
                if (hasData) {
                    const dashboard = await engMetrics.getOrgDashboard();
                    // Build per-engineer lookup
                    const engineerMetrics = {};
                    for (const eng of (dashboard.engineers || [])) {
                        engineerMetrics[eng.alias] = {
                            crsCreated: eng.crsCreated || 0,
                            crsReviewed: eng.crsReviewed || 0,
                            linesChanged: eng.linesChanged || 0,
                            reviewRatio: eng.reviewRatioDisplay || '—',
                            trend: eng.trend || 0,
                            declining3w: !!eng.declining3w,
                            recentCrs: (eng.recentCrs || []).slice(0, 3).map(cr => ({
                                id: cr.id,
                                title: cr.title || cr.id,
                                type: cr.type || 'unknown',
                            })),
                        };
                    }

                    send({
                        type: 'eng-metrics',
                        data: {
                            weekId: dashboard.weekId,
                            summary: dashboard.summary,
                            alerts: dashboard.alerts,
                            engineerMetrics,
                            lastFetched: dashboard.lastFetched,
                        },
                        elapsed: `${Date.now() - startTime}ms`,
                    });
                } else {
                    send({ type: 'eng-metrics', data: null, message: 'No eng-metrics data. Fetch from Code Metrics page first.' });
                }
            } catch (e) {
                send({ type: 'eng-metrics', data: null, error: e.message });
            }

            // ─── Tier 3: Ticket Health (MCP with 5-min cache) ───
            try {
                const ticketHealth = require('../../../services/ticket-health');
                const tickets = await ticketHealth.buildDashboard();
                if (tickets && !tickets.empty) {
                    // Build per-engineer ticket lookup (by assignee)
                    const engineerTickets = {};
                    for (const t of (tickets.allTickets || [])) {
                        const assignee = t.assignee || 'unassigned';
                        if (!engineerTickets[assignee]) {
                            engineerTickets[assignee] = { open: 0, aging14d: 0, tickets: [] };
                        }
                        engineerTickets[assignee].open++;
                        if (t.age > 14) engineerTickets[assignee].aging14d++;
                        if (engineerTickets[assignee].tickets.length < 3) {
                            engineerTickets[assignee].tickets.push({
                                id: t.id, title: (t.title || '').substring(0, 60), age: t.age, status: t.status,
                            });
                        }
                    }

                    send({
                        type: 'ticket-health',
                        data: {
                            summary: tickets.summary,
                            engineerTickets,
                            groups: (tickets.groups || []).map(g => ({ name: g.name, open: g.open, resolved30d: g.resolved30d, oldestAge: g.oldestAge })),
                        },
                        elapsed: `${Date.now() - startTime}ms`,
                    });
                } else {
                    send({ type: 'ticket-health', data: null, message: tickets?.message || 'No ticket data.' });
                }
            } catch (e) {
                send({ type: 'ticket-health', data: null, error: e.message });
            }

            // ─── Tier 4: Goal Status (from WBR cache) ───
            try {
                const wbrReport = require('../../../services/wbr-report');
                const wbr = await wbrReport.generateWbrReport(false);
                if (wbr && wbr.sections) {
                    const allGoals = wbr.sections.flatMap(s => s.goals || []);

                    // Build per-engineer goal lookup (by assignee)
                    const engineerGoals = {};
                    for (const goal of allGoals) {
                        // Check goal-level assignee
                        const assignee = goal.assignee || goal.assigneeName || '';
                        if (assignee) {
                            if (!engineerGoals[assignee]) engineerGoals[assignee] = [];
                            engineerGoals[assignee].push({
                                id: goal.id, title: (goal.title || '').substring(0, 50),
                                statusColor: goal.statusColor, status: goal.status, ecd: goal.ecd,
                            });
                        }
                        // Check subtask assignees
                        for (const sub of (goal.subtasks || [])) {
                            const subAssignee = sub.assignee || '';
                            if (subAssignee) {
                                if (!engineerGoals[subAssignee]) engineerGoals[subAssignee] = [];
                                engineerGoals[subAssignee].push({
                                    id: sub.id, title: (sub.title || '').substring(0, 50),
                                    statusColor: goal.statusColor, status: sub.status, ecd: sub.ecd,
                                    parentGoal: goal.id,
                                });
                            }
                        }
                    }

                    send({
                        type: 'goals',
                        data: {
                            totalGoals: allGoals.length,
                            byColor: wbr.summary?.byColor || {},
                            engineerGoals,
                            title: wbr.title,
                        },
                        elapsed: `${Date.now() - startTime}ms`,
                    });
                } else {
                    send({ type: 'goals', data: null, message: 'No WBR data. Load Team Health page first.' });
                }
            } catch (e) {
                send({ type: 'goals', data: null, error: e.message });
            }

            // ─── Done ───
            send({ type: 'done', totalElapsed: `${Date.now() - startTime}ms` });
            controller.close();
        }
    });

    return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    });
}
