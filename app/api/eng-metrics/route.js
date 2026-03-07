import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const engMetrics = require('../../../services/eng-metrics');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'dashboard';
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

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }

        return NextResponse.json({ view, data });
    } catch (error) {
        console.error('[API/EngMetrics] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}