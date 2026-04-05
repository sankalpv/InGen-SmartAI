import { NextResponse } from 'next/server';
// Force HMR reload to apply eng-metrics.js rate-limit hotfix

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'dashboard';
  const alias = searchParams.get('alias') || '';

  // Lazy load the isolated org explorer service
  const orgExplorer = require('../../../services/org-explorer');

  try {
    let data = {};

    switch (view) {
      case 'resolve-org': {
        // Resolve 3-level org tree via phonetool (Root -> L7 -> L6 -> IC)
        if (!alias) {
          return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
        }

        const phonetool = require('../../../services/phonetool');
        logger.info(`View As (Org Explorer): Resolving org tree for ${alias} (depth=3)`);
        const tree = await phonetool.fetchOrgTree(alias, 3, false).catch(() => null);

        if (!tree || !tree.reports) {
          data = { error: `Could not resolve org tree for ${alias}` };
          break;
        }

        // Strictly filter engineering job families but allow tree traversal for general leadership
        function isEngineeringTree(title) {
          if (!title) return true; // Keep if unspecified
          const t = title.toLowerCase();

          // Exclude non-engineering roles entirely to prune bad branches early
          if (
            t.includes('product manager') ||
            t.includes('technical program') ||
            t.includes('tpm') ||
            t.includes('product mgmt') ||
            t.includes('product mgr') ||
            t.includes('pm-t')
          )
            return false;
          if (t.includes('executive assistant') || t.includes('ea ')) return false;
          if (
            t.includes('recruiter') ||
            t.includes('hr ') ||
            t.includes('finance') ||
            t.includes('legal')
          )
            return false;

          // Allow broad leadership titles through; they will naturally be pruned later if they have no engineering reports
          if (
            t.includes('director') ||
            t.includes('vice president') ||
            t.includes('vp') ||
            t.includes('principal')
          ) {
            return true;
          }

          // Any title containing strong engineering keywords is passed
          if (
            t.includes('software') ||
            t.includes('sde') ||
            t.includes('engineer') ||
            t.includes('developer') ||
            t.includes('scientist') ||
            t.includes('applied sci') ||
            t.includes('science') ||
            t.includes('sdm')
          ) {
            return true;
          }

          // Default deny for unknown or generic titles that aren't engineering
          return false;
        }

        const l7Managers = [];
        const flatAliases = [];
        const managerMap = {}; // alias → { managerAlias, managerName, l7Alias, l7Name }

        for (const l7 of tree.reports || []) {
          if (!isEngineeringTree(l7.jobTitle)) continue;

          const l6Managers = [];
          for (const child of l7.reports || []) {
            if (child.reports && child.reports.length > 0) {
              // This is an L6 manager
              if (!isEngineeringTree(child.jobTitle)) continue;

              const icEngineers = child.reports
                .filter((ic) => isEngineeringTree(ic.jobTitle))
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
              if (isEngineeringTree(child.jobTitle)) {
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
            .filter((c) => isEngineeringTree(c.jobTitle))
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
          rootAlias: tree.alias,
          rootName: tree.name || tree.alias,
          totalEngineers: flatAliases.length,
          l7Managers,
          flatAliases,
          managerMap,
        };
        break;
      }

      case 'dashboard': {
        const payloadStr = searchParams.get('payload');
        if (!payloadStr) {
          return NextResponse.json({ error: 'payload required' }, { status: 400 });
        }
        const payload = JSON.parse(decodeURIComponent(payloadStr));
        const { flatAliases, managerMap, weekId } = payload;
        if (!flatAliases || flatAliases.length === 0) {
          return NextResponse.json({ error: 'No aliases provided' }, { status: 400 });
        }

        data = await orgExplorer.getOrgDashboardForAliases(flatAliases, managerMap, weekId || null);
        break;
      }

      case 'backfill': {
        const payloadStr = searchParams.get('payload');
        if (!payloadStr) {
          return NextResponse.json({ error: 'payload required' }, { status: 400 });
        }
        const payload = JSON.parse(decodeURIComponent(payloadStr));
        const { flatAliases, managerMap, year } = payload;
        const targetYear = parseInt(year) || new Date().getFullYear();

        data = await orgExplorer.backfillForAliases(flatAliases, managerMap, targetYear);
        break;
      }

      case 'refresh': {
        // Fetch metrics for a specific set of aliases for the current week
        const payloadStr = searchParams.get('payload');
        if (!payloadStr) {
          return NextResponse.json({ error: 'payload required' }, { status: 400 });
        }
        const payload = JSON.parse(decodeURIComponent(payloadStr));
        const { flatAliases, managerMap, weekId } = payload;

        data = await orgExplorer.fetchMetricsForAliases(flatAliases, managerMap, weekId || null);
        break;
      }

      case 'backfill-status': {
        data = orgExplorer.getBackfillStatus();
        break;
      }

      case 'cancel-backfill': {
        data = orgExplorer.cancelBackfill();
        break;
      }

      default:
        data = { error: 'Unknown view' };
    }

    return NextResponse.json({ data });
  } catch (error) {
    logger.error(`Org Explorer API error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const orgExplorer = require('../../../services/org-explorer');
  try {
    const body = await request.json();
    const { view, payload } = body;
    let data = {};

    switch (view) {
      case 'dashboard': {
        const { flatAliases, managerMap, weekId, history } = payload;
        if (!flatAliases || flatAliases.length === 0) {
          return NextResponse.json({ error: 'No aliases provided' }, { status: 400 });
        }
        data = await orgExplorer.getOrgDashboardForAliases(
          flatAliases,
          managerMap,
          weekId || null,
          history === true
        );
        break;
      }
      case 'backfill': {
        const { flatAliases, managerMap, year } = payload;
        const targetYear = parseInt(year) || new Date().getFullYear();
        data = await orgExplorer.backfillForAliases(flatAliases, managerMap, targetYear);
        break;
      }
      case 'refresh': {
        const { flatAliases, managerMap, weekId } = payload;
        data = await orgExplorer.fetchMetricsForAliases(flatAliases, managerMap, weekId || null);
        break;
      }
      default:
        data = { error: 'Unknown view' };
    }
    return NextResponse.json({ data });
  } catch (error) {
    logger.error(`Org Explorer POST API error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
