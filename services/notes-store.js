/**
 * Notes Store — SQLite-backed persistence for meeting notes + action items
 * 
 * Features:
 * - CRUD for notes with title, raw text, and extracted action items
 * - getDueActionItems() for daily briefing integration
 * - Vector store ingestion for RAG search
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('NotesStore');

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'notes.db');

let db = null;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    rawText     TEXT NOT NULL DEFAULT '',
    actionItems TEXT DEFAULT '[]',
    meetingId   TEXT,
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(createdAt);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updatedAt);
`;

function generateId() {
    return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function init() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) { logger.error('Failed to open notes database:', err.message); return reject(err); }
            db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;', () => {
                db.exec(SCHEMA_SQL, (err) => {
                    if (err) { logger.error('Failed to create notes schema:', err.message); return reject(err); }
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

// ─── CRUD Operations ───

async function createNote({ title, rawText = '', meetingId = null }) {
    await init();
    const id = generateId();
    const now = new Date().toISOString();
    await dbRun(
        `INSERT INTO notes (id, title, rawText, actionItems, meetingId, createdAt, updatedAt)
         VALUES (?, ?, ?, '[]', ?, ?, ?)`,
        [id, title || 'Untitled Note', rawText, meetingId, now, now]
    );
    logger.info(`Created note: ${id} "${title}"`);
    return { id, title, rawText, actionItems: [], meetingId, createdAt: now, updatedAt: now };
}

async function getNote(id) {
    await init();
    const row = await dbGet('SELECT * FROM notes WHERE id = ?', [id]);
    if (!row) return null;
    return { ...row, actionItems: JSON.parse(row.actionItems || '[]') };
}

async function updateNote(id, updates) {
    await init();
    const now = new Date().toISOString();
    const fields = [];
    const params = [];

    if (updates.title !== undefined) { fields.push('title = ?'); params.push(updates.title); }
    if (updates.rawText !== undefined) { fields.push('rawText = ?'); params.push(updates.rawText); }
    if (updates.actionItems !== undefined) { fields.push('actionItems = ?'); params.push(JSON.stringify(updates.actionItems)); }
    if (updates.meetingId !== undefined) { fields.push('meetingId = ?'); params.push(updates.meetingId); }

    fields.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    await dbRun(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, params);
    logger.info(`Updated note: ${id}`);
    return getNote(id);
}

async function deleteNote(id) {
    await init();
    await dbRun('DELETE FROM notes WHERE id = ?', [id]);
    logger.info(`Deleted note: ${id}`);
}

async function listNotes(limit = 50) {
    await init();
    const rows = await dbAll('SELECT id, title, meetingId, createdAt, updatedAt, LENGTH(rawText) as textLength FROM notes ORDER BY updatedAt DESC LIMIT ?', [limit]);
    return rows;
}

async function searchNotes(query) {
    await init();
    const term = `%${query}%`;
    const rows = await dbAll(
        'SELECT * FROM notes WHERE title LIKE ? OR rawText LIKE ? ORDER BY updatedAt DESC LIMIT 20',
        [term, term]
    );
    return rows.map(r => ({ ...r, actionItems: JSON.parse(r.actionItems || '[]') }));
}

// ─── Action Items Queries ───

/**
 * Get action items due within the next N days (for daily briefing).
 * Returns items with their parent note context.
 */
async function getDueActionItems(days = 1) {
    await init();
    const allNotes = await dbAll('SELECT id, title, actionItems, createdAt FROM notes ORDER BY updatedAt DESC');
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const results = [];

    for (const note of allNotes) {
        const items = JSON.parse(note.actionItems || '[]');
        for (const item of items) {
            if (!item.dueDate) continue;
            try {
                const due = new Date(item.dueDate);
                if (isNaN(due.getTime())) continue;
                const isOverdue = due < now;
                const isDueSoon = due <= cutoff;
                if (isOverdue || isDueSoon) {
                    results.push({
                        ...item,
                        isOverdue,
                        noteId: note.id,
                        noteTitle: note.title,
                        noteCreatedAt: note.createdAt,
                    });
                }
            } catch (e) { /* skip invalid dates */ }
        }
    }

    // Sort: overdue first, then by due date ascending
    results.sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return new Date(a.dueDate) - new Date(b.dueDate);
    });

    return results;
}

/**
 * Get all open (non-completed) action items across all notes.
 */
async function getAllOpenActionItems() {
    await init();
    const allNotes = await dbAll('SELECT id, title, actionItems, createdAt FROM notes ORDER BY updatedAt DESC');
    const results = [];

    for (const note of allNotes) {
        const items = JSON.parse(note.actionItems || '[]');
        for (const item of items) {
            if (item.completed) continue;
            results.push({
                ...item,
                noteId: note.id,
                noteTitle: note.title,
                noteCreatedAt: note.createdAt,
            });
        }
    }

    return results;
}

// ─── Vector Store Integration ───

/**
 * Ingest a note into the vector store for RAG search.
 */
async function ingestToVectorStore(noteId) {
    try {
        const note = await getNote(noteId);
        if (!note || !note.rawText) return;

        const vectorStore = require('./vector-store');
        await vectorStore.init();

        const text = `Meeting Note: ${note.title}\n${note.rawText}`;
        const actionSummary = (note.actionItems || []).map(a =>
            `Action: ${a.owner || '?'} — ${a.action} (due: ${a.dueDate || 'TBD'})`
        ).join('\n');
        const fullText = actionSummary ? `${text}\n\nAction Items:\n${actionSummary}` : text;

        await vectorStore.addDocument({
            id: noteId,
            type: 'note',
            folder: 'meeting-notes',
            subject: note.title,
            content: fullText,
            date: note.createdAt,
            metadata: { meetingId: note.meetingId, actionItemCount: (note.actionItems || []).length },
        });

        logger.info(`Ingested note ${noteId} to vector store`);
    } catch (e) {
        logger.warn(`Failed to ingest note to vector store: ${e.message}`);
    }
}

function close() {
    if (db) { db.close(); db = null; logger.info('Notes database closed'); }
}

module.exports = {
    init,
    createNote,
    getNote,
    updateNote,
    deleteNote,
    listNotes,
    searchNotes,
    getDueActionItems,
    getAllOpenActionItems,
    ingestToVectorStore,
    close,
};
