import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const issuesStore = require('../../../services/issues-store');
const issuesParser = require('../../../services/issues-parser');
const localStore = require('../../../services/local-store');
const phonetool = require('../../../services/phonetool');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Auto-parse: If raw Issues JSON exists but SQLite is empty, parse automatically.
 * This ensures Team Pulse works even when background-agent isn't running (e.g., npm run dev).
 */
async function ensureIssuesParsed() {
    const stats = await issuesStore.getStats();
    if (stats.totalIssues > 0) return; // SQLite already has data

    const cached = localStore.getIssues();
    if (!cached.exists || !cached.data || cached.data.length === 0) return; // No raw data either

    console.log(`[API/Issues] Auto-parsing ${cached.data.length} raw Issues emails into SQLite...`);
    const parseResult = await issuesParser.parseIssueEmails(cached.data);
    console.log(`[API/Issues] Auto-parse complete: ${parseResult.parsed} issues, ${parseResult.activitiesAdded} activities`);
    
    await issuesParser.classifyActivities();
}

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'open';
        const days = parseInt(searchParams.get('days') || '7');
        const person = searchParams.get('person');
        const issueId = searchParams.get('issueId');
        const resolveNames = searchParams.get('resolveNames') === 'true';

        await issuesStore.init();
        
        // Auto-parse raw JSON → SQLite if DB is empty but raw data exists
        await ensureIssuesParsed();

        let data;

        switch (view) {
            case 'open':
                data = await issuesStore.getOpenIssues(days);
                break;

            case 'aging':
                const minDays = parseInt(searchParams.get('minDays') || '7');
                data = await issuesStore.getAgingIssues(minDays);
                break;

            case 'sla':
                data = await issuesStore.getSlaViolations(days);
                break;

            case 'deps':
                data = await issuesStore.getCrossTeamDependencies();
                break;

            case 'people':
                if (person) {
                    data = {
                        activities: await issuesStore.getPersonActivities(person, days),
                        summary: await issuesStore.getPersonSummary(person)
                    };
                } else {
                    data = {
                        activitySummary: await issuesStore.getPersonActivitySummary(days),
                        breakdown: await issuesStore.getPersonActivityBreakdown(days),
                        summaries: await issuesStore.getPersonSummaries()
                    };
                }
                break;

            case 'owners':
                if (person) {
                    // Get all issues owned by this person
                    data = {
                        issues: await issuesStore.getOwnerIssues(person, days),
                        activities: await issuesStore.getPersonActivities(person, days),
                        summary: await issuesStore.getPersonSummary(person)
                    };
                } else {
                    // Get all owners with their issue counts
                    const owners = await issuesStore.getIssuesByOwner(days);
                    const ownerBreakdown = await issuesStore.getOwnerActivityBreakdown(days);
                    const combined = await issuesStore.getCombinedPeopleSummary(days);
                    
                    // Resolve names if requested
                    let names = {};
                    if (resolveNames) {
                        const aliases = combined
                            .map(p => p.person)
                            .filter(a => {
                                if (!a || a === 'system' || a === 'unknown') return false;
                                // Skip non-person aliases (robot accounts, tools, apps)
                                if (a.includes('-') && a.split('-').length >= 3) return false;
                                if (/^(nobody|noreply|do-not-reply|mailer|robot|auto|aws|amazon)$/i.test(a)) return false;
                                // Must look like a valid person alias (letters, maybe digits, 2-20 chars)
                                if (!/^[a-zA-Z][a-zA-Z0-9]{1,19}$/.test(a)) return false;
                                return true;
                            });
                        names = await phonetool.fetchPersonNames(aliases);
                    }
                    
                    data = { owners, ownerBreakdown, combined, names };
                }
                break;

            case 'names': {
                // Resolve aliases to full names
                const nameAliases = searchParams.get('aliases');
                if (!nameAliases) {
                    return NextResponse.json({ error: 'aliases parameter required' }, { status: 400 });
                }
                const aliasList = nameAliases.split(',').map(a => a.trim()).filter(Boolean);
                data = await phonetool.fetchPersonNames(aliasList);
                break;
            }

            case 'timeline':
                if (!issueId) {
                    return NextResponse.json({ error: 'issueId parameter required for timeline view' }, { status: 400 });
                }
                data = await issuesStore.getIssueTimeline(issueId);
                break;

            case 'types':
                data = await issuesStore.getIssuesByType(days);
                break;

            case 'velocity':
                const weeks = parseInt(searchParams.get('weeks') || '4');
                data = await issuesStore.getWeeklyVelocity(weeks);
                break;

            case 'stats':
                data = await issuesStore.getStats(days);
                const cached = localStore.getIssues();
                data.rawCache = {
                    exists: cached.exists,
                    count: cached.data ? cached.data.length : 0,
                    ageMinutes: cached.ageMinutes,
                    updatedAt: cached.updatedAt
                };
                break;

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }

        return NextResponse.json({ view, days, data, source: 'sqlite' });

    } catch (error) {
        console.error('[API/Issues] Error:', error);
        return NextResponse.json(
            { error: `Failed to fetch issues: ${error.message}` },
            { status: 500 }
        );
    }
}

/**
 * POST /api/issues — Manual sync trigger
 * 1. Triggers fullSync() to fetch fresh data from Outlook (including Issues folder)
 * 2. Parses the raw Issues JSON into SQLite
 * 3. Classifies activities
 */
export async function POST(request) {
    try {
        console.log('[API/Issues] Manual sync triggered');
        
        // Step 1: Full sync from Outlook (fetches Inbox + Calendar + Issues folder)
        const syncResult = await localStore.fullSync();
        
        // Step 2: Parse Issues into SQLite
        await issuesStore.init();
        const cached = localStore.getIssues();
        let parseResult = { parsed: 0, newIssues: 0, activitiesAdded: 0 };
        
        if (cached.exists && cached.data && cached.data.length > 0) {
            parseResult = await issuesParser.parseIssueEmails(cached.data);
            await issuesParser.classifyActivities();
        }
        
        // Step 3: Return results
        const stats = await issuesStore.getStats();
        
        return NextResponse.json({
            success: true,
            sync: {
                emails: syncResult.emails || 0,
                calendar: syncResult.calendar || 0,
                issues: syncResult.issues || 0,
                elapsed: syncResult.elapsed || 0
            },
            parse: {
                parsed: parseResult.parsed,
                newIssues: parseResult.newIssues,
                activitiesAdded: parseResult.activitiesAdded
            },
            stats
        });
        
    } catch (error) {
        console.error('[API/Issues] Manual sync error:', error);
        return NextResponse.json(
            { error: `Sync failed: ${error.message}` },
            { status: 500 }
        );
    }
}