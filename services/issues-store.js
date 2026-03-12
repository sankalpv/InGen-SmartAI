/**
 * Issues Store — SQLite-backed normalized store for SIM/Taskei/Alarm issues
 * 
 * Separates raw parsed facts from AI inferences.
 * All queries run offline against cached data — never touches Outlook.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('IssuesStore');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'issues.db');

let db = null;

// ─── Schema ───

const SCHEMA_SQL = `
-- Raw Data Layer: Facts from email parsing

CREATE TABLE IF NOT EXISTS issues (
    id              TEXT PRIMARY KEY,
    simId           TEXT,
    title           TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('sim', 'taskei', 'alarm', 'unknown')),
    status          TEXT,
    impact          INTEGER,
    assigneeAlias   TEXT,
    assigneeRaw     TEXT,
    resolverGroup   TEXT,
    nextStep        TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL,
    firstEmailId    TEXT,
    latestEmailId   TEXT,
    rawBodyLatest   TEXT
);

CREATE TABLE IF NOT EXISTS issue_activities (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId         TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    person          TEXT NOT NULL,
    action          TEXT NOT NULL,
    timestamp       TEXT NOT NULL,
    content         TEXT,
    emailId         TEXT,
    UNIQUE(issueId, person, timestamp)
);

CREATE TABLE IF NOT EXISTS issue_references (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId         TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    refType         TEXT NOT NULL,
    url             TEXT NOT NULL,
    label           TEXT,
    UNIQUE(issueId, url)
);

CREATE TABLE IF NOT EXISTS issue_sla_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId         TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    resolverGroup   TEXT NOT NULL,
    eventType       TEXT NOT NULL,
    timestamp       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_dependencies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    issueId         TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    externalTeam    TEXT NOT NULL,
    depType         TEXT,
    refUrl          TEXT,
    UNIQUE(issueId, externalTeam, depType)
);

CREATE TABLE IF NOT EXISTS issue_source_emails (
    emailId         TEXT PRIMARY KEY,
    issueId         TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    subject         TEXT,
    receivedAt      TEXT NOT NULL,
    parsedAt        TEXT NOT NULL
);

-- AI/Inference Layer: Derived, cached, regenerable

CREATE TABLE IF NOT EXISTS person_work_summary (
    alias           TEXT PRIMARY KEY,
    issueCount      INTEGER DEFAULT 0,
    opsActivityCount    INTEGER DEFAULT 0,
    featureActivityCount INTEGER DEFAULT 0,
    crossTeamActivityCount INTEGER DEFAULT 0,
    qualityActivityCount INTEGER DEFAULT 0,
    lastActiveAt    TEXT,
    aiSummary       TEXT,
    generatedAt     TEXT
);

CREATE TABLE IF NOT EXISTS activity_classifications (
    activityId      INTEGER PRIMARY KEY REFERENCES issue_activities(id) ON DELETE CASCADE,
    activityType    TEXT NOT NULL,
    confidence      REAL DEFAULT 1.0,
    classifiedAt    TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_impact ON issues(impact);
CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assigneeAlias);
CREATE INDEX IF NOT EXISTS idx_issues_updated ON issues(updatedAt);
CREATE INDEX IF NOT EXISTS idx_issues_type ON issues(type);
CREATE INDEX IF NOT EXISTS idx_activities_person ON issue_activities(person);
CREATE INDEX IF NOT EXISTS idx_activities_issue ON issue_activities(issueId);
CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON issue_activities(timestamp);
CREATE INDEX IF NOT EXISTS idx_refs_issue ON issue_references(issueId);
CREATE INDEX IF NOT EXISTS idx_sla_issue ON issue_sla_events(issueId);
CREATE INDEX IF NOT EXISTS idx_deps_issue ON issue_dependencies(issueId);
CREATE INDEX IF NOT EXISTS idx_source_issue ON issue_source_emails(issueId);
`;

// ─── Init ───

function init() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                logger.error('Failed to open issues database:', err.message);
                return reject(err);
            }

            db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;', () => {
                db.exec(SCHEMA_SQL, (err) => {
                    if (err) {
                        logger.error('Failed to create schema:', err.message);
                        return reject(err);
                    }
                    logger.info('Issues database initialized');
                    resolve(db);
                });
            });
        });
    });
}

// ─── Helper: promisified db methods ───

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ─── Issue CRUD ───

async function upsertIssue(issue) {
    await init();
    const sql = `
        INSERT INTO issues (id, simId, title, type, status, impact, assigneeAlias, assigneeRaw,
                           resolverGroup, nextStep, createdAt, updatedAt, firstEmailId, latestEmailId, rawBodyLatest)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            impact = excluded.impact,
            assigneeAlias = COALESCE(excluded.assigneeAlias, issues.assigneeAlias),
            assigneeRaw = COALESCE(excluded.assigneeRaw, issues.assigneeRaw),
            resolverGroup = COALESCE(excluded.resolverGroup, issues.resolverGroup),
            nextStep = COALESCE(excluded.nextStep, issues.nextStep),
            updatedAt = CASE WHEN excluded.updatedAt > issues.updatedAt THEN excluded.updatedAt ELSE issues.updatedAt END,
            latestEmailId = excluded.latestEmailId,
            rawBodyLatest = excluded.rawBodyLatest
    `;
    return dbRun(sql, [
        issue.id, issue.simId, issue.title, issue.type, issue.status,
        issue.impact, issue.assigneeAlias, issue.assigneeRaw,
        issue.resolverGroup, issue.nextStep, issue.createdAt, issue.updatedAt,
        issue.firstEmailId, issue.latestEmailId, issue.rawBodyLatest
    ]);
}

async function addActivity(activity) {
    await init();
    const sql = `
        INSERT OR IGNORE INTO issue_activities (issueId, person, action, timestamp, content, emailId)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    return dbRun(sql, [
        activity.issueId, activity.person, activity.action,
        activity.timestamp, activity.content, activity.emailId
    ]);
}

async function addReference(ref) {
    await init();
    const sql = `INSERT OR IGNORE INTO issue_references (issueId, refType, url, label) VALUES (?, ?, ?, ?)`;
    return dbRun(sql, [ref.issueId, ref.refType, ref.url, ref.label]);
}

async function addSlaEvent(event) {
    await init();
    const sql = `INSERT INTO issue_sla_events (issueId, resolverGroup, eventType, timestamp) VALUES (?, ?, ?, ?)`;
    return dbRun(sql, [event.issueId, event.resolverGroup, event.eventType, event.timestamp]);
}

async function addDependency(dep) {
    await init();
    const sql = `INSERT OR IGNORE INTO issue_dependencies (issueId, externalTeam, depType, refUrl) VALUES (?, ?, ?, ?)`;
    return dbRun(sql, [dep.issueId, dep.externalTeam, dep.depType, dep.refUrl]);
}

async function addSourceEmail(sourceEmail) {
    await init();
    const sql = `INSERT OR IGNORE INTO issue_source_emails (emailId, issueId, subject, receivedAt, parsedAt) VALUES (?, ?, ?, ?, ?)`;
    return dbRun(sql, [sourceEmail.emailId, sourceEmail.issueId, sourceEmail.subject, sourceEmail.receivedAt, sourceEmail.parsedAt]);
}

async function isEmailParsed(emailId) {
    await init();
    const row = await dbGet('SELECT emailId FROM issue_source_emails WHERE emailId = ?', [emailId]);
    return !!row;
}

// ─── Query Methods (all offline) ───

async function getOpenIssues(days = null) {
    await init();
    if (days) {
        return dbAll(`
            SELECT *, CAST(julianday('now') - julianday(createdAt) AS INTEGER) as ageDays
            FROM issues 
            WHERE (status IS NULL OR status NOT IN ('Resolved', 'Closed', 'Cancelled'))
              AND updatedAt > date('now', '-' || ? || ' days')
            ORDER BY impact ASC, updatedAt DESC
        `, [days]);
    }
    return dbAll(`
        SELECT *, CAST(julianday('now') - julianday(createdAt) AS INTEGER) as ageDays
        FROM issues 
        WHERE status IS NULL OR status NOT IN ('Resolved', 'Closed', 'Cancelled')
        ORDER BY impact ASC, updatedAt DESC
    `);
}

async function getAgingIssues(minDays = 7) {
    await init();
    return dbAll(`
        SELECT *, CAST(julianday('now') - julianday(createdAt) AS INTEGER) as ageDays
        FROM issues
        WHERE (status IS NULL OR status NOT IN ('Resolved', 'Closed', 'Cancelled'))
          AND julianday('now') - julianday(createdAt) >= ?
        ORDER BY impact ASC, createdAt ASC
    `, [minDays]);
}

async function getSlaViolations(days = 30) {
    await init();
    return dbAll(`
        SELECT s.*, i.title, i.status, i.impact, i.assigneeAlias
        FROM issue_sla_events s
        JOIN issues i ON s.issueId = i.id
        WHERE s.timestamp > date('now', '-' || ? || ' days')
        ORDER BY s.timestamp DESC
    `, [days]);
}

async function getCrossTeamDependencies() {
    await init();
    return dbAll(`
        SELECT d.*, i.title, i.status, i.impact
        FROM issue_dependencies d
        JOIN issues i ON d.issueId = i.id
        WHERE i.status IS NULL OR i.status NOT IN ('Resolved', 'Closed', 'Cancelled')
        ORDER BY i.impact ASC
    `);
}

async function getPersonActivities(alias, days = 7) {
    await init();
    return dbAll(`
        SELECT ia.*, i.title, i.type, i.impact, i.status
        FROM issue_activities ia
        JOIN issues i ON ia.issueId = i.id
        WHERE ia.person = ?
          AND ia.timestamp > date('now', '-' || ? || ' days')
        ORDER BY ia.timestamp DESC
    `, [alias, days]);
}

async function getPersonActivitySummary(days = 7) {
    await init();
    return dbAll(`
        SELECT 
            ia.person,
            COUNT(DISTINCT ia.issueId) as issueCount,
            COUNT(*) as activityCount,
            MAX(ia.timestamp) as lastActiveAt,
            GROUP_CONCAT(DISTINCT ia.action) as actionTypes
        FROM issue_activities ia
        WHERE ia.timestamp > date('now', '-' || ? || ' days')
        GROUP BY ia.person
        ORDER BY activityCount DESC
    `, [days]);
}

async function getIssueTimeline(issueId) {
    await init();
    return dbAll(`
        SELECT timestamp, person, action, content
        FROM issue_activities
        WHERE issueId = ?
        ORDER BY timestamp ASC
    `, [issueId]);
}

async function getIssuesByType(days = 30) {
    await init();
    return dbAll(`
        SELECT type, COUNT(*) as count,
               SUM(CASE WHEN status NOT IN ('Resolved', 'Closed', 'Cancelled') THEN 1 ELSE 0 END) as openCount
        FROM issues
        WHERE updatedAt > date('now', '-' || ? || ' days')
        GROUP BY type
    `, [days]);
}

async function getWeeklyVelocity(weeks = 4) {
    await init();
    return dbAll(`
        SELECT 
            strftime('%Y-W%W', createdAt) as week,
            COUNT(*) as created
        FROM issues
        WHERE createdAt > date('now', '-' || (? * 7) || ' days')
        GROUP BY week
        ORDER BY week ASC
    `, [weeks]);
}

async function getStats(days = null) {
    await init();
    const stats = {};

    if (days) {
        const dateFilter = `AND updatedAt > date('now', '-' || ${days} || ' days')`;
        const actDateFilter = `AND timestamp > date('now', '-' || ${days} || ' days')`;
        stats.totalIssues = (await dbGet(`SELECT COUNT(*) as c FROM issues WHERE 1=1 ${dateFilter}`))?.c || 0;
        stats.openIssues = (await dbGet(`SELECT COUNT(*) as c FROM issues WHERE (status IS NULL OR status NOT IN ('Resolved', 'Closed', 'Cancelled')) ${dateFilter}`))?.c || 0;
        stats.totalActivities = (await dbGet(`SELECT COUNT(*) as c FROM issue_activities WHERE 1=1 ${actDateFilter}`))?.c || 0;
        stats.slaViolations = (await dbGet(`SELECT COUNT(*) as c FROM issue_sla_events WHERE timestamp > date('now', '-' || ${days} || ' days')`))?.c || 0;
        stats.crossTeamDeps = (await dbGet('SELECT COUNT(*) as c FROM issue_dependencies'))?.c || 0;
        stats.uniquePeople = (await dbGet(`SELECT COUNT(DISTINCT person) as c FROM issue_activities WHERE 1=1 ${actDateFilter}`))?.c || 0;
        stats.sourceEmails = (await dbGet(`SELECT COUNT(*) as c FROM issue_source_emails WHERE receivedAt > date('now', '-' || ${days} || ' days')`))?.c || 0;
    } else {
        stats.totalIssues = (await dbGet('SELECT COUNT(*) as c FROM issues'))?.c || 0;
        stats.openIssues = (await dbGet(`SELECT COUNT(*) as c FROM issues WHERE status IS NULL OR status NOT IN ('Resolved', 'Closed', 'Cancelled')`))?.c || 0;
        stats.totalActivities = (await dbGet('SELECT COUNT(*) as c FROM issue_activities'))?.c || 0;
        stats.slaViolations = (await dbGet('SELECT COUNT(*) as c FROM issue_sla_events'))?.c || 0;
        stats.crossTeamDeps = (await dbGet('SELECT COUNT(*) as c FROM issue_dependencies'))?.c || 0;
        stats.uniquePeople = (await dbGet('SELECT COUNT(DISTINCT person) as c FROM issue_activities'))?.c || 0;
        stats.sourceEmails = (await dbGet('SELECT COUNT(*) as c FROM issue_source_emails'))?.c || 0;
    }

    return stats;
}

// ─── Person Work Summary (AI cache) ───

async function upsertPersonSummary(summary) {
    await init();
    const sql = `
        INSERT INTO person_work_summary (alias, issueCount, opsActivityCount, featureActivityCount, 
                                         crossTeamActivityCount, qualityActivityCount, lastActiveAt, aiSummary, generatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(alias) DO UPDATE SET
            issueCount = excluded.issueCount,
            opsActivityCount = excluded.opsActivityCount,
            featureActivityCount = excluded.featureActivityCount,
            crossTeamActivityCount = excluded.crossTeamActivityCount,
            qualityActivityCount = excluded.qualityActivityCount,
            lastActiveAt = excluded.lastActiveAt,
            aiSummary = excluded.aiSummary,
            generatedAt = excluded.generatedAt
    `;
    return dbRun(sql, [
        summary.alias, summary.issueCount, summary.opsActivityCount,
        summary.featureActivityCount, summary.crossTeamActivityCount,
        summary.qualityActivityCount, summary.lastActiveAt,
        summary.aiSummary, summary.generatedAt
    ]);
}

async function getPersonSummaries() {
    await init();
    return dbAll('SELECT * FROM person_work_summary ORDER BY issueCount DESC');
}

async function getPersonSummary(alias) {
    await init();
    return dbGet('SELECT * FROM person_work_summary WHERE alias = ?', [alias]);
}

// ─── Activity Classification (AI cache) ───

async function classifyActivity(activityId, activityType, confidence = 1.0) {
    await init();
    const sql = `
        INSERT INTO activity_classifications (activityId, activityType, confidence, classifiedAt)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(activityId) DO UPDATE SET
            activityType = excluded.activityType,
            confidence = excluded.confidence,
            classifiedAt = excluded.classifiedAt
    `;
    return dbRun(sql, [activityId, activityType, confidence]);
}

async function getPersonActivityBreakdown(days = 7) {
    await init();
    return dbAll(`
        SELECT ia.person,
               SUM(CASE WHEN ac.activityType = 'ops' THEN 1 ELSE 0 END) as ops,
               SUM(CASE WHEN ac.activityType = 'feature' THEN 1 ELSE 0 END) as feature,
               SUM(CASE WHEN ac.activityType = 'cross_team' THEN 1 ELSE 0 END) as crossTeam,
               SUM(CASE WHEN ac.activityType = 'quality' THEN 1 ELSE 0 END) as quality,
               SUM(CASE WHEN ac.activityType = 'investigation' THEN 1 ELSE 0 END) as investigation,
               COUNT(*) as total
        FROM issue_activities ia
        LEFT JOIN activity_classifications ac ON ac.activityId = ia.id
        WHERE ia.timestamp > date('now', '-' || ? || ' days')
        GROUP BY ia.person
        ORDER BY total DESC
    `, [days]);
}

// ─── Owner-based queries ───

/**
 * Get issues grouped by assignee (owner), with issue count and activity summary.
 * This provides the "who owns what" view for Team Pulse.
 */
async function getIssuesByOwner(days = 7) {
    await init();
    return dbAll(`
        SELECT 
            i.assigneeAlias as owner,
            COUNT(DISTINCT i.id) as issueCount,
            SUM(CASE WHEN i.type = 'taskei' THEN 1 ELSE 0 END) as taskeiCount,
            SUM(CASE WHEN i.type = 'sim' THEN 1 ELSE 0 END) as simCount,
            SUM(CASE WHEN i.type = 'alarm' THEN 1 ELSE 0 END) as alarmCount,
            MIN(i.impact) as worstImpact,
            MAX(i.updatedAt) as lastActiveAt,
            GROUP_CONCAT(i.title, '|||') as issueTitles,
            GROUP_CONCAT(i.id, '|||') as issueIds
        FROM (SELECT DISTINCT id, assigneeAlias, type, impact, updatedAt, title FROM issues) i
        WHERE i.assigneeAlias IS NOT NULL
          AND i.assigneeAlias != ''
          AND i.updatedAt > date('now', '-' || ? || ' days')
        GROUP BY i.assigneeAlias
        ORDER BY issueCount DESC
    `, [days]);
}

/**
 * Get all issues for a specific owner (assignee), with full details.
 */
async function getOwnerIssues(alias, days = 7) {
    await init();
    return dbAll(`
        SELECT i.*, 
            CAST(julianday('now') - julianday(i.createdAt) AS INTEGER) as ageDays,
            (SELECT COUNT(*) FROM issue_activities ia WHERE ia.issueId = i.id AND ia.timestamp > date('now', '-' || ? || ' days')) as recentActivityCount
        FROM issues i
        WHERE i.assigneeAlias = ?
          AND i.updatedAt > date('now', '-' || ? || ' days')
        ORDER BY i.updatedAt DESC
    `, [days, alias, days]);
}

/**
 * Get owner activity breakdown (ops/feature/cross_team/quality) based on issue types and activities.
 */
async function getOwnerActivityBreakdown(days = 7) {
    await init();
    return dbAll(`
        SELECT 
            i.assigneeAlias as owner,
            SUM(CASE WHEN ac.activityType = 'ops' OR i.type = 'alarm' THEN 1 ELSE 0 END) as ops,
            SUM(CASE WHEN ac.activityType = 'feature' OR i.type = 'taskei' THEN 1 ELSE 0 END) as feature,
            SUM(CASE WHEN ac.activityType = 'cross_team' THEN 1 ELSE 0 END) as crossTeam,
            SUM(CASE WHEN ac.activityType = 'quality' THEN 1 ELSE 0 END) as quality,
            SUM(CASE WHEN ac.activityType = 'investigation' THEN 1 ELSE 0 END) as investigation,
            COUNT(*) as total
        FROM issue_activities ia
        JOIN issues i ON ia.issueId = i.id
        LEFT JOIN activity_classifications ac ON ac.activityId = ia.id
        WHERE i.assigneeAlias IS NOT NULL
          AND i.assigneeAlias != ''
          AND ia.timestamp > date('now', '-' || ? || ' days')
        GROUP BY i.assigneeAlias
        ORDER BY total DESC
    `, [days]);
}

/**
 * Get a combined view: all distinct people from both activities AND assignees.
 * Each person has issue ownership count + activity count.
 */
async function getCombinedPeopleSummary(days = 7) {
    await init();
    
    // Get owners (assignees)
    const owners = await dbAll(`
        SELECT 
            i.assigneeAlias as person,
            COUNT(DISTINCT i.id) as ownedIssueCount,
            MAX(i.updatedAt) as lastOwnerActivity
        FROM issues i
        WHERE i.assigneeAlias IS NOT NULL
          AND i.assigneeAlias != ''
          AND i.updatedAt > date('now', '-' || ? || ' days')
        GROUP BY i.assigneeAlias
    `, [days]);
    
    // Get actors (commenters/editors)
    const actors = await dbAll(`
        SELECT 
            ia.person,
            COUNT(DISTINCT ia.issueId) as actedOnIssueCount,
            COUNT(*) as activityCount,
            MAX(ia.timestamp) as lastActivityAt,
            GROUP_CONCAT(DISTINCT ia.action) as actionTypes
        FROM issue_activities ia
        WHERE ia.timestamp > date('now', '-' || ? || ' days')
        GROUP BY ia.person
    `, [days]);
    
    // Merge into a single map
    const peopleMap = {};
    
    for (const o of owners) {
        peopleMap[o.person] = {
            person: o.person,
            ownedIssueCount: o.ownedIssueCount,
            actedOnIssueCount: 0,
            activityCount: 0,
            lastActiveAt: o.lastOwnerActivity,
            actionTypes: ''
        };
    }
    
    for (const a of actors) {
        if (peopleMap[a.person]) {
            peopleMap[a.person].actedOnIssueCount = a.actedOnIssueCount;
            peopleMap[a.person].activityCount = a.activityCount;
            peopleMap[a.person].actionTypes = a.actionTypes;
            // Use the most recent of owner or actor activity
            if (a.lastActivityAt > peopleMap[a.person].lastActiveAt) {
                peopleMap[a.person].lastActiveAt = a.lastActivityAt;
            }
        } else {
            peopleMap[a.person] = {
                person: a.person,
                ownedIssueCount: 0,
                actedOnIssueCount: a.actedOnIssueCount,
                activityCount: a.activityCount,
                lastActiveAt: a.lastActivityAt,
                actionTypes: a.actionTypes
            };
        }
    }
    
    // Convert to sorted array
    return Object.values(peopleMap).sort((a, b) => {
        // Sort by owned issues first, then by activity count
        if (b.ownedIssueCount !== a.ownedIssueCount) return b.ownedIssueCount - a.ownedIssueCount;
        return b.activityCount - a.activityCount;
    });
}

// ─── Cleanup ───

function close() {
    if (db) {
        db.close();
        db = null;
        logger.info('Issues database closed');
    }
}

module.exports = {
    init,
    // Issue CRUD
    upsertIssue,
    addActivity,
    addReference,
    addSlaEvent,
    addDependency,
    addSourceEmail,
    isEmailParsed,
    // Queries
    getOpenIssues,
    getAgingIssues,
    getSlaViolations,
    getCrossTeamDependencies,
    getPersonActivities,
    getPersonActivitySummary,
    getIssueTimeline,
    getIssuesByType,
    getWeeklyVelocity,
    getStats,
    // Person summaries
    upsertPersonSummary,
    getPersonSummaries,
    getPersonSummary,
    // Classification
    classifyActivity,
    getPersonActivityBreakdown,
    // Owner-based queries
    getIssuesByOwner,
    getOwnerIssues,
    getOwnerActivityBreakdown,
    getCombinedPeopleSummary,
    // Lifecycle
    close
};
