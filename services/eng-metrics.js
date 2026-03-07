/**
 * Engineering Metrics Service
 * 
 * Fetches per-engineer code review metrics from code.amazon.com via amzn-mcp,
 * stores weekly snapshots in SQLite for trending, and provides aggregated
 * org-level dashboards.
 * 
 * Data sources:
 * - amzn-mcp → search_internal_code (type: 'user') for per-engineer CR activity
 * - org-store.js for engineer roster (populated from Phonetool)
 * - wbr-report.js for goal cross-referencing
 * 
 * Storage: data/eng-metrics.db (SQLite, 52-week retention)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('EngMetrics');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'eng-metrics.db');

let db = null;

// ─── Backfill Progress State (in-memory) ───
let backfillState = {
    running: false,
    cancelled: false,
    startedAt: null,
    currentWeek: null,
    currentPhase: null,  // 'commits' | 'crs-created' | 'crs-reviewed' | 'storing'
    completedWeeks: 0,
    totalWeeks: 0,
    totalEngineers: 0,
    weekStatuses: {},    // { 'W01': 'done', 'W02': 'running', 'W03': 'pending' }
    error: null,
    result: null,
};

function getBackfillStatus() {
    return { ...backfillState };
}

function cancelBackfill() {
    if (backfillState.running) {
        backfillState.cancelled = true;
        return true;
    }
    return false;
}

// ─── Schema ───

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS eng_metrics_weekly (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    alias           TEXT NOT NULL,
    name            TEXT,
    team            TEXT,
    week_id         TEXT NOT NULL,
    crs_created     INTEGER DEFAULT 0,
    crs_reviewed    INTEGER DEFAULT 0,
    lines_added     INTEGER DEFAULT 0,
    lines_removed   INTEGER DEFAULT 0,
    lines_changed   INTEGER DEFAULT 0,
    avg_turnaround_hours REAL DEFAULT 0,
    stale_crs       INTEGER DEFAULT 0,
    packages_json   TEXT DEFAULT '[]',
    cr_details_json TEXT DEFAULT '[]',
    fetched_at      TEXT NOT NULL,
    UNIQUE(alias, week_id)
);

CREATE TABLE IF NOT EXISTS eng_metrics_meta (
    key     TEXT PRIMARY KEY,
    value   TEXT
);

CREATE TABLE IF NOT EXISTS eng_bus_factor (
    package_name    TEXT NOT NULL,
    sole_committer  TEXT NOT NULL,
    last_commit_date TEXT,
    week_id         TEXT NOT NULL,
    UNIQUE(package_name, week_id)
);

CREATE TABLE IF NOT EXISTS eng_goal_alignment (
    goal_id         TEXT NOT NULL,
    goal_title      TEXT,
    cr_count        INTEGER DEFAULT 0,
    lines_changed   INTEGER DEFAULT 0,
    engineers_json  TEXT DEFAULT '[]',
    week_id         TEXT NOT NULL,
    status          TEXT DEFAULT 'Active',
    UNIQUE(goal_id, week_id)
);

CREATE INDEX IF NOT EXISTS idx_eng_metrics_alias ON eng_metrics_weekly(alias);
CREATE INDEX IF NOT EXISTS idx_eng_metrics_week ON eng_metrics_weekly(week_id);
CREATE INDEX IF NOT EXISTS idx_eng_bus_week ON eng_bus_factor(week_id);
CREATE INDEX IF NOT EXISTS idx_eng_goal_week ON eng_goal_alignment(week_id);
`;

// ─── Init ───

function init() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) { logger.error('Failed to open eng-metrics database:', err.message); return reject(err); }
            db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;', () => {
                db.exec(SCHEMA_SQL, (err) => {
                    if (err) { logger.error('Failed to create eng-metrics schema:', err.message); return reject(err); }
                    logger.info('Engineering metrics database initialized');
                    resolve(db);
                });
            });
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes }); });
    });
}
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
    });
}
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows || []); });
    });
}

// ─── Helpers ───

/**
 * Get the ISO week ID (e.g. "2026-W10") for a date
 */
function getWeekId(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Get date range for a week ID
 */
function getWeekDateRange(weekId) {
    const [year, weekStr] = weekId.split('-W');
    const weekNum = parseInt(weekStr);
    const jan4 = new Date(parseInt(year), 0, 4);
    const startOfWeek = new Date(jan4);
    startOfWeek.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (weekNum - 1) * 7);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    return {
        start: startOfWeek.toISOString().split('T')[0],
        end: endOfWeek.toISOString().split('T')[0]
    };
}

// ─── Fetch Metrics from code.amazon.com via builder-mcp ───

/**
 * Parse content from builder-mcp ReadInternalWebsites response
 */
function parseMcpContent(result) {
    const content = result?.content;
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const textItem = content.find(c => c.type === 'text');
        return textItem?.text || '';
    }
    if (content.content) return typeof content.content === 'string' ? content.content : JSON.stringify(content.content);
    return JSON.stringify(content);
}

/**
 * Fetch code review metrics for a single engineer using builder-mcp
 * Uses 3 structured code.amazon.com endpoints for reliable data
 */
async function fetchEngineerCodeActivity(alias, startDate, endDate) {
    const mcpClient = require('./mcp-client');
    const metrics = {
        crs_created: 0,
        crs_reviewed: 0,
        lines_added: 0,
        lines_removed: 0,
        lines_changed: 0,
        avg_turnaround_hours: 0,
        stale_crs: 0,
        packages: [],
        cr_details: []
    };

    const packageSet = new Set();
    const now = new Date();
    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

    try {
        // ── 1. Commits authored (lines changed, packages) ──
        const commitsUrl = `https://code.amazon.com/api/asci/changes_for_user?user=${alias}&from_date=${startDate}&to_date=${endDate}`;
        const commitsResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: [commitsUrl]
        });
        const commitsText = parseMcpContent(commitsResult);

        // Parse JSON array of commits
        try {
            const jsonMatch = commitsText.match(/```\n?([\s\S]*?)\n?```/) || [null, commitsText];
            let commitsJson = jsonMatch[1] || commitsText;
            // Try to find JSON array in the text
            const arrStart = commitsJson.indexOf('[');
            const arrEnd = commitsJson.lastIndexOf(']');
            if (arrStart !== -1 && arrEnd !== -1) {
                commitsJson = commitsJson.substring(arrStart, arrEnd + 1);
                const commits = JSON.parse(commitsJson);
                if (Array.isArray(commits)) {
                    for (const commit of commits) {
                        const totalChanges = commit.total_changes || 0;
                        metrics.lines_changed += totalChanges;
                        metrics.lines_added += Math.round(totalChanges * 0.65);
                        metrics.lines_removed += Math.round(totalChanges * 0.35);
                        if (commit.package_name) packageSet.add(commit.package_name);
                    }
                }
            }
        } catch (e) {
            logger.debug(`Could not parse commits JSON for ${alias}: ${e.message}`);
        }

        // Small delay between API calls
        await new Promise(r => setTimeout(r, 200));

        // ── 2. CRs submitted by engineer ──
        const crsFromUrl = `https://code.amazon.com/reviews/from-user/${alias}?shipped=true&open=true&pending=true&start_time=${startDate}&end_time=${endDate}`;
        const crsFromResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: [crsFromUrl]
        });
        const crsFromText = parseMcpContent(crsFromResult);

        // Parse CR table — deduplicate CR IDs
        const crFromMatches = crsFromText.match(/CR-(\d+)/g) || [];
        const uniqueFromCrs = [...new Set(crFromMatches)];
        metrics.crs_created = uniqueFromCrs.length;

        // Extract cr_count from metadata (most reliable source)
        const crCountMatch = crsFromText.match(/"cr_count"\s*:\s*"?\((\d+)\)"?/);
        if (crCountMatch) {
            metrics.crs_created = parseInt(crCountMatch[1]);
        }

        // Extract CR details for goal alignment
        for (const crId of uniqueFromCrs) {
            metrics.cr_details.push({ id: crId, type: 'created', snippet: '' });
        }

        // Stale CRs are calculated at org level, not per-engineer

        await new Promise(r => setTimeout(r, 200));

        // ── 3. CRs reviewed (sent to engineer) ──
        const crsToUrl = `https://code.amazon.com/reviews/to-user/${alias}?shipped=true&open=true&pending=true&start_time=${startDate}&end_time=${endDate}`;
        const crsToResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: [crsToUrl]
        });
        const crsToText = parseMcpContent(crsToResult);

        // Parse reviewed CRs — deduplicate
        const crToMatches = crsToText.match(/CR-(\d+)/g) || [];
        const uniqueToCrs = [...new Set(crToMatches)];
        metrics.crs_reviewed = uniqueToCrs.length;

        // Use metadata count as primary (most reliable)
        const crToCountMatch = crsToText.match(/"cr_count"\s*:\s*"?\((\d+)\)"?/);
        if (crToCountMatch) {
            metrics.crs_reviewed = parseInt(crToCountMatch[1]);
        }

        // Add reviewed CRs to details
        for (const crId of uniqueToCrs) {
            metrics.cr_details.push({ id: crId, type: 'reviewed', snippet: '' });
        }

    } catch (error) {
        logger.warn(`Failed to fetch code activity for ${alias}: ${error.message}`);
    }

    metrics.packages = Array.from(packageSet);
    return metrics;
}

// ─── Batched Org Fetch (7x faster) ───

/**
 * Fetch code activity for ALL engineers in one batched call per data type.
 * Uses ReadInternalWebsites with multiple URLs in the inputs array.
 * 3 MCP calls instead of 111 (37 engineers × 3 endpoints).
 */
async function fetchOrgCodeActivityBatched(aliases, startDate, endDate) {
    const mcpClient = require('./mcp-client');
    const results = {};
    for (const alias of aliases) {
        results[alias] = {
            crs_created: 0, crs_reviewed: 0,
            lines_added: 0, lines_removed: 0, lines_changed: 0,
            avg_turnaround_hours: 0, stale_crs: 0,
            packages: [], cr_details: []
        };
    }

    const now = new Date();
    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);

    try {
        // ── Batch 1: Commits for all engineers ──
        const commitUrls = aliases.map(a =>
            `https://code.amazon.com/api/asci/changes_for_user?user=${a}&from_date=${startDate}&to_date=${endDate}`
        );
        logger.info(`Fetching commits for ${aliases.length} engineers in 1 batched call...`);
        const commitsResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: commitUrls,
            concurrencyLimit: 10
        });

        // Parse batched response — builder-mcp returns multiple content blocks
        const commitsContent = commitsResult?.content;
        if (Array.isArray(commitsContent)) {
            for (let idx = 0; idx < commitsContent.length && idx < aliases.length; idx++) {
                const alias = aliases[idx];
                const text = commitsContent[idx]?.text || commitsContent[idx]?.content || '';
                const textStr = typeof text === 'string' ? text : JSON.stringify(text);
                try {
                    const arrStart = textStr.indexOf('[');
                    const arrEnd = textStr.lastIndexOf(']');
                    if (arrStart !== -1 && arrEnd !== -1) {
                        const commits = JSON.parse(textStr.substring(arrStart, arrEnd + 1));
                        if (Array.isArray(commits)) {
                            const pkgSet = new Set();
                            for (const c of commits) {
                                const tc = c.total_changes || 0;
                                results[alias].lines_changed += tc;
                                results[alias].lines_added += Math.round(tc * 0.65);
                                results[alias].lines_removed += Math.round(tc * 0.35);
                                if (c.package_name) pkgSet.add(c.package_name);
                            }
                            results[alias].packages = Array.from(pkgSet);
                        }
                    }
                } catch (e) { /* skip parse error for this alias */ }
            }
        } else {
            // Single content block — try parsing as single engineer (fallback)
            const text = parseMcpContent(commitsResult);
            if (aliases.length === 1) {
                try {
                    const arrStart = text.indexOf('[');
                    const arrEnd = text.lastIndexOf(']');
                    if (arrStart !== -1 && arrEnd !== -1) {
                        const commits = JSON.parse(text.substring(arrStart, arrEnd + 1));
                        if (Array.isArray(commits)) {
                            for (const c of commits) {
                                const tc = c.total_changes || 0;
                                results[aliases[0]].lines_changed += tc;
                                results[aliases[0]].lines_added += Math.round(tc * 0.65);
                                results[aliases[0]].lines_removed += Math.round(tc * 0.35);
                                if (c.package_name) results[aliases[0]].packages.push(c.package_name);
                            }
                        }
                    }
                } catch (e) { /* skip */ }
            }
        }

        await new Promise(r => setTimeout(r, 500));

        // ── Batch 2: CRs created (from-user) for all engineers ──
        const fromUrls = aliases.map(a =>
            `https://code.amazon.com/reviews/from-user/${a}?shipped=true&open=true&pending=true&start_time=${startDate}&end_time=${endDate}`
        );
        logger.info(`Fetching CRs-created for ${aliases.length} engineers in 1 batched call...`);
        const fromResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: fromUrls,
            concurrencyLimit: 10
        });

        const fromContent = fromResult?.content;
        if (Array.isArray(fromContent)) {
            for (let idx = 0; idx < fromContent.length && idx < aliases.length; idx++) {
                const alias = aliases[idx];
                const text = fromContent[idx]?.text || fromContent[idx]?.content || '';
                const textStr = typeof text === 'string' ? text : JSON.stringify(text);
                const crMatches = textStr.match(/CR-(\d+)/g) || [];
                results[alias].crs_created = crMatches.length;
                // Check metadata count
                const metaMatch = textStr.match(/"cr_count"\s*:\s*"?\((\d+)\)"?/);
                if (metaMatch) {
                    const mc = parseInt(metaMatch[1]);
                    if (mc > results[alias].crs_created) results[alias].crs_created = mc;
                }
                // Extract CR details
                for (const line of textStr.split('\n')) {
                    const crIdMatch = line.match(/CR-(\d+)/);
                    if (crIdMatch) {
                        const isOpen = line.toLowerCase().includes('open');
                        if (isOpen) {
                            const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
                            if (dateMatch && new Date(dateMatch[1]) < fiveDaysAgo) results[alias].stale_crs++;
                        }
                        results[alias].cr_details.push({
                            id: crIdMatch[0], type: 'created',
                            snippet: line.replace(/\|/g, ' ').replace(/\[.*?\]/g, '').trim().substring(0, 150)
                        });
                    }
                }
            }
        }

        await new Promise(r => setTimeout(r, 500));

        // ── Batch 3: CRs reviewed (to-user) for all engineers ──
        const toUrls = aliases.map(a =>
            `https://code.amazon.com/reviews/to-user/${a}?shipped=true&open=true&pending=true&start_time=${startDate}&end_time=${endDate}`
        );
        logger.info(`Fetching CRs-reviewed for ${aliases.length} engineers in 1 batched call...`);
        const toResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: toUrls,
            concurrencyLimit: 10
        });

        const toContent = toResult?.content;
        if (Array.isArray(toContent)) {
            for (let idx = 0; idx < toContent.length && idx < aliases.length; idx++) {
                const alias = aliases[idx];
                const text = toContent[idx]?.text || toContent[idx]?.content || '';
                const textStr = typeof text === 'string' ? text : JSON.stringify(text);
                const crMatches = textStr.match(/CR-(\d+)/g) || [];
                results[alias].crs_reviewed = crMatches.length;
                const metaMatch = textStr.match(/"cr_count"\s*:\s*"?\((\d+)\)"?/);
                if (metaMatch) {
                    const mc = parseInt(metaMatch[1]);
                    if (mc > results[alias].crs_reviewed) results[alias].crs_reviewed = mc;
                }
                for (const line of textStr.split('\n')) {
                    const crIdMatch = line.match(/CR-(\d+)/);
                    if (crIdMatch) {
                        results[alias].cr_details.push({
                            id: crIdMatch[0], type: 'reviewed',
                            snippet: line.replace(/\|/g, ' ').replace(/\[.*?\]/g, '').trim().substring(0, 150)
                        });
                    }
                }
            }
        }

    } catch (error) {
        logger.warn(`Batched fetch failed: ${error.message}. Falling back to sequential.`);
        // Fallback: fetch sequentially for each engineer
        for (const alias of aliases) {
            try {
                results[alias] = await fetchEngineerCodeActivity(alias, startDate, endDate);
            } catch (e) { /* skip */ }
        }
    }

    return results;
}

// ─── Backfill & Incremental Sync ───

/**
 * Get all week IDs from W01 of a given year to the current week
 */
function getYearWeekIds(year = new Date().getFullYear()) {
    const currentWeekId = getWeekId();
    const currentYear = parseInt(currentWeekId.split('-W')[0]);
    const currentWeekNum = parseInt(currentWeekId.split('-W')[1]);
    const maxWeek = year === currentYear ? currentWeekNum : 52;

    const weekIds = [];
    for (let w = 1; w <= maxWeek; w++) {
        weekIds.push(`${year}-W${String(w).padStart(2, '0')}`);
    }
    return weekIds;
}

/**
 * Get week IDs that are missing from the database for a given year
 */
async function getMissingWeeks(year = new Date().getFullYear()) {
    await init();
    const allWeekIds = getYearWeekIds(year);

    const existingRows = await dbAll(
        `SELECT DISTINCT week_id FROM eng_metrics_weekly WHERE week_id LIKE ?`,
        [`${year}-%`]
    );
    const existingSet = new Set(existingRows.map(r => r.week_id));

    return allWeekIds.filter(wid => !existingSet.has(wid));
}

/**
 * Backfill metrics for all missing weeks of the current year.
 * Returns a progress callback pattern for streaming progress to the frontend.
 */
async function backfillYear(year = new Date().getFullYear(), onProgress = null) {
    await init();
    const orgStore = require('./org-store');

    const missingWeeks = await getMissingWeeks(year);
    if (missingWeeks.length === 0) {
        backfillState.running = false;
        backfillState.result = { status: 'up_to_date', weeksProcessed: 0 };
        logger.info('No missing weeks to backfill');
        return backfillState.result;
    }

    const allMembers = await orgStore.getAllMembers();
    if (!allMembers || allMembers.length === 0) {
        throw new Error('Org store is empty. Please sync your org first from Settings.');
    }

    const aliases = allMembers.map(m => m.alias);
    const memberMap = {};
    for (const m of allMembers) memberMap[m.alias] = m;

    // Initialize progress state
    const weekLabels = {};
    for (const wid of missingWeeks) weekLabels[wid.split('-')[1]] = 'pending';
    backfillState = {
        running: true, cancelled: false, startedAt: new Date().toISOString(),
        currentWeek: null, currentPhase: null,
        completedWeeks: 0, totalWeeks: missingWeeks.length,
        totalEngineers: aliases.length,
        weekStatuses: weekLabels, error: null, result: null,
    };

    let totalStored = 0;

    logger.info(`Backfilling ${missingWeeks.length} weeks for ${aliases.length} engineers using BATCHED fetch (3 calls/week)`);

    for (let wi = 0; wi < missingWeeks.length; wi++) {
        if (backfillState.cancelled) {
            logger.info('Backfill cancelled by user');
            backfillState.running = false;
            backfillState.result = { status: 'cancelled', weeksProcessed: wi };
            return backfillState.result;
        }

        const weekId = missingWeeks[wi];
        const weekLabel = weekId.split('-')[1];
        const dateRange = getWeekDateRange(weekId);

        backfillState.currentWeek = weekId;
        backfillState.weekStatuses[weekLabel] = 'running';
        backfillState.currentPhase = 'fetching';

        logger.info(`Backfilling ${weekId} (${dateRange.start} to ${dateRange.end}) [${wi + 1}/${missingWeeks.length}]`);

        // Batched fetch — 3 MCP calls for ALL engineers
        const batchedResults = await fetchOrgCodeActivityBatched(aliases, dateRange.start, dateRange.end);

        // Store results in SQLite
        backfillState.currentPhase = 'storing';
        const now = new Date().toISOString();
        for (const alias of aliases) {
            const activity = batchedResults[alias] || { crs_created: 0, crs_reviewed: 0, lines_added: 0, lines_removed: 0, lines_changed: 0, avg_turnaround_hours: 0, stale_crs: 0, packages: [], cr_details: [] };
            const member = memberMap[alias] || { name: alias, team: '' };

            await dbRun(`
                INSERT OR REPLACE INTO eng_metrics_weekly 
                (alias, name, team, week_id, crs_created, crs_reviewed, lines_added, lines_removed, lines_changed, avg_turnaround_hours, stale_crs, packages_json, cr_details_json, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                alias, member.name, member.team || member.managerAlias || '',
                weekId, activity.crs_created, activity.crs_reviewed,
                activity.lines_added, activity.lines_removed, activity.lines_changed,
                activity.avg_turnaround_hours, activity.stale_crs,
                JSON.stringify(activity.packages), JSON.stringify(activity.cr_details),
                now
            ]);
            totalStored++;
        }

        backfillState.completedWeeks = wi + 1;
        backfillState.weekStatuses[weekLabel] = 'done';

        if (onProgress) onProgress({ weekId, completed: wi + 1, total: missingWeeks.length, engineers: aliases.length });
    }

    // Update metadata
    await dbRun(`INSERT OR REPLACE INTO eng_metrics_meta (key, value) VALUES ('lastFetched', ?)`, [new Date().toISOString()]);
    await dbRun(`INSERT OR REPLACE INTO eng_metrics_meta (key, value) VALUES ('lastBackfill', ?)`, [new Date().toISOString()]);

    const result = { status: 'complete', weeksProcessed: missingWeeks.length, totalFetches: totalStored };
    backfillState.running = false;
    backfillState.result = result;
    backfillState.currentPhase = 'done';

    logger.info(`Backfill complete: ${totalStored} records stored across ${missingWeeks.length} weeks`);
    return result;
}

/**
 * Start backfill in background (non-blocking). Returns immediately.
 */
function startBackfillAsync(year = new Date().getFullYear()) {
    if (backfillState.running) {
        return { status: 'already_running', ...backfillState };
    }
    // Fire and forget — runs in background
    backfillYear(year).catch(err => {
        backfillState.running = false;
        backfillState.error = err.message;
        logger.error('Background backfill failed:', err.message);
    });
    return { status: 'started', message: 'Backfill started in background. Poll /api/eng-metrics?view=backfill-status for progress.' };
}

/**
 * Incremental sync — ensures current week has data, silently called on page visit
 */
async function incrementalSync() {
    await init();
    const currentWeekId = getWeekId();

    const hasCurrentWeek = await hasDataForWeek(currentWeekId);
    if (hasCurrentWeek) {
        return { status: 'current', weekId: currentWeekId };
    }

    // Fetch only the current week
    logger.info(`Incremental sync: fetching current week ${currentWeekId}`);
    return await fetchOrgMetrics(currentWeekId);
}

/**
 * Get the full year of weekly data for a single engineer
 */
async function getEngineerYearData(alias, year = new Date().getFullYear()) {
    await init();

    const weekIds = getYearWeekIds(year);
    const placeholders = weekIds.map(() => '?').join(',');
    const rows = await dbAll(
        `SELECT * FROM eng_metrics_weekly WHERE alias = ? AND week_id IN (${placeholders}) ORDER BY week_id`,
        [alias, ...weekIds]
    );

    // Fill gaps with zeros
    const dataMap = {};
    for (const row of rows) {
        dataMap[row.week_id] = row;
    }

    const formatLines = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

    return weekIds.map(wid => {
        const row = dataMap[wid];
        return {
            weekId: wid,
            weekLabel: wid.split('-')[1],
            dateRange: getWeekDateRange(wid),
            crsCreated: row?.crs_created || 0,
            crsReviewed: row?.crs_reviewed || 0,
            linesChanged: row?.lines_changed || 0,
            linesAdded: row?.lines_added || 0,
            linesRemoved: row?.lines_removed || 0,
            linesDisplay: formatLines(row?.lines_changed || 0),
            avgTurnaround: row?.avg_turnaround_hours || 0,
            staleCrs: row?.stale_crs || 0,
            packages: row ? JSON.parse(row.packages_json || '[]') : [],
            hasData: !!row,
        };
    });
}

/**
 * Get year trend for entire org (aggregated weekly)
 */
async function getOrgYearTrend(year = new Date().getFullYear()) {
    await init();

    const weekIds = getYearWeekIds(year);
    const trend = [];

    for (const wid of weekIds) {
        const rows = await dbAll(`SELECT * FROM eng_metrics_weekly WHERE week_id = ?`, [wid]);
        trend.push({
            weekId: wid,
            weekLabel: wid.split('-')[1],
            crsCreated: rows.reduce((s, r) => s + r.crs_created, 0),
            crsReviewed: rows.reduce((s, r) => s + r.crs_reviewed, 0),
            linesChanged: rows.reduce((s, r) => s + r.lines_changed, 0),
            engineerCount: rows.length,
            hasData: rows.length > 0,
        });
    }

    return trend;
}

/**
 * Compare multiple engineers over a date range
 */
async function compareEngineers(aliases, weeks = 13) {
    await init();

    const currentWeekId = getWeekId();
    const [year, weekStr] = currentWeekId.split('-W');
    const currentWeekNum = parseInt(weekStr);

    const weekIds = [];
    for (let i = weeks - 1; i >= 0; i--) {
        let wn = currentWeekNum - i;
        let yr = parseInt(year);
        if (wn <= 0) { wn += 52; yr--; }
        weekIds.push(`${yr}-W${String(wn).padStart(2, '0')}`);
    }

    const result = {};
    for (const alias of aliases) {
        const placeholders = weekIds.map(() => '?').join(',');
        const rows = await dbAll(
            `SELECT * FROM eng_metrics_weekly WHERE alias = ? AND week_id IN (${placeholders}) ORDER BY week_id`,
            [alias, ...weekIds]
        );

        const dataMap = {};
        for (const row of rows) dataMap[row.week_id] = row;

        result[alias] = {
            name: rows[0]?.name || alias,
            team: rows[0]?.team || '',
            weeks: weekIds.map(wid => ({
                weekId: wid,
                weekLabel: wid.split('-')[1],
                crsCreated: dataMap[wid]?.crs_created || 0,
                crsReviewed: dataMap[wid]?.crs_reviewed || 0,
                linesChanged: dataMap[wid]?.lines_changed || 0,
            })),
            totals: {
                crsCreated: rows.reduce((s, r) => s + r.crs_created, 0),
                crsReviewed: rows.reduce((s, r) => s + r.crs_reviewed, 0),
                linesChanged: rows.reduce((s, r) => s + r.lines_changed, 0),
            }
        };
    }

    return { weekIds, engineers: result };
}

// ─── Org-Level Stale CRs ───

/**
 * Count stale CRs (OPEN >5 days) across the entire org.
 * Makes one batched call for all engineers' open CRs.
 */
async function countOrgStaleCrs() {
    await init();
    const orgStore = require('./org-store');
    const mcpClient = require('./mcp-client');

    const allMembers = await orgStore.getAllMembers();
    if (!allMembers || allMembers.length === 0) return 0;

    const aliases = allMembers.map(m => m.alias);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    try {
        // Single batched call: all engineers' OPEN CRs
        const openUrls = aliases.map(a =>
            `https://code.amazon.com/reviews/from-user/${a}?open=true`
        );
        logger.info(`Counting stale CRs for ${aliases.length} engineers...`);
        const result = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
            inputs: openUrls,
            concurrencyLimit: 10
        });

        let staleCrCount = 0;
        const staleDetails = [];
        const content = result?.content;

        if (Array.isArray(content)) {
            for (let idx = 0; idx < content.length && idx < aliases.length; idx++) {
                const text = content[idx]?.text || content[idx]?.content || '';
                const textStr = typeof text === 'string' ? text : JSON.stringify(text);

                // Parse table rows — look for OPEN status with dates
                const lines = textStr.split('\n');
                for (const line of lines) {
                    // Match table rows with CR IDs and OPEN status
                    if (line.includes('OPEN') && line.match(/CR-(\d+)/)) {
                        const crMatch = line.match(/CR-(\d+)/);
                        const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
                        if (crMatch && dateMatch) {
                            const lastTouched = new Date(dateMatch[1]);
                            if (lastTouched < fiveDaysAgo) {
                                staleCrCount++;
                                staleDetails.push({
                                    crId: crMatch[0],
                                    alias: aliases[idx],
                                    lastTouched: dateMatch[1],
                                    ageDays: Math.floor((Date.now() - lastTouched.getTime()) / (1000 * 60 * 60 * 24))
                                });
                            }
                        }
                    }
                }
            }
        }

        logger.info(`Found ${staleCrCount} stale CRs across org`);
        return { count: staleCrCount, details: staleDetails };
    } catch (error) {
        logger.warn(`Failed to count stale CRs: ${error.message}`);
        return { count: 0, details: [] };
    }
}

// ─── Org-Level Fetch ───

/**
 * Fetch metrics for entire org and store in SQLite
 * @param {string} weekId - Week identifier (e.g. "2026-W10"), defaults to current week
 * @returns {Object} Summary of the fetch
 */
async function fetchOrgMetrics(weekId = null) {
    await init();

    const orgStore = require('./org-store');
    const currentWeekId = weekId || getWeekId();
    const dateRange = getWeekDateRange(currentWeekId);

    logger.info(`Fetching org metrics for ${currentWeekId} (${dateRange.start} to ${dateRange.end})`);

    // Get all org members
    const allMembers = await orgStore.getAllMembers();
    if (!allMembers || allMembers.length === 0) {
        throw new Error('Org store is empty. Please sync your org first from Settings.');
    }

    const now = new Date().toISOString();
    let fetchedCount = 0;
    let errorCount = 0;
    const packageMap = new Map(); // package → Set of committers

    for (const member of allMembers) {
        try {
            logger.info(`Fetching metrics for ${member.alias} (${fetchedCount + 1}/${allMembers.length})`);

            const activity = await fetchEngineerCodeActivity(
                member.alias,
                dateRange.start,
                dateRange.end
            );

            // Store in SQLite
            await dbRun(`
                INSERT OR REPLACE INTO eng_metrics_weekly 
                (alias, name, team, week_id, crs_created, crs_reviewed, lines_added, lines_removed, lines_changed, avg_turnaround_hours, stale_crs, packages_json, cr_details_json, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                member.alias,
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
                now
            ]);

            // Track packages for bus factor analysis
            activity.packages.forEach(pkg => {
                if (!packageMap.has(pkg)) packageMap.set(pkg, new Set());
                packageMap.get(pkg).add(member.alias);
            });

            fetchedCount++;

            // Rate limiting — small delay between requests
            await new Promise(r => setTimeout(r, 500));
        } catch (error) {
            logger.warn(`Failed to fetch metrics for ${member.alias}: ${error.message}`);
            errorCount++;
        }
    }

    // Store bus factor data
    for (const [pkg, committers] of packageMap) {
        if (committers.size === 1) {
            const sole = Array.from(committers)[0];
            await dbRun(`
                INSERT OR REPLACE INTO eng_bus_factor (package_name, sole_committer, last_commit_date, week_id)
                VALUES (?, ?, ?, ?)
            `, [pkg, sole, now, currentWeekId]);
        }
    }

    // Update metadata
    await dbRun(`INSERT OR REPLACE INTO eng_metrics_meta (key, value) VALUES ('lastFetched', ?)`, [now]);
    await dbRun(`INSERT OR REPLACE INTO eng_metrics_meta (key, value) VALUES ('lastWeekId', ?)`, [currentWeekId]);

    logger.info(`Org metrics fetch complete: ${fetchedCount} engineers, ${errorCount} errors`);

    return {
        weekId: currentWeekId,
        dateRange,
        fetchedCount,
        errorCount,
        totalMembers: allMembers.length,
        fetchedAt: now
    };
}

// ─── Query Methods ───

/**
 * Get org summary dashboard data for a given week
 */
async function getOrgDashboard(weekId = null) {
    await init();

    const currentWeekId = weekId || getWeekId();
    const [curYear, curWeekStr] = currentWeekId.split('-W');
    const curWeekNum = parseInt(curWeekStr);

    // Build week IDs for W-1, W-2, W-3
    const priorWeekIds = [];
    for (let i = 1; i <= 3; i++) {
        let wn = curWeekNum - i;
        let yr = parseInt(curYear);
        if (wn <= 0) { wn += 52; yr--; }
        priorWeekIds.push(`${yr}-W${String(wn).padStart(2, '0')}`);
    }
    const prevWeekId = priorWeekIds[0]; // W-1

    // Current week metrics
    const engineers = await dbAll(
        `SELECT * FROM eng_metrics_weekly WHERE week_id = ? ORDER BY crs_created DESC`,
        [currentWeekId]
    );

    // Fetch W-1, W-2, W-3 for per-engineer trend analysis
    const priorPlaceholders = priorWeekIds.map(() => '?').join(',');
    const priorRows = await dbAll(
        `SELECT * FROM eng_metrics_weekly WHERE week_id IN (${priorPlaceholders})`,
        priorWeekIds
    );

    // Build lookup: { alias -> { 'W-1': row, 'W-2': row, 'W-3': row } }
    const priorByAlias = {};
    for (const row of priorRows) {
        if (!priorByAlias[row.alias]) priorByAlias[row.alias] = {};
        const idx = priorWeekIds.indexOf(row.week_id);
        if (idx !== -1) priorByAlias[row.alias][`W-${idx + 1}`] = row;
    }

    // Previous week for org-level trend comparison (backward compat)
    const prevEngineers = priorRows.filter(r => r.week_id === prevWeekId);

    // Compute org summary
    const totalCrsCreated = engineers.reduce((s, e) => s + e.crs_created, 0);
    const totalCrsReviewed = engineers.reduce((s, e) => s + e.crs_reviewed, 0);
    const totalLinesChanged = engineers.reduce((s, e) => s + e.lines_changed, 0);
    const totalStaleCrs = engineers.reduce((s, e) => s + e.stale_crs, 0);

    // P50 turnaround (median)
    const turnarounds = engineers.map(e => e.avg_turnaround_hours).filter(t => t > 0).sort((a, b) => a - b);
    const p50Turnaround = turnarounds.length > 0 ? turnarounds[Math.floor(turnarounds.length / 2)] : 0;

    // Previous week totals for trend
    const prevCrsCreated = prevEngineers.reduce((s, e) => s + e.crs_created, 0);
    const prevCrsReviewed = prevEngineers.reduce((s, e) => s + e.crs_reviewed, 0);
    const prevLinesChanged = prevEngineers.reduce((s, e) => s + e.lines_changed, 0);
    const prevStaleCrs = prevEngineers.reduce((s, e) => s + e.stale_crs, 0);
    const prevTurnarounds = prevEngineers.map(e => e.avg_turnaround_hours).filter(t => t > 0).sort((a, b) => a - b);
    const prevP50 = prevTurnarounds.length > 0 ? prevTurnarounds[Math.floor(prevTurnarounds.length / 2)] : 0;

    const pctChange = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;

    // Bus factor risks
    const busFactorRisks = await dbAll(
        `SELECT * FROM eng_bus_factor WHERE week_id = ?`,
        [currentWeekId]
    );

    // Get last fetched time
    const lastFetchedRow = await dbGet(`SELECT value FROM eng_metrics_meta WHERE key = 'lastFetched'`);

    // Format lines as K notation; show "—" for 0 to avoid confusing blank-looking cells
    const formatLines = (n) => {
        if (!n || n === 0) return '—';
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return String(n);
    };

    return {
        weekId: currentWeekId,
        dateRange: getWeekDateRange(currentWeekId),
        lastFetched: lastFetchedRow?.value || null,
        summary: {
            crsCreated: { value: totalCrsCreated, trend: pctChange(totalCrsCreated, prevCrsCreated) },
            crsReviewed: { value: totalCrsReviewed, trend: pctChange(totalCrsReviewed, prevCrsReviewed) },
            p50Turnaround: { value: p50Turnaround, display: `${p50Turnaround.toFixed(1)}h`, prevDisplay: `${prevP50.toFixed(1)}h` },
            staleCrs: { value: totalStaleCrs, prev: prevStaleCrs }
        },
        alerts: {
            staleCrs: totalStaleCrs,
            busFactorRisks: busFactorRisks.length,
            busFactorDetails: busFactorRisks
        },
        engineers: engineers.map(e => {
            // Review Ratio: only meaningful when engineer has authored CRs
            const reviewRatio = e.crs_created > 0
                ? Math.round((e.crs_reviewed / e.crs_created) * 10) / 10
                : null;

            // ── Per-engineer trend data (W-1, W-2, W-3) ──
            const prior = priorByAlias[e.alias] || {};
            const w1 = prior['W-1'];
            const w2 = prior['W-2'];
            const w3 = prior['W-3'];

            // Deltas vs last week (W-1)
            const prevCrsCreated = w1 ? w1.crs_created : null;
            const prevCrsReviewed = w1 ? w1.crs_reviewed : null;
            const prevRR = (w1 && w1.crs_created > 0)
                ? Math.round((w1.crs_reviewed / w1.crs_created) * 10) / 10
                : null;

            const crsCreatedDelta = prevCrsCreated !== null ? e.crs_created - prevCrsCreated : null;
            const crsReviewedDelta = prevCrsReviewed !== null ? e.crs_reviewed - prevCrsReviewed : null;
            const reviewRatioDelta = (reviewRatio !== null && prevRR !== null)
                ? Math.round((reviewRatio - prevRR) * 10) / 10
                : null;

            // 3-week declining streak detection
            // W-3 >= W-2 >= W-1 >= current (strictly decreasing for 3 consecutive drops)
            const decliningMetrics = [];
            // CRs Created declining: W-3 > W-2 > W-1 > current
            if (w3 && w2 && w1) {
                if (w3.crs_created > w2.crs_created && w2.crs_created > w1.crs_created && w1.crs_created > e.crs_created) {
                    decliningMetrics.push('crsCreated');
                }
                if (w3.crs_reviewed > w2.crs_reviewed && w2.crs_reviewed > w1.crs_reviewed && w1.crs_reviewed > e.crs_reviewed) {
                    decliningMetrics.push('crsReviewed');
                }
            }

            return {
                alias: e.alias,
                name: e.name,
                team: e.team,
                crsCreated: e.crs_created,
                crsReviewed: e.crs_reviewed,
                reviewRatio,
                reviewRatioDisplay: reviewRatio !== null ? `${reviewRatio.toFixed(1)}×` : '—',
                linesChanged: e.lines_changed,
                linesDisplay: formatLines(e.lines_changed),
                avgTurnaround: e.avg_turnaround_hours,
                turnaroundDisplay: `${e.avg_turnaround_hours.toFixed(1)}h`,
                staleCrs: e.stale_crs,
                packages: JSON.parse(e.packages_json || '[]'),
                // Trend fields
                prevCrsCreated,
                prevCrsReviewed,
                prevReviewRatio: prevRR,
                crsCreatedDelta,
                crsReviewedDelta,
                reviewRatioDelta,
                decliningStreak: decliningMetrics.length > 0,
                decliningMetrics,
            };
        }),
        totalEngineers: engineers.length
    };
}

/**
 * Get weekly trend data for the org (bar chart)
 */
async function getWeeklyTrend(weeks = 8) {
    await init();

    const currentWeekId = getWeekId();
    const [year, weekStr] = currentWeekId.split('-W');
    const currentWeekNum = parseInt(weekStr);

    const weekIds = [];
    for (let i = weeks - 1; i >= 0; i--) {
        let wn = currentWeekNum - i;
        let yr = parseInt(year);
        if (wn <= 0) { wn += 52; yr--; }
        weekIds.push(`${yr}-W${String(wn).padStart(2, '0')}`);
    }

    const trend = [];
    for (const wid of weekIds) {
        const rows = await dbAll(`SELECT * FROM eng_metrics_weekly WHERE week_id = ?`, [wid]);
        const crsCreated = rows.reduce((s, r) => s + r.crs_created, 0);
        const crsReviewed = rows.reduce((s, r) => s + r.crs_reviewed, 0);
        const linesChanged = rows.reduce((s, r) => s + r.lines_changed, 0);
        trend.push({
            weekId: wid,
            weekLabel: wid.split('-')[1], // e.g. "W10"
            crsCreated,
            crsReviewed,
            linesChanged,
            engineerCount: rows.length
        });
    }

    return trend;
}

/**
 * Get detailed metrics and history for a single engineer
 */
async function getEngineerDetail(alias, weeks = 12) {
    await init();

    const currentWeekId = getWeekId();
    const [year, weekStr] = currentWeekId.split('-W');
    const currentWeekNum = parseInt(weekStr);

    // Get history
    const weekIds = [];
    for (let i = weeks - 1; i >= 0; i--) {
        let wn = currentWeekNum - i;
        let yr = parseInt(year);
        if (wn <= 0) { wn += 52; yr--; }
        weekIds.push(`${yr}-W${String(wn).padStart(2, '0')}`);
    }

    const placeholders = weekIds.map(() => '?').join(',');
    const history = await dbAll(
        `SELECT * FROM eng_metrics_weekly WHERE alias = ? AND week_id IN (${placeholders}) ORDER BY week_id`,
        [alias, ...weekIds]
    );

    // Current week detail
    const currentWeek = history.find(h => h.week_id === currentWeekId) || null;

    // Recent CR details
    let recentCrs = [];
    if (currentWeek) {
        try {
            recentCrs = JSON.parse(currentWeek.cr_details_json || '[]');
        } catch (e) { /* ignore */ }
    }

    // Goals this engineer contributes to
    const goals = await dbAll(
        `SELECT * FROM eng_goal_alignment WHERE week_id = ? AND engineers_json LIKE ?`,
        [currentWeekId, `%${alias}%`]
    );

    // Format lines display
    const formatLines = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

    return {
        alias,
        name: currentWeek?.name || alias,
        team: currentWeek?.team || '',
        currentWeek: currentWeek ? {
            crsCreated: currentWeek.crs_created,
            crsReviewed: currentWeek.crs_reviewed,
            linesChanged: currentWeek.lines_changed,
            linesDisplay: formatLines(currentWeek.lines_changed),
            avgTurnaround: currentWeek.avg_turnaround_hours,
            turnaroundDisplay: `${currentWeek.avg_turnaround_hours.toFixed(1)}h`,
            staleCrs: currentWeek.stale_crs
        } : null,
        weeklyHistory: history.map(h => ({
            weekId: h.week_id,
            weekLabel: h.week_id.split('-')[1],
            crsCreated: h.crs_created,
            crsReviewed: h.crs_reviewed,
            linesChanged: h.lines_changed,
            linesDisplay: formatLines(h.lines_changed)
        })),
        recentCrs,
        goals: goals.map(g => ({ goalId: g.goal_id, title: g.goal_title, status: g.status }))
    };
}

/**
 * Get sparkline data (last 8 weeks of crs_created) for an engineer
 */
async function getEngineerSparkline(alias, weeks = 8) {
    await init();
    const currentWeekId = getWeekId();
    const [year, weekStr] = currentWeekId.split('-W');
    const currentWeekNum = parseInt(weekStr);

    const weekIds = [];
    for (let i = weeks - 1; i >= 0; i--) {
        let wn = currentWeekNum - i;
        let yr = parseInt(year);
        if (wn <= 0) { wn += 52; yr--; }
        weekIds.push(`${yr}-W${String(wn).padStart(2, '0')}`);
    }

    const placeholders = weekIds.map(() => '?').join(',');
    const rows = await dbAll(
        `SELECT week_id, crs_created FROM eng_metrics_weekly WHERE alias = ? AND week_id IN (${placeholders}) ORDER BY week_id`,
        [alias, ...weekIds]
    );

    // Fill gaps with 0
    return weekIds.map(wid => {
        const row = rows.find(r => r.week_id === wid);
        return row ? row.crs_created : 0;
    });
}

/**
 * Update goal alignment data by cross-referencing CRs with WBR goals
 */
async function updateGoalAlignment(weekId = null) {
    await init();
    const currentWeekId = weekId || getWeekId();

    try {
        const wbrReport = require('./wbr-report');
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const goalPrefix = settings.wbr?.goalPrefix || 'CPP2026Goal';

        // Get all engineers' CR details for this week
        const engineers = await dbAll(
            `SELECT alias, cr_details_json, crs_created, lines_changed FROM eng_metrics_weekly WHERE week_id = ?`,
            [currentWeekId]
        );

        // Try to get WBR report for goal data (cached)
        let wbrData = null;
        try {
            wbrData = await wbrReport.generateWbrReport(false);
        } catch (e) {
            logger.warn('Could not load WBR report for goal alignment:', e.message);
        }

        if (wbrData && wbrData.sections) {
            // Build goal map
            const allGoals = [];
            for (const section of wbrData.sections) {
                for (const goal of (section.goals || [])) {
                    allGoals.push(goal);
                }
            }

            for (const goal of allGoals) {
                // Match CRs to goals by checking if CR descriptions mention goal IDs or keywords
                let matchedCrs = 0;
                let matchedLines = 0;
                const matchedEngineers = new Set();

                const goalKeywords = [
                    goal.id?.toLowerCase(),
                    ...(goal.title || '').toLowerCase().split(/\s+/).filter(w => w.length > 4)
                ].filter(Boolean);

                for (const eng of engineers) {
                    let crDetails = [];
                    try { crDetails = JSON.parse(eng.cr_details_json || '[]'); } catch (e) { /* ignore */ }

                    for (const cr of crDetails) {
                        const crText = (cr.snippet || '').toLowerCase();
                        if (goalKeywords.some(kw => crText.includes(kw))) {
                            matchedCrs++;
                            matchedEngineers.add(eng.alias);
                        }
                    }

                    if (matchedEngineers.has(eng.alias)) {
                        matchedLines += eng.lines_changed;
                    }
                }

                if (matchedCrs > 0 || goal.statusColor !== 'Missing') {
                    await dbRun(`
                        INSERT OR REPLACE INTO eng_goal_alignment (goal_id, goal_title, cr_count, lines_changed, engineers_json, week_id, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        goal.id,
                        goal.title || '',
                        matchedCrs,
                        matchedLines,
                        JSON.stringify(Array.from(matchedEngineers)),
                        currentWeekId,
                        matchedCrs > 0 ? 'Active' : 'No Activity'
                    ]);
                }
            }

            logger.info(`Goal alignment updated for ${allGoals.length} goals`);
        }
    } catch (error) {
        logger.warn('Goal alignment update failed:', error.message);
    }
}

/**
 * Check if we have data for a given week
 */
async function hasDataForWeek(weekId = null) {
    await init();
    const wid = weekId || getWeekId();
    const row = await dbGet(`SELECT COUNT(*) as c FROM eng_metrics_weekly WHERE week_id = ?`, [wid]);
    return (row?.c || 0) > 0;
}

/**
 * Get the last fetched timestamp
 */
async function getLastFetched() {
    await init();
    const row = await dbGet(`SELECT value FROM eng_metrics_meta WHERE key = 'lastFetched'`);
    return row?.value || null;
}

/**
 * Close the database connection
 */
function close() {
    if (db) { db.close(); db = null; logger.info('Eng-metrics database closed'); }
}

module.exports = {
    init,
    getWeekId,
    getWeekDateRange,
    getYearWeekIds,
    fetchEngineerCodeActivity,
    fetchOrgCodeActivityBatched,
    fetchOrgMetrics,
    getOrgDashboard,
    getWeeklyTrend,
    getEngineerDetail,
    getEngineerSparkline,
    getEngineerYearData,
    getOrgYearTrend,
    compareEngineers,
    backfillYear,
    startBackfillAsync,
    getBackfillStatus,
    cancelBackfill,
    countOrgStaleCrs,
    getMissingWeeks,
    incrementalSync,
    updateGoalAlignment,
    hasDataForWeek,
    getLastFetched,
    close,
};
