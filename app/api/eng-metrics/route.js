import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const engMetrics = require('../../../services/eng-metrics');
const tracker = require('../../../services/usage-tracker');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'dashboard';
        tracker.trackAPICall('/api/eng-metrics');
        const alias = searchParams.get('alias');
        const weeks = parseInt(searchParams.get('weeks') || '8');

        let data;

        switch (view) {
            case 'dashboard': {
                const weekId = searchParams.get('weekId') || null;
                const hasData = await engMetrics.hasDataForWeek(weekId);
                if (!hasData) {
                    // Return empty dashboard with metadata
                    data = {
                        weekId: engMetrics.getWeekId(),
                        dateRange: engMetrics.getWeekDateRange(engMetrics.getWeekId()),
                        lastFetched: await engMetrics.getLastFetched(),
                        empty: true,
                        summary: {
                            crsCreated: { value: 0, trend: 0 },
                            crsReviewed: { value: 0, trend: 0 },
                            linesChanged: { value: 0, display: '0', trend: 0 },
                            p50Turnaround: { value: 0, display: '0.0h', prevDisplay: '0.0h' },
                            staleCrs: { value: 0, prev: 0 }
                        },
                        alerts: { staleCrs: 0, busFactorRisks: 0, busFactorDetails: [] },
                        engineers: [],
                        goalAlignment: [],
                        totalEngineers: 0
                    };
                } else {
                    data = await engMetrics.getOrgDashboard(weekId);
                }
                break;
            }

            case 'engineer': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                data = await engMetrics.getEngineerDetail(alias, weeks);
                break;
            }

            case 'trend': {
                data = await engMetrics.getWeeklyTrend(weeks);
                break;
            }

            case 'refresh': {
                const weekId = searchParams.get('weekId') || null;
                data = await engMetrics.fetchOrgMetrics(weekId);
                break;
            }

            case 'sparkline': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                data = await engMetrics.getEngineerSparkline(alias, weeks);
                break;
            }

            case 'engineer-year': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                const year = parseInt(searchParams.get('year') || new Date().getFullYear());
                data = await engMetrics.getEngineerYearData(alias, year);
                break;
            }

            case 'org-year-trend': {
                const year = parseInt(searchParams.get('year') || new Date().getFullYear());
                data = await engMetrics.getOrgYearTrend(year);
                break;
            }

            case 'compare': {
                const aliasesParam = searchParams.get('aliases') || '';
                const aliases = aliasesParam.split(',').filter(Boolean);
                if (aliases.length < 2) {
                    return NextResponse.json({ error: 'At least 2 aliases required (comma-separated)' }, { status: 400 });
                }
                data = await engMetrics.compareEngineers(aliases, weeks);
                break;
            }

            case 'backfill': {
                const year = parseInt(searchParams.get('year') || new Date().getFullYear());
                data = engMetrics.startBackfillAsync(year);
                break;
            }

            case 'backfill-status': {
                data = engMetrics.getBackfillStatus();
                break;
            }

            case 'backfill-cancel': {
                data = { cancelled: engMetrics.cancelBackfill() };
                break;
            }

            case 'stale-crs': {
                data = await engMetrics.countOrgStaleCrs();
                break;
            }

            case 'missing-weeks': {
                const year = parseInt(searchParams.get('year') || new Date().getFullYear());
                const missing = await engMetrics.getMissingWeeks(year);
                data = { year, missingWeeks: missing, count: missing.length };
                break;
            }

            case 'sync': {
                data = await engMetrics.incrementalSync();
                break;
            }

            case 'work-summary': {
                // Stream AI work summary for an engineer — fetches CR details live via builder-mcp
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                const detail = await engMetrics.getEngineerDetail(alias, 1);
                const crIds = (detail?.recentCrs || []).map(cr => cr.id).filter(Boolean);
                if (crIds.length === 0) {
                    return NextResponse.json({ error: 'No CRs found for this engineer this week' }, { status: 400 });
                }

                const mcpClient = require('../../../services/mcp-client');
                const ollamaClient = require('../../../services/ollama-client');

                // Fetch CR details live from code.amazon.com
                const crUrls = crIds.slice(0, 10).map(id => `https://code.amazon.com/reviews/${id}`);
                let crDetails = [];
                try {
                    const result = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
                        inputs: crUrls, concurrencyLimit: 5
                    });
                    const content = result?.content;
                    if (Array.isArray(content)) {
                        crDetails = content.map((c, i) => {
                            try {
                                const parsed = typeof c === 'string' ? JSON.parse(c) : (c.text ? JSON.parse(c.text) : c);
                                const rev = parsed.revisionSummary || parsed.content?.revisionSummary || {};
                                return {
                                    id: crIds[i],
                                    summary: rev.summary || '',
                                    status: rev.status || '',
                                    type: (detail.recentCrs.find(cr => cr.id === crIds[i])?.type) || 'unknown',
                                    description: parsed.revisionDetails?.revision?.cr_revision?.description?.substring(0, 500) || '',
                                    category: rev.category || '',
                                    packages: parsed.revisionDetails?.revision?.cr_revision?.packages?.map(p => p.package?.name) || [],
                                };
                            } catch (e) { return { id: crIds[i], summary: crIds[i], type: 'unknown' }; }
                        });
                    }
                } catch (e) {
                    console.error('Failed to fetch CR details:', e.message);
                    // Fall back to just CR IDs
                    crDetails = crIds.map(id => ({ id, summary: id, type: 'unknown' }));
                }

                // Build prompt
                const crSummaries = crDetails.map(cr =>
                    `- ${cr.id} [${cr.type}] "${cr.summary}" (${cr.category || 'code'}) ${cr.description ? '— ' + cr.description.substring(0, 200) : ''}`
                ).join('\n');

                const prompt = `You are writing a concise weekly work summary for an engineer based on their code review activity.

ENGINEER: ${detail.name || alias} (${alias})
WEEK: ${detail.currentWeek ? 'Current week' : 'Recent'}
CRs CREATED: ${detail.currentWeek?.crsCreated || 0}
CRs REVIEWED: ${detail.currentWeek?.crsReviewed || 0}

CODE REVIEWS THIS WEEK:
${crSummaries}

Write a brief work summary with:
1. **What they worked on** — 2-4 bullet points grouping related CRs by theme/area
2. **Review contributions** — Brief note on their review activity
3. **Focus area** — One-line summary of their primary focus this week

Be specific. Use CR IDs. Be concise (under 150 words). Use markdown.`;

                // Stream response
                const stream = new ReadableStream({
                    async start(controller) {
                        const encoder = new TextEncoder();
                        try {
                            // Send CR details first
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cr-details', crs: crDetails.map(c => ({ id: c.id, summary: c.summary, type: c.type })) })}\n\n`));

                            const response = await fetch('http://127.0.0.1:11434/api/generate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ model: ollamaClient.getConfig().llmModel, prompt, stream: true, think: false }),
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
                                        if (json.response) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: json.response })}\n\n`));
                                        if (json.done) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                                    } catch (e) { /* skip */ }
                                }
                            }
                        } catch (e) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`));
                        }
                        controller.close();
                    }
                });
                return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
            }

            case 'heatmap': {
                // Get per-engineer weekly data for heatmap visualization
                const hmWeeks = parseInt(searchParams.get('weeks') || '12');
                const dashboard = await engMetrics.getOrgDashboard();
                if (!dashboard || !dashboard.engineers || dashboard.engineers.length === 0) {
                    data = { engineers: [], weeks: [] };
                    break;
                }
                const aliases = dashboard.engineers.map(e => e.alias);
                const compareData = await engMetrics.compareEngineers(aliases, hmWeeks);
                data = {
                    weekIds: compareData.weekIds,
                    engineers: Object.entries(compareData.engineers).map(([alias, info]) => ({
                        alias,
                        name: info.name,
                        team: info.team,
                        weeks: info.weeks,
                        totals: info.totals,
                    })),
                };
                break;
            }

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }

        return NextResponse.json({ view, data });
    } catch (error) {
        console.error('[API/EngMetrics] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}