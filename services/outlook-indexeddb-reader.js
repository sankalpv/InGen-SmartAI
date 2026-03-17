/**
 * Outlook IndexedDB Reader Service (Windows)
 * 
 * Reads extracted Outlook data from data/outlook-cache.db (SQLite)
 * and provides methods to query conversations, meetings, contacts,
 * and ingest conversations into the vector store for RAG.
 * 
 * Uses sqlite3 (async) — same as eng-metrics.js, issues-store.js, org-store.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('IndexedDB-Reader');

const DB_PATH = path.join(process.cwd(), 'data', 'outlook-cache.db');
const EXTRACTOR_SCRIPT = path.join(process.cwd(), 'scripts', 'windows', 'outlook_extractor.py');

let db = null;

function getDb() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        if (!fs.existsSync(DB_PATH)) {
            logger.warn('outlook-cache.db not found. Run the Python extractor first.');
            return resolve(null);
        }
        db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
            if (err) {
                logger.error('Failed to open outlook-cache.db:', err.message);
                db = null;
                return resolve(null);
            }
            db.run('PRAGMA journal_mode=WAL', () => {
                logger.info('Opened outlook-cache.db');
                resolve(db);
            });
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise(async (resolve, reject) => {
        const conn = await getDb();
        if (!conn) return resolve([]);
        conn.all(sql, params, (err, rows) => {
            if (err) { logger.error('SQL error:', err.message); resolve([]); }
            else resolve(rows || []);
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise(async (resolve, reject) => {
        const conn = await getDb();
        if (!conn) return resolve(null);
        conn.get(sql, params, (err, row) => {
            if (err) { logger.error('SQL error:', err.message); resolve(null); }
            else resolve(row || null);
        });
    });
}

// ─── Status ───

function isAvailable() {
    return process.platform === 'win32' && fs.existsSync(DB_PATH);
}

async function getStatus() {
    const status = {
        available: isAvailable(),
        dbPath: DB_PATH,
        dbExists: fs.existsSync(DB_PATH),
        lastExtraction: null,
        stats: null,
    };

    if (!status.dbExists) return status;

    try {
        const lastRun = await dbGet(
            'SELECT * FROM extraction_runs WHERE status = ? ORDER BY id DESC LIMIT 1', ['completed']
        );
        if (lastRun) {
            status.lastExtraction = {
                timestamp: lastRun.completed_at,
                conversationsAdded: lastRun.conversations_added,
                conversationsUpdated: lastRun.conversations_updated,
                meetingsAdded: lastRun.meetings_added,
                meetingsUpdated: lastRun.meetings_updated,
                contactsAdded: lastRun.contacts_added,
                contactsUpdated: lastRun.contacts_updated,
            };
        }

        const convCount = await dbGet('SELECT COUNT(*) as c FROM conversations');
        const meetCount = await dbGet('SELECT COUNT(*) as c FROM meetings');
        const contCount = await dbGet('SELECT COUNT(*) as c FROM contacts');

        status.stats = {
            conversations: convCount?.c || 0,
            meetings: meetCount?.c || 0,
            contacts: contCount?.c || 0,
        };
    } catch (e) {
        logger.error('Error getting status:', e.message);
    }

    return status;
}

// ─── Conversations ───

async function getConversations({ limit = 50, offset = 0, search = null } = {}) {
    if (search) {
        return dbAll(
            `SELECT * FROM conversations WHERE topic LIKE ? OR preview LIKE ? 
             ORDER BY last_delivery DESC LIMIT ? OFFSET ?`,
            [`%${search}%`, `%${search}%`, limit, offset]
        );
    }
    return dbAll('SELECT * FROM conversations ORDER BY last_delivery DESC LIMIT ? OFFSET ?', [limit, offset]);
}

// ─── Meetings ───

async function getMeetings({ limit = 50, upcoming = false } = {}) {
    if (upcoming) {
        return dbAll('SELECT * FROM meetings WHERE start_time >= ? ORDER BY start_time ASC LIMIT ?',
            [new Date().toISOString(), limit]);
    }
    return dbAll('SELECT * FROM meetings ORDER BY start_time DESC LIMIT ?', [limit]);
}

// ─── Contacts ───

async function getContacts({ limit = 100, search = null } = {}) {
    if (search) {
        return dbAll(
            `SELECT * FROM contacts WHERE name LIKE ? OR email LIKE ? ORDER BY name LIMIT ?`,
            [`%${search}%`, `%${search}%`, limit]
        );
    }
    return dbAll('SELECT * FROM contacts WHERE name IS NOT NULL AND name != "" ORDER BY name LIMIT ?', [limit]);
}

// ─── Vector Store Ingestion (conversations only) ───

async function ingestConversationsToVectorStore() {
    const vectorStore = require('./vector-store');

    if (!fs.existsSync(DB_PATH)) {
        return { error: 'outlook-cache.db not found' };
    }

    try {
        await vectorStore.init();

        const conversations = await dbAll(
            `SELECT id, topic, senders, preview, last_delivery, message_count, importance
             FROM conversations WHERE preview IS NOT NULL AND preview != ''
             ORDER BY last_delivery DESC`
        );

        let ingested = 0;
        let skipped = 0;
        let errors = 0;

        for (const conv of conversations) {
            try {
                const existing = vectorStore.getMetadata(conv.id);
                if (existing) { skipped++; continue; }

                const senders = (() => {
                    try { return JSON.parse(conv.senders || '[]').join(', '); }
                    catch { return conv.senders || 'Unknown'; }
                })();

                await vectorStore.ingestEmail({
                    id: conv.id,
                    subject: conv.topic || '(No Subject)',
                    sender: senders,
                    received: conv.last_delivery || new Date().toISOString(),
                    body: conv.preview || '',
                    from: senders,
                });
                ingested++;

                if (ingested % 50 === 0) {
                    logger.info(`Ingested ${ingested}/${conversations.length} conversations...`);
                }
            } catch (e) {
                errors++;
                if (errors <= 3) logger.warn(`Failed to ingest "${conv.topic}": ${e.message}`);
            }
        }

        logger.info(`Vector ingestion: ${ingested} ingested, ${skipped} skipped, ${errors} errors`);
        return { success: true, ingested, skipped, errors, total: conversations.length };
    } catch (e) {
        logger.error('Vector ingestion failed:', e.message);
        return { error: e.message };
    }
}

// ─── Run Python Extractor ───

async function runExtractor() {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    if (process.platform !== 'win32') {
        return { error: 'Extractor only available on Windows' };
    }

    try {
        const { stdout } = await execAsync(
            `python "${EXTRACTOR_SCRIPT}"`,
            { timeout: 120000, maxBuffer: 10 * 1024 * 1024, cwd: process.cwd() }
        );

        const jsonMatch = stdout.match(/__JSON__(.+?)__JSON__/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[1]);
            if (db) { db.close(); db = null; }
            return result;
        }
        return { success: true, output: stdout.substring(0, 500) };
    } catch (e) {
        logger.error('Extractor failed:', e.message);
        return { error: e.message };
    }
}

function close() {
    if (db) { db.close(); db = null; }
}

module.exports = {
    isAvailable,
    getStatus,
    getConversations,
    getMeetings,
    getContacts,
    ingestConversationsToVectorStore,
    runExtractor,
    close,
};
