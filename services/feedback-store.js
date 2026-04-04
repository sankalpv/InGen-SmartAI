/**
 * Feedback Store — SQLite-backed instrumentation for adaptive learning
 * 
 * Three signal types:
 * 1. Alert feedback — did user act, snooze, dismiss, or ignore insights?
 * 2. Draft feedback — how much did user edit AI-generated drafts?
 * 3. Retrieval feedback — which search results were useful?
 * 
 * This is Step 1 of the adaptive learning pipeline.
 * Data accumulates passively; Step 2 (adaptive-engine.js) reads it nightly.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('FeedbackStore');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'feedback.db');

const CURRENT_SCHEMA_VERSION = 1;

let db = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER NOT NULL,
    migratedAt  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_feedback (
    alertId             TEXT PRIMARY KEY,
    type                TEXT NOT NULL,
    firedAt             TEXT NOT NULL,
    outcome             TEXT,
    outcomeAt           TEXT,
    snoozeDuration      INTEGER,
    ignoredAfterHours   INTEGER
);

CREATE TABLE IF NOT EXISTS draft_feedback (
    draftId             TEXT PRIMARY KEY,
    emailContext        TEXT,
    recipientEmail      TEXT,
    aiDraft             TEXT,
    userSent            TEXT,
    editDistanceChars   INTEGER,
    editDistancePercent REAL,
    wasAccepted         INTEGER DEFAULT 0,
    wasRejected         INTEGER DEFAULT 0,
    relationship        TEXT,
    sentAt              TEXT
);

CREATE TABLE IF NOT EXISTS retrieval_feedback (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId       TEXT NOT NULL,
    queryText       TEXT NOT NULL,
    returnedDocId   TEXT,
    rank            INTEGER,
    wasShown        INTEGER DEFAULT 1,
    clicked         INTEGER DEFAULT 0,
    dwellMs         INTEGER,
    correctionText  TEXT,
    timestamp       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_type ON alert_feedback(type);
CREATE INDEX IF NOT EXISTS idx_alert_outcome ON alert_feedback(outcome);
CREATE INDEX IF NOT EXISTS idx_draft_relationship ON draft_feedback(relationship);
CREATE INDEX IF NOT EXISTS idx_retrieval_session ON retrieval_feedback(sessionId);
CREATE INDEX IF NOT EXISTS idx_retrieval_clicked ON retrieval_feedback(clicked);
`;

const VIEWS_SQL = `
CREATE VIEW IF NOT EXISTS alert_effectiveness AS
SELECT
    type,
    COUNT(*) as total_fired,
    SUM(CASE WHEN outcome = 'acted' THEN 1 ELSE 0 END) as acted_count,
    SUM(CASE WHEN outcome = 'snoozed' THEN 1 ELSE 0 END) as snoozed_count,
    SUM(CASE WHEN outcome = 'dismissed' THEN 1 ELSE 0 END) as dismissed_count,
    SUM(CASE WHEN outcome = 'ignored' THEN 1 ELSE 0 END) as ignored_count,
    ROUND(SUM(CASE WHEN outcome = 'acted' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as act_rate
FROM alert_feedback
WHERE outcome IS NOT NULL
GROUP BY type;

CREATE VIEW IF NOT EXISTS draft_style_summary AS
SELECT
    relationship,
    COUNT(*) as total_drafts,
    SUM(wasAccepted) as accepted_count,
    SUM(wasRejected) as rejected_count,
    ROUND(AVG(editDistancePercent), 1) as avg_edit_percent,
    ROUND(SUM(wasAccepted) * 100.0 / NULLIF(COUNT(*), 0), 1) as acceptance_rate
FROM draft_feedback
GROUP BY relationship;

CREATE VIEW IF NOT EXISTS retrieval_quality AS
SELECT
    sessionId,
    queryText,
    COUNT(*) as results_shown,
    SUM(clicked) as results_clicked,
    ROUND(AVG(CASE WHEN clicked = 1 THEN dwellMs END)) as avg_dwell_on_clicked,
    MAX(timestamp) as last_activity
FROM retrieval_feedback
GROUP BY sessionId;
`;

// ─── Init ───

function init() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) { logger.error('Failed to open feedback database:', err.message); return reject(err); }
            db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;', () => {
                db.exec(SCHEMA_SQL, (err) => {
                    if (err) { logger.error('Failed to create feedback schema:', err.message); return reject(err); }
                    // Create views (DROP + CREATE to allow updates)
                    db.exec('DROP VIEW IF EXISTS alert_effectiveness; DROP VIEW IF EXISTS draft_style_summary; DROP VIEW IF EXISTS retrieval_quality;', () => {
                        db.exec(VIEWS_SQL, (err) => {
                            if (err) logger.warn('Views creation warning:', err.message);
                            migrateDB().then(() => resolve(db)).catch(() => resolve(db));
                        });
                    });
                });
            });
        });
    });
}

async function migrateDB() {
    const version = await dbGet('SELECT MAX(version) as v FROM schema_version');
    const currentVersion = version?.v || 0;

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
        // Future migrations go here
        // if (currentVersion < 2) { await dbRun('ALTER TABLE ...'); }

        await dbRun(
            'INSERT INTO schema_version (version, migratedAt) VALUES (?, ?)',
            [CURRENT_SCHEMA_VERSION, new Date().toISOString()]
        );
        logger.info(`Feedback DB migrated to version ${CURRENT_SCHEMA_VERSION}`);
    }
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

// ─── Alert Feedback ───

/**
 * Record that an alert/insight was fired (call when insight is created).
 */
async function recordAlertFired(alertId, type) {
    await init();
    await dbRun(
        'INSERT OR IGNORE INTO alert_feedback (alertId, type, firedAt) VALUES (?, ?, ?)',
        [alertId, type, new Date().toISOString()]
    );
}

/**
 * Record user's response to an alert.
 * @param {string} alertId
 * @param {'acted'|'snoozed'|'dismissed'} outcome
 * @param {number} [snoozeDuration] - minutes snoozed (if applicable)
 */
async function recordAlertOutcome(alertId, outcome, snoozeDuration = null) {
    await init();
    await dbRun(
        'UPDATE alert_feedback SET outcome = ?, outcomeAt = ?, snoozeDuration = ? WHERE alertId = ?',
        [outcome, new Date().toISOString(), snoozeDuration, alertId]
    );
    logger.info(`Alert ${alertId} outcome: ${outcome}`);
}

/**
 * Background job: mark alerts as 'ignored' if no outcome after N hours.
 * Call this from the nightly cleanup in background-agent.js.
 */
async function markIgnoredAlerts(hoursThreshold = 24) {
    await init();
    const cutoff = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
    const result = await dbRun(
        `UPDATE alert_feedback 
         SET outcome = 'ignored', outcomeAt = ?, ignoredAfterHours = ?
         WHERE outcome IS NULL AND firedAt < ?`,
        [new Date().toISOString(), hoursThreshold, cutoff]
    );
    if (result.changes > 0) {
        logger.info(`Marked ${result.changes} alerts as ignored (>${hoursThreshold}h with no action)`);
    }
    return result.changes;
}

/**
 * Get alert effectiveness summary (reads from the view).
 */
async function getAlertEffectiveness() {
    await init();
    return dbAll('SELECT * FROM alert_effectiveness ORDER BY total_fired DESC');
}

// ─── Draft Feedback ───

/**
 * Record an AI-generated draft and the user's final sent version.
 * @param {Object} params
 */
async function recordDraftFeedback({ draftId, emailContext, recipientEmail, aiDraft, userSent, relationship, sentAt }) {
    await init();

    // Compute edit distance
    const editDistanceChars = levenshtein(aiDraft || '', userSent || '');
    const maxLen = Math.max((aiDraft || '').length, (userSent || '').length, 1);
    const editDistancePercent = Math.round((editDistanceChars / maxLen) * 1000) / 10; // 1 decimal
    const wasAccepted = editDistancePercent < 20 ? 1 : 0;
    const wasRejected = !userSent || userSent.trim() === '' ? 1 : 0;

    await dbRun(
        `INSERT OR REPLACE INTO draft_feedback 
         (draftId, emailContext, recipientEmail, aiDraft, userSent, editDistanceChars, editDistancePercent, wasAccepted, wasRejected, relationship, sentAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [draftId, emailContext, recipientEmail, aiDraft, userSent, editDistanceChars, editDistancePercent, wasAccepted, wasRejected, relationship, sentAt || new Date().toISOString()]
    );
    logger.info(`Draft feedback: ${draftId} — edit=${editDistancePercent}%, accepted=${!!wasAccepted}, relationship=${relationship}`);
}

/**
 * Get accepted drafts for few-shot injection, grouped by relationship.
 */
async function getAcceptedDrafts(relationship, limit = 5) {
    await init();
    return dbAll(
        `SELECT emailContext, aiDraft, userSent FROM draft_feedback 
         WHERE wasAccepted = 1 AND relationship = ? 
         ORDER BY sentAt DESC LIMIT ?`,
        [relationship, limit]
    );
}

/**
 * Get draft style summary (reads from the view).
 */
async function getDraftStyleSummary() {
    await init();
    return dbAll('SELECT * FROM draft_style_summary');
}

// ─── Retrieval Feedback ───

/**
 * Record search results shown to user.
 * @param {string} sessionId - Unique per search query
 * @param {string} queryText
 * @param {Array} results - [{ docId, rank }]
 */
async function recordSearchResults(sessionId, queryText, results) {
    await init();
    const now = new Date().toISOString();
    for (const r of results) {
        await dbRun(
            `INSERT INTO retrieval_feedback (sessionId, queryText, returnedDocId, rank, wasShown, clicked, timestamp)
             VALUES (?, ?, ?, ?, 1, 0, ?)`,
            [sessionId, queryText, r.docId || r.id, r.rank, now]
        );
    }
}

/**
 * Record that user clicked a search result.
 */
async function recordResultClick(sessionId, docId, dwellMs = null) {
    await init();
    await dbRun(
        `UPDATE retrieval_feedback SET clicked = 1, dwellMs = ? WHERE sessionId = ? AND returnedDocId = ?`,
        [dwellMs, sessionId, docId]
    );
}

/**
 * Record a search correction ("not what I wanted, try X instead").
 */
async function recordSearchCorrection(sessionId, correctionText) {
    await init();
    await dbRun(
        `UPDATE retrieval_feedback SET correctionText = ? WHERE sessionId = ? AND rank = 1`,
        [correctionText, sessionId]
    );
}

/**
 * Get retrieval quality metrics.
 */
async function getRetrievalQuality() {
    await init();
    return dbAll('SELECT * FROM retrieval_quality ORDER BY last_activity DESC LIMIT 50');
}

// ─── Stats ───

/**
 * Get overall instrumentation stats.
 */
async function getStats() {
    await init();
    const alerts = await dbGet('SELECT COUNT(*) as total, SUM(CASE WHEN outcome IS NOT NULL THEN 1 ELSE 0 END) as withOutcome FROM alert_feedback');
    const drafts = await dbGet('SELECT COUNT(*) as total, SUM(wasAccepted) as accepted, SUM(wasRejected) as rejected FROM draft_feedback');
    const retrieval = await dbGet('SELECT COUNT(DISTINCT sessionId) as sessions, SUM(clicked) as totalClicks FROM retrieval_feedback');

    return {
        alerts: { total: alerts?.total || 0, withOutcome: alerts?.withOutcome || 0 },
        drafts: { total: drafts?.total || 0, accepted: drafts?.accepted || 0, rejected: drafts?.rejected || 0 },
        retrieval: { sessions: retrieval?.sessions || 0, totalClicks: retrieval?.totalClicks || 0 },
    };
}

// ─── Helpers ───

/**
 * Simple Levenshtein distance for edit comparison.
 * Good enough for <10K char strings (email drafts).
 */
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    // Use a simplified approach for long strings to avoid O(n*m) memory
    if (a.length > 5000 || b.length > 5000) {
        // For very long strings, approximate with character-level diff
        const aChars = new Set(a.split(''));
        const bChars = new Set(b.split(''));
        const union = new Set([...aChars, ...bChars]);
        const intersection = [...aChars].filter(c => bChars.has(c));
        return Math.round((1 - intersection.length / union.size) * Math.max(a.length, b.length));
    }

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
                ? matrix[i - 1][j - 1]
                : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Classify relationship type from recipient email using org store.
 * Call at write time, not at read time.
 */
async function classifyRelationship(recipientEmail) {
    try {
        const orgStore = require('./org-store');
        const alias = (recipientEmail || '').split('@')[0];
        if (!alias) return 'unknown';

        const settings = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'settings.json'), 'utf8'));
        const myAlias = settings.phonetoolAlias;
        if (!myAlias) return 'peer';

        // Check if recipient is my manager
        const me = await orgStore.getMember(myAlias);
        if (me?.managerAlias === alias) return 'manager';

        // Check if recipient is my direct report
        const reports = await orgStore.getDirectReports(myAlias);
        if (reports.some(r => r.alias === alias)) return 'report';

        // Check if recipient is in my org at all
        const member = await orgStore.getMember(alias);
        if (member) return 'peer';

        // Not in org → external
        if (recipientEmail && !recipientEmail.includes('@amazon.com')) return 'external';
        return 'peer';
    } catch (e) {
        return 'unknown';
    }
}

function close() {
    if (db) { db.close(); db = null; logger.info('Feedback database closed'); }
}

module.exports = {
    init,
    // Alert feedback
    recordAlertFired,
    recordAlertOutcome,
    markIgnoredAlerts,
    getAlertEffectiveness,
    // Draft feedback
    recordDraftFeedback,
    getAcceptedDrafts,
    getDraftStyleSummary,
    // Retrieval feedback
    recordSearchResults,
    recordResultClick,
    recordSearchCorrection,
    getRetrievalQuality,
    // Utilities
    classifyRelationship,
    getStats,
    close,
};
