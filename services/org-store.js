/**
 * Org Store — SQLite-backed persistent store for org hierarchy
 * 
 * Populated at install time (or on-demand) from Phonetool.
 * Used by all features that need engineer data:
 * - Team Health (WBR goals → assignee mapping)
 * - Team Pulse (issue owners)
 * - Engineering Metrics (per-engineer code activity)
 * - Person Insights (email/meeting context)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('OrgStore');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'org.db');

let db = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS org_members (
    alias           TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT,
    managerAlias    TEXT,
    depth           INTEGER DEFAULT 0,
    isManager       INTEGER DEFAULT 0,
    jobTitle        TEXT,
    level           INTEGER,
    team            TEXT,
    fetchedAt       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_meta (
    key             TEXT PRIMARY KEY,
    value           TEXT
);

CREATE INDEX IF NOT EXISTS idx_org_manager ON org_members(managerAlias);
CREATE INDEX IF NOT EXISTS idx_org_depth ON org_members(depth);
`;

// ─── Init ───

function init() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) { logger.error('Failed to open org database:', err.message); return reject(err); }
            db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;', () => {
                db.exec(SCHEMA_SQL, (err) => {
                    if (err) { logger.error('Failed to create org schema:', err.message); return reject(err); }
                    
                    // Migration: check if jobTitle column exists, if not add it
                    db.all("PRAGMA table_info(org_members)", (err, rows) => {
                        const hasJobTitle = rows.some(r => r.name === 'jobTitle');
                        if (!hasJobTitle) {
                            logger.info('Migrating org_members: adding jobTitle and level columns');
                            db.run("ALTER TABLE org_members ADD COLUMN jobTitle TEXT", () => {
                                db.run("ALTER TABLE org_members ADD COLUMN level INTEGER", () => {
                                    logger.info('Migration complete');
                                    resolve(db);
                                });
                            });
                        } else {
                            resolve(db);
                        }
                    });
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

// ─── Populate from Phonetool org tree ───

/**
 * Save an entire org tree to SQLite.
 * @param {Object} tree - Org tree from phonetool.fetchOrgTree()
 * @param {string} rootAlias - The root manager alias
 */
async function saveOrgTree(tree, rootAlias) {
    await init();
    
    // Clear existing data (optional, but keep it for clean fetches)
    await dbRun('DELETE FROM org_members');
    
    const now = new Date().toISOString();
    let count = 0;
    
    async function walkAndSave(node, managerAlias, depth) {
        const isManager = (node.reports && node.reports.length > 0) ? 1 : 0;
        await dbRun(
            `INSERT OR REPLACE INTO org_members (alias, name, email, managerAlias, depth, isManager, jobTitle, level, team, fetchedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [node.alias, node.name || node.alias, `${node.alias}@amazon.com`, managerAlias, depth, isManager, node.jobTitle || null, node.level || null, null, now]
        );
        count++;
        
        for (const r of (node.reports || [])) {
            await walkAndSave(r, node.alias, depth + 1);
        }
    }
    
    await walkAndSave(tree, null, 0);
    
    // Save metadata
    await dbRun(`INSERT OR REPLACE INTO org_meta (key, value) VALUES ('rootAlias', ?)`, [rootAlias]);
    await dbRun(`INSERT OR REPLACE INTO org_meta (key, value) VALUES ('lastFetched', ?)`, [now]);
    await dbRun(`INSERT OR REPLACE INTO org_meta (key, value) VALUES ('totalMembers', ?)`, [String(count)]);
    
    logger.info(`Org tree saved: ${count} members under ${rootAlias}`);
    return count;
}

// ─── Query Methods ───

async function getRootAlias() {
    await init();
    const row = await dbGet(`SELECT value FROM org_meta WHERE key = 'rootAlias'`);
    return row?.value || null;
}

async function getMemberCount() {
    await init();
    const row = await dbGet(`SELECT COUNT(*) as c FROM org_members`);
    return row?.c || 0;
}

async function getAllMembers() {
    await init();
    return dbAll(`SELECT * FROM org_members ORDER BY depth, name`);
}

async function getManagers() {
    await init();
    return dbAll(`SELECT * FROM org_members WHERE isManager = 1 ORDER BY depth, name`);
}

async function getDirectReports(managerAlias) {
    await init();
    return dbAll(`SELECT * FROM org_members WHERE managerAlias = ? ORDER BY name`, [managerAlias]);
}

async function getMember(alias) {
    await init();
    return dbGet(`SELECT * FROM org_members WHERE alias = ?`, [alias]);
}

async function getEngineers() {
    await init();
    // Non-manager members (ICs)
    return dbAll(`SELECT * FROM org_members WHERE isManager = 0 ORDER BY managerAlias, name`);
}

async function getOrgTree() {
    await init();
    const all = await dbAll(`SELECT * FROM org_members ORDER BY depth`);
    if (all.length === 0) return null;
    
    // Build tree from flat list
    const nodeMap = {};
    for (const m of all) {
        nodeMap[m.alias] = { ...m, reports: [] };
    }
    
    let root = null;
    for (const m of all) {
        if (m.managerAlias && nodeMap[m.managerAlias]) {
            nodeMap[m.managerAlias].reports.push(nodeMap[m.alias]);
        }
        if (m.depth === 0) root = nodeMap[m.alias];
    }
    
    return root;
}

async function getLastFetched() {
    await init();
    const row = await dbGet(`SELECT value FROM org_meta WHERE key = 'lastFetched'`);
    return row?.value || null;
}

async function isPopulated() {
    await init();
    const count = await getMemberCount();
    return count > 0;
}

// ─── Populate from Phonetool (convenience method) ───

async function populateFromPhoneTool(alias, forceRefresh = false) {
    const phonetool = require('./phonetool');
    
    logger.info(`Populating org store from Phonetool for ${alias} (forceRefresh=${forceRefresh})...`);
    const tree = await phonetool.fetchOrgTree(alias, 4, forceRefresh); // up to 4 levels deep
    
    if (!tree) {
        logger.error('Failed to fetch org tree from Phonetool');
        return 0;
    }
    
    return saveOrgTree(tree, alias);
}

function close() {
    if (db) { db.close(); db = null; logger.info('Org database closed'); }
}

module.exports = {
    init,
    saveOrgTree,
    populateFromPhoneTool,
    getRootAlias,
    getMemberCount,
    getAllMembers,
    getManagers,
    getDirectReports,
    getMember,
    getEngineers,
    getOrgTree,
    getLastFetched,
    isPopulated,
    close,
};