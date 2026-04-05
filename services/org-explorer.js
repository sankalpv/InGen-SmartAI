const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('OrgExplorer');

// Import data fetchers from main eng-metrics to stay DRY
const engMetrics = require('./eng-metrics');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'org-explorer.sqlite');
let db = null;

async function init() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS org_explorer_weekly (
                    alias TEXT,
                    name TEXT,
                    team TEXT,
                    week_id TEXT,
                    crs_created INTEGER DEFAULT 0,
                    crs_reviewed INTEGER DEFAULT 0,
                    lines_added INTEGER DEFAULT 0,
                    lines_removed INTEGER DEFAULT 0,
                    lines_changed INTEGER DEFAULT 0,
                    avg_turnaround_hours REAL DEFAULT 0,
                    stale_crs INTEGER DEFAULT 0,
                    packages_json TEXT,
                    cr_details_json TEXT,
                    fetched_at TEXT,
                    PRIMARY KEY (alias, week_id)
                )`);
        resolve(db);
      });
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── Fetching Logic ───
async function fetchMetricsForAliases(aliases, memberMap = {}, weekId = null) {
  await init();
  const currentWeekId = weekId || engMetrics.getWeekId();
  const dateRange = engMetrics.getWeekDateRange(currentWeekId);

  logger.info(
    `Fetching metrics for ${aliases.length} aliases (Org Explorer), week ${currentWeekId}`
  );
  const batchedResults = await engMetrics.fetchOrgCodeActivityBatched(
    aliases,
    dateRange.start,
    dateRange.end
  );

  const now = new Date().toISOString();
  let stored = 0;
  for (const alias of aliases) {
    const activity = batchedResults[alias] || {
      crs_created: 0,
      crs_reviewed: 0,
      lines_added: 0,
      lines_removed: 0,
      lines_changed: 0,
      avg_turnaround_hours: 0,
      stale_crs: 0,
      packages: [],
      cr_details: [],
    };
    const member = memberMap[alias] || { name: alias, team: '' };

    await dbRun(
      `
            INSERT OR REPLACE INTO org_explorer_weekly 
            (alias, name, team, week_id, crs_created, crs_reviewed, lines_added, lines_removed, lines_changed, avg_turnaround_hours, stale_crs, packages_json, cr_details_json, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      [
        alias,
        member.name,
        member.team || member.managerAlias || '',
        currentWeekId,
        activity.crs_created,
        activity.crs_reviewed,
        activity.lines_added,
        activity.lines_removed,
        activity.lines_changed,
        activity.avg_turnaround_hours,
        activity.stale_crs,
        JSON.stringify(activity.packages),
        JSON.stringify(activity.cr_details),
        now,
      ]
    );
    stored++;
  }

  return { weekId: currentWeekId, dateRange, fetchedCount: stored };
}

async function getOrgDashboardForAliases(
  aliases,
  managerMap = {},
  weekId = null,
  includeHistory = false
) {
  await init();
  const currentWeekId = weekId || engMetrics.getWeekId();

  const placeholders = aliases.map(() => '?').join(',');

  let query = '';
  let params = [];
  if (includeHistory) {
    query = `SELECT * FROM org_explorer_weekly WHERE alias IN (${placeholders}) ORDER BY week_id DESC`;
    params = [...aliases];
  } else {
    query = `SELECT * FROM org_explorer_weekly WHERE week_id = ? AND alias IN (${placeholders})`;
    params = [currentWeekId, ...aliases];
  }

  const rows = await dbAll(query, params);

  let mappedEngineers = [];
  const historyByAlias = {};

  if (includeHistory) {
    // Find the most recent 12 unique weeks available in the result set
    const uniqueWeeks = [...new Set(rows.map((r) => r.week_id))].sort().reverse().slice(0, 12);
    const validRows = rows.filter((r) => uniqueWeeks.includes(r.week_id));
    const currentRows = validRows.filter((r) => r.week_id === currentWeekId);

    validRows.forEach((r) => {
      if (!historyByAlias[r.alias]) historyByAlias[r.alias] = [];
      historyByAlias[r.alias].push({
        weekId: r.week_id,
        crsCreated: r.crs_created || 0,
        crsReviewed: r.crs_reviewed || 0,
      });
    });

    // Map every requested alias so their history is available even if they have 0 for current week
    mappedEngineers = aliases.map((alias) => {
      const cRow = currentRows.find((r) => r.alias === alias) || {};
      return {
        alias,
        name: cRow.name || managerMap[alias]?.name || alias,
        crsCreated: cRow.crs_created || 0,
        crsReviewed: cRow.crs_reviewed || 0,
        managerAlias: managerMap[alias]?.managerAlias,
        l7Alias: managerMap[alias]?.l7Alias,
        history: historyByAlias[alias] || [],
      };
    });
  } else {
    mappedEngineers = rows.map((e) => ({
      ...e,
      crsCreated: e.crs_created || 0,
      crsReviewed: e.crs_reviewed || 0,
      managerAlias: managerMap[e.alias]?.managerAlias,
      l7Alias: managerMap[e.alias]?.l7Alias,
    }));
  }

  return {
    weekId: currentWeekId,
    engineers: mappedEngineers,
    totalEngineers: mappedEngineers.length,
    totalCrsCreated: mappedEngineers.reduce((acc, sum) => acc + (sum.crsCreated || 0), 0),
    totalCrsReviewed: mappedEngineers.reduce((acc, sum) => acc + (sum.crsReviewed || 0), 0),
  };
}

let backfillState = {
  running: false,
  originalAlias: null,
  totalWeeks: 0,
  completedWeeks: 0,
  currentWeek: null,
  currentPhase: null, // 'starting', 'fetching', 'storing', 'done'
  result: null,
  error: null,
  cancelRequested: false,
};

async function backfillForAliases(aliases, memberMap, year) {
  await init();
  if (backfillState.running) {
    throw new Error('A backfill is already running.');
  }

  backfillState = {
    running: true,
    originalAlias: null,
    totalEngineers: aliases.length,
    totalWeeks: 0,
    completedWeeks: 0,
    currentWeek: null,
    currentPhase: 'starting',
    result: null,
    error: null,
    cancelRequested: false,
  };

  const allWeekIds = engMetrics.getYearWeekIds(year);
  const missingWeeks = [];

  // Check which weeks are missing
  for (const wid of allWeekIds) {
    const placeholders = aliases.map(() => '?').join(',');
    const rows = await dbAll(
      `SELECT alias FROM org_explorer_weekly WHERE week_id = ? AND alias IN (${placeholders})`,
      [wid, ...aliases]
    );
    // Simple heuristic: if we have NO rows for this week for any of the aliases, it's missing
    if (rows.length === 0) {
      missingWeeks.push(wid);
    }
  }

  if (missingWeeks.length === 0) {
    backfillState.running = false;
    backfillState.currentPhase = 'done';
    backfillState.result = { missingWeeks: 0, totalFetches: 0 };
    return backfillState.result;
  }

  backfillState.totalWeeks = missingWeeks.length;

  // Fire and forget
  _runBackfillForAliases(aliases, memberMap, missingWeeks).catch((e) => {
    logger.error(`Org Explorer Backfill failed: ${e.message}`);
    backfillState.error = e.message;
    backfillState.running = false;
  });

  return {
    started: true,
    details: `Background backfill started for ${missingWeeks.length} weeks.`,
  };
}

async function _runBackfillForAliases(aliases, memberMap, missingWeeks) {
  const result = { totalFetches: 0, weeksProcessed: [] };

  for (const wid of missingWeeks) {
    if (backfillState.cancelRequested) break;

    backfillState.currentWeek = wid;
    backfillState.currentPhase = 'fetching';

    try {
      await fetchMetricsForAliases(aliases, memberMap, wid);
      result.totalFetches += aliases.length;
      result.weeksProcessed.push(wid);
      backfillState.completedWeeks++;
    } catch (e) {
      logger.warn(`Failed to backfill week ${wid}: ${e.message}`);
    }
  }

  backfillState.running = false;
  backfillState.result = result;
  backfillState.currentPhase = 'done';

  logger.info(
    `Org Explorer backfill complete: ${result.totalFetches} records across ${missingWeeks.length} weeks`
  );
  return result;
}

function getBackfillStatus() {
  return backfillState;
}

function cancelBackfill() {
  if (backfillState.running) {
    backfillState.cancelRequested = true;
  }
  return { canceled: backfillState.cancelRequested };
}

module.exports = {
  init,
  fetchMetricsForAliases,
  getOrgDashboardForAliases,
  backfillForAliases,
  getBackfillStatus,
  cancelBackfill,
};
