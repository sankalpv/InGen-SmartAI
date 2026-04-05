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
              staleCrs: { value: 0, prev: 0 },
            },
            alerts: { staleCrs: 0, busFactorRisks: 0, busFactorDetails: [] },
            engineers: [],
            goalAlignment: [],
            totalEngineers: 0,
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
          return NextResponse.json(
            { error: 'At least 2 aliases required (comma-separated)' },
            { status: 400 }
          );
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
        const crIds = (detail?.recentCrs || []).map((cr) => cr.id).filter(Boolean);
        if (crIds.length === 0) {
          return NextResponse.json(
            { error: 'No CRs found for this engineer this week' },
            { status: 400 }
          );
        }

        const mcpClient = require('../../../services/mcp-client');
        const ollamaClient = require('../../../services/ollama-client');
        const bedrockClient = require('../../../services/bedrock-client');

        // Fetch CR details live from code.amazon.com
        const crUrls = crIds.slice(0, 10).map((id) => `https://code.amazon.com/reviews/${id}`);
        let crDetails = [];
        try {
          const result = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: crUrls,
            concurrencyLimit: 5,
          });
          const content = result?.content;
          if (Array.isArray(content)) {
            crDetails = content.map((c, i) => {
              try {
                const parsed =
                  typeof c === 'string' ? JSON.parse(c) : c.text ? JSON.parse(c.text) : c;
                const rev = parsed.revisionSummary || parsed.content?.revisionSummary || {};
                return {
                  id: crIds[i],
                  summary: rev.summary || '',
                  status: rev.status || '',
                  type: detail.recentCrs.find((cr) => cr.id === crIds[i])?.type || 'unknown',
                  description:
                    parsed.revisionDetails?.revision?.cr_revision?.description?.substring(0, 500) ||
                    '',
                  category: rev.category || '',
                  packages:
                    parsed.revisionDetails?.revision?.cr_revision?.packages?.map(
                      (p) => p.package?.name
                    ) || [],
                };
              } catch (e) {
                return { id: crIds[i], summary: crIds[i], type: 'unknown' };
              }
            });
          }
        } catch (e) {
          console.error('Failed to fetch CR details:', e.message);
          // Fall back to just CR IDs
          crDetails = crIds.map((id) => ({ id, summary: id, type: 'unknown' }));
        }

        // Build prompt
        const crSummaries = crDetails
          .map(
            (cr) =>
              `- ${cr.id} [${cr.type}] "${cr.summary}" (${cr.category || 'code'}) ${cr.description ? '— ' + cr.description.substring(0, 200) : ''}`
          )
          .join('\n');

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
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'cr-details', crs: crDetails.map((c) => ({ id: c.id, summary: c.summary, type: c.type })) })}\n\n`
                )
              );

              if (bedrockClient.isAvailable()) {
                // Bedrock streaming (AgentSpaces / Windows)
                await bedrockClient.streamGenerate(
                  prompt,
                  (chunk) => {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`)
                    );
                  },
                  { maxTokens: 2048 }
                );
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
              } else {
                // Ollama fallback (Mac)
                const ollamaBase = ollamaClient.getConfig().baseUrl || 'http://127.0.0.1:11434';
                const response = await fetch(`${ollamaBase}/api/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: ollamaClient.getConfig().llmModel,
                    prompt,
                    stream: true,
                    think: false,
                  }),
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
                      if (json.response)
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'chunk', text: json.response })}\n\n`
                          )
                        );
                      if (json.done)
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
                        );
                    } catch (e) {
                      /* skip */
                    }
                  }
                }
              }
            } catch (e) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`)
              );
            }
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      }

      case 'heatmap': {
        // Get per-engineer weekly data for heatmap visualization
        const hmWeeks = parseInt(searchParams.get('weeks') || '12');
        const dashboard = await engMetrics.getOrgDashboard();
        if (!dashboard || !dashboard.engineers || dashboard.engineers.length === 0) {
          data = { engineers: [], weeks: [] };
          break;
        }
        const aliases = dashboard.engineers.map((e) => e.alias);
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

      case 'view-root-alias': {
        const orgStore = require('../../../services/org-store');
        const rootAlias = await orgStore.getRootAlias();
        data = { rootAlias };
        break;
      }

      case 'view-as-org': {
        // Resolve 3-level org tree for any alias via phonetool (Root -> L7 -> L6 -> IC)
        if (!alias) {
          return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
        }
        const phonetool = require('../../../services/phonetool');
        const forceRefresh = searchParams.get('refresh') === '1';
        const tree = await phonetool.fetchOrgTree(alias, 3, forceRefresh);
        if (!tree) {
          return NextResponse.json(
            { error: `Could not resolve org for ${alias}` },
            { status: 404 }
          );
        }

        // Build: L7 managers (depth 1), L6 managers (depth 2), and leaf engineers
        const l7Managers = [];
        const flatAliases = [];
        const managerMap = {}; // alias → { managerAlias, managerName, l7Alias, l7Name }

        function isEngineer(title) {
          if (!title) return true; // Fallback if no title is provided, assume valid
          const t = title.toLowerCase();
          // Basic filter to exclude PM, EA, Manager (without software), etc
          const isManagerOnly =
            t.includes('manager') && !t.includes('software') && !t.includes('engineering');
          if (isManagerOnly) return false;
          return (
            t.includes('software') ||
            t.includes('sde') ||
            t.includes('engineer') ||
            t.includes('developer') ||
            t.includes('scientist')
          );
        }

        for (const l7 of tree.reports || []) {
          const l6Managers = [];
          for (const child of l7.reports || []) {
            if (child.reports && child.reports.length > 0) {
              // This is an L6 manager — its reports are ICs
              const icEngineers = child.reports
                .filter((ic) => isEngineer(ic.jobTitle))
                .map((ic) => {
                  flatAliases.push(ic.alias);
                  managerMap[ic.alias] = {
                    managerAlias: child.alias,
                    managerName: child.name,
                    l7Alias: l7.alias,
                    l7Name: l7.name,
                  };
                  return { alias: ic.alias, name: ic.name };
                });

              if (icEngineers.length > 0) {
                l6Managers.push({
                  alias: child.alias,
                  name: child.name,
                  jobTitle: child.jobTitle,
                  level: child.level,
                  engineers: icEngineers,
                });
              }
            } else {
              // IC directly under L7
              if (isEngineer(child.jobTitle)) {
                flatAliases.push(child.alias);
                managerMap[child.alias] = {
                  managerAlias: l7.alias,
                  managerName: l7.name,
                  l7Alias: l7.alias,
                  l7Name: l7.name,
                };
              }
            }
          }

          const directEngineers = (l7.reports || [])
            .filter((c) => !c.reports || c.reports.length === 0)
            .filter((c) => isEngineer(c.jobTitle))
            .map((c) => ({ alias: c.alias, name: c.name }));

          if (l6Managers.length > 0 || directEngineers.length > 0) {
            l7Managers.push({
              alias: l7.alias,
              name: l7.name,
              jobTitle: l7.jobTitle,
              level: l7.level,
              l6Managers,
              directICs: directEngineers,
            });
          }
        }

        data = {
          rootAlias: alias,
          rootName: tree.name,
          l7Managers,
          flatAliases,
          managerMap,
          totalEngineers: flatAliases.length,
        };
        break;
      }

      case 'view-as-dashboard': {
        if (!alias) {
          return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
        }
        // Expects aliases and managerMap as JSON in query params (or re-resolve)
        const aliasesParam = searchParams.get('aliases');
        const managerMapParam = searchParams.get('managerMap');
        const weekId2 = searchParams.get('weekId') || null;

        if (!aliasesParam) {
          return NextResponse.json(
            { error: 'aliases parameter required (JSON array)' },
            { status: 400 }
          );
        }

        const aliasList = JSON.parse(aliasesParam);
        const mgrMap = managerMapParam ? JSON.parse(managerMapParam) : {};
        data = await engMetrics.getOrgDashboardForAliases(aliasList, mgrMap, weekId2);
        break;
      }

      case 'view-as-backfill': {
        if (!alias) {
          return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
        }
        const aliasesParam2 = searchParams.get('aliases');
        const memberMapParam2 = searchParams.get('memberMap');
        const bfYear = parseInt(searchParams.get('year') || new Date().getFullYear());

        if (!aliasesParam2) {
          return NextResponse.json({ error: 'aliases parameter required' }, { status: 400 });
        }

        const aliasList2 = JSON.parse(aliasesParam2);
        const memberMap2 = memberMapParam2 ? JSON.parse(memberMapParam2) : {};

        if (engMetrics.getBackfillStatus().running) {
          data = { status: 'already_running', ...engMetrics.getBackfillStatus() };
        } else {
          // Fire and forget
          engMetrics.backfillForAliases(aliasList2, memberMap2, bfYear).catch((err) => {
            console.error('[API/EngMetrics] View As backfill error:', err.message);
          });
          data = {
            status: 'started',
            message: `Backfill started for ${aliasList2.length} engineers, ${bfYear}`,
          };
        }
        break;
      }

      case 'view-as-refresh': {
        // Fetch current week data for specific aliases
        if (!alias) {
          return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
        }
        const aliasesParam3 = searchParams.get('aliases');
        const memberMapParam3 = searchParams.get('memberMap');

        if (!aliasesParam3) {
          return NextResponse.json({ error: 'aliases parameter required' }, { status: 400 });
        }

        const aliasList3 = JSON.parse(aliasesParam3);
        const memberMap3 = memberMapParam3 ? JSON.parse(memberMapParam3) : {};
        data = await engMetrics.fetchMetricsForAliases(aliasList3, memberMap3);
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
