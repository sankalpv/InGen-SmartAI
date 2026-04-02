/**
 * Vector Store — sqlite-vec backend
 *
 * Replaces the previous hnswlib-node binary index with a single SQLite database
 * (`brain/vectors.db`) that supports:
 *   - Native SQL WHERE filtering (hasActionItem, folder, sender, date range, etc.)
 *   - Atomic batch ingestion (one transaction for N emails)
 *   - Full inspect-ability via any SQLite viewer
 *   - O(1) duplicate detection via outlookId UNIQUE constraint
 *
 * Schema:
 *   documents(id, type, outlookId, subject, sender, fromAddr, toAddr, folder,
 *             received, snippet, fullBody,
 *             hasActionItem, hasDecision, hasBlocker, requiresReply,
 *             sentiment, urgency, topics,
 *             fromManager, userEngaged, engagedAt, userMarkedImportant,
 *             createdAt, lastUpdated,
 *             embedding BLOB)   ← float32 vector stored as sqlite-vec blob
 *
 * Usage:
 *   const vs = require('./vector-store');
 *   await vs.init();
 *   await vs.ingestEmail(email);
 *   const results = await vs.search('project timeline', 5, { hasActionItem: true });
 */

const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('VectorStore');
const ollamaClient = require('./ollama-client');

const VECTOR_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSIONS || '4096');
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'qwen3-embedding';
const BRAIN_DIR = path.join(process.cwd(), 'brain');
const DB_PATH = path.join(BRAIN_DIR, 'vectors.db');

// Calendar noise prefixes to skip
const CALENDAR_NOISE = ['accepted:', 'declined:', 'canceled:', 'cancelled:', 'tentative:'];

// ─── Body Cleaner ─────────────────────────────────────────────────────────────

/**
 * Strip HTML tags, URL-encoded noise, Zoom/Teams boilerplate, and excess whitespace
 * from email body before embedding. Produces clean semantic text.
 */
function cleanBody(text) {
    if (!text) return '';

    let t = text;

    // Remove HTML tags
    t = t.replace(/<[^>]*>/g, ' ');

    // Decode common HTML entities
    t = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
         .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    // Remove URLs (http/https)
    t = t.replace(/https?:\/\/\S+/g, '');

    // Remove URL-encoded SharePoint/OneDrive paths
    t = t.replace(/<https?:\/\/[^>]+>/g, '');

    // Remove Zoom boilerplate patterns (meeting ID, passcode, dial-in lines)
    t = t.replace(/Join Zoom Meeting[\s\S]*?(?=\n\n|$)/gi, '');
    t = t.replace(/(Meeting\s+)?(URL|ID|Passcode|Password|Passcode):\s*[\d\w\s.]+/gi, '');
    t = t.replace(/One tap mobile:[\s\S]*?(?=\n\n|$)/gi, '');
    t = t.replace(/Join by Telephone[\s\S]*?(?=\n\n|$)/gi, '');
    t = t.replace(/International numbers[\s\S]*?(?=\n\n|$)/gi, '');
    t = t.replace(/Join from a SIP room system[\s\S]*?(?=\n\n|$)/gi, '');
    t = t.replace(/\d{3}\s\d{3,4}\s\d{4}/g, ''); // meeting IDs like "123 456 7890"
    t = t.replace(/\+1\d{10}[,#*\d]*/g, ''); // phone numbers

    // Remove Teams boilerplate
    t = t.replace(/Microsoft Teams meeting[\s\S]*?(?=\n\n|\z)/gi, '');
    t = t.replace(/Click here to join the meeting[\s\S]*?(?=\n\n)/gi, '');

    // Remove base64-like blobs and encoded tokens
    t = t.replace(/[A-Za-z0-9+/]{60,}={0,2}/g, '');

    // Remove carets used in email quoting chains (>>>, >>, >)
    t = t.replace(/^[>\s]+/gm, '');

    // Collapse whitespace
    t = t.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');

    return t.trim();
}

// ─── VectorStore class ────────────────────────────────────────────────────────

class VectorStore {
    constructor() {
        this.db = null;
        this.loaded = false;
        // Prepared statements (set during init)
        this._stmtInsert = null;
        this._stmtGetByOutlookId = null;
        this._stmtUpdateMeta = null;
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    async init() {
        if (this.loaded) return;

        if (!fs.existsSync(BRAIN_DIR)) {
            fs.mkdirSync(BRAIN_DIR, { recursive: true });
        }

        this.db = new Database(DB_PATH);
        sqliteVec.load(this.db);

        // Performance pragmas
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = -64000'); // 64 MB page cache

        // Create documents table (rich metadata schema)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS documents (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                type             TEXT    NOT NULL DEFAULT 'email',
                outlookId        TEXT    UNIQUE,
                subject          TEXT,
                sender           TEXT,
                fromAddr         TEXT,
                toAddr           TEXT,
                folder           TEXT    DEFAULT 'Inbox',
                received         TEXT,
                snippet          TEXT,
                fullBody         TEXT,

                -- AI enrichment tags (populated by email-tagger.js)
                hasActionItem    INTEGER DEFAULT 0,
                hasDecision      INTEGER DEFAULT 0,
                hasBlocker       INTEGER DEFAULT 0,
                requiresReply    INTEGER DEFAULT 0,
                sentiment        TEXT,
                urgency          TEXT    DEFAULT 'normal',
                topics           TEXT    DEFAULT '[]',

                -- Org context
                fromManager      INTEGER DEFAULT 0,

                -- User engagement signals
                userEngaged      INTEGER DEFAULT 0,
                engagedAt        TEXT,
                userMarkedImportant INTEGER DEFAULT 0,

                createdAt        TEXT    DEFAULT (datetime('now')),
                lastUpdated      TEXT    DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS document_vectors (
                id        INTEGER PRIMARY KEY,
                embedding BLOB NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_type     ON documents(type);
            CREATE INDEX IF NOT EXISTS idx_folder   ON documents(folder);
            CREATE INDEX IF NOT EXISTS idx_received ON documents(received);
            CREATE INDEX IF NOT EXISTS idx_action   ON documents(hasActionItem);
            CREATE INDEX IF NOT EXISTS idx_reply    ON documents(requiresReply);
            CREATE INDEX IF NOT EXISTS idx_manager  ON documents(fromManager);
        `);

        // Prepare reusable statements
        this._stmtInsert = this.db.prepare(`
            INSERT OR IGNORE INTO documents
                (type, outlookId, subject, sender, fromAddr, toAddr, folder, received, snippet, fullBody)
            VALUES
                (@type, @outlookId, @subject, @sender, @fromAddr, @toAddr, @folder, @received, @snippet, @fullBody)
        `);

        this._stmtInsertVec = this.db.prepare(`
            INSERT OR REPLACE INTO document_vectors (id, embedding) VALUES (?, ?)
        `);

        this._stmtGetByOutlookId = this.db.prepare(
            'SELECT id FROM documents WHERE outlookId = ?'
        );

        this._stmtUpdateMeta = this.db.prepare(`
            UPDATE documents SET
                hasActionItem = @hasActionItem,
                hasDecision   = @hasDecision,
                hasBlocker    = @hasBlocker,
                requiresReply = @requiresReply,
                sentiment     = @sentiment,
                urgency       = @urgency,
                topics        = @topics,
                fromManager   = @fromManager,
                lastUpdated   = datetime('now')
            WHERE id = @id
        `);

        this.loaded = true;
        const count = this.db.prepare('SELECT COUNT(*) as c FROM documents').get();
        logger.info(`VectorStore initialized: ${count.c} documents, model=${EMBEDDING_MODEL} ${VECTOR_DIMENSION}d, db=${DB_PATH}`);
    }

    // ── Embedding ─────────────────────────────────────────────────────────────

    async getEmbedding(text) {
        const embedding = await ollamaClient.embed(text, { maxLength: 30000 });
        if (embedding.length !== VECTOR_DIMENSION) {
            throw new Error(`Dimension mismatch: got ${embedding.length}, expected ${VECTOR_DIMENSION}`);
        }
        return embedding;
    }

    /**
     * Serialize a JS float[] to a Float32 Buffer for sqlite-vec storage.
     */
    _toBlob(vector) {
        const buf = Buffer.allocUnsafe(vector.length * 4);
        for (let i = 0; i < vector.length; i++) {
            buf.writeFloatLE(vector[i], i * 4);
        }
        return buf;
    }

    // ── Ingest single email ───────────────────────────────────────────────────

    async ingestEmail(email) {
        if (!this.loaded) await this.init();

        // Skip calendar noise
        const subjectLower = (email.subject || '').toLowerCase();
        if (CALENDAR_NOISE.some(p => subjectLower.startsWith(p))) {
            logger.debug(`Skipping calendar noise: ${email.subject}`);
            return { skipped: true, reason: 'calendar-noise' };
        }

        // O(1) duplicate check via UNIQUE constraint
        const existing = this._stmtGetByOutlookId.get(email.id || email.outlookId);
        if (existing) {
            logger.debug(`Already indexed: ${email.subject}`);
            return { skipped: true, reason: 'duplicate' };
        }

        // Clean body before embedding
        const rawBody = email.body || email.fullBody || email.snippet || '';
        const cleanedBody = cleanBody(rawBody);

        // Text to embed: subject + sender + cleaned body
        const textToEmbed = [
            `Subject: ${email.subject || ''}`,
            `From: ${email.from?.name || email.sender || ''}`,
            `Date: ${email.date || email.received || ''}`,
            '',
            cleanedBody.substring(0, 8000), // ~2k tokens safety cap
        ].join('\n');

        // Skip if body is essentially empty after cleaning
        if (cleanedBody.length < 20) {
            logger.debug(`Skipping near-empty body: ${email.subject}`);
            return { skipped: true, reason: 'empty-body' };
        }

        try {
            const vector = await this.getEmbedding(textToEmbed);
            const blob = this._toBlob(vector);

            // Safely extract sender address — from may be string "Name <email>" or object
            let fromAddr = '';
            if (typeof email.from === 'object' && email.from !== null) {
                fromAddr = email.from.email || email.from.address || '';
            } else if (typeof email.from === 'string') {
                const m = email.from.match(/<([^>]+)>/);
                fromAddr = m ? m[1] : (email.from.includes('@') ? email.from : '');
            }
            if (!fromAddr && email.fromAddr) fromAddr = String(email.fromAddr);
            if (!fromAddr && email.sender) fromAddr = String(email.sender);

            // Safely stringify toAddr — to may be array of objects, array of strings, or string
            let toAddr = '';
            if (Array.isArray(email.to)) {
                toAddr = email.to.map(r => {
                    if (typeof r === 'string') return r;
                    if (typeof r === 'object' && r !== null) return r.email || r.address || r.name || '';
                    return '';
                }).filter(Boolean).join(', ');
            } else if (typeof email.to === 'string') {
                toAddr = email.to;
            }

            // Insert document metadata
            const info = this._stmtInsert.run({
                type:      email.type || 'email',
                outlookId: email.id || email.outlookId,
                subject:   email.subject || '',
                sender:    email.from?.name || email.sender || '',
                fromAddr,
                toAddr,
                folder:    email.folder || 'Inbox',
                received:  email.date || email.received || new Date().toISOString(),
                snippet:   cleanedBody.substring(0, 500),
                fullBody:  cleanedBody,
            });

            const docId = info.lastInsertRowid;
            if (docId) {
                // Insert vector blob
                this._stmtInsertVec.run(docId, blob);
                logger.info(`Ingested [${docId}]: ${email.subject}`);
                return { success: true, id: docId };
            }
            return { skipped: true, reason: 'insert-ignored' };

        } catch (e) {
            logger.error(`Ingestion failed for "${email.subject}":`, e.message);
            return { error: e.message };
        }
    }

    /**
     * Ingest a batch of emails in a single SQLite transaction (much faster than one-by-one).
     */
    async ingestEmailBatch(emails) {
        if (!this.loaded) await this.init();

        const results = { ingested: 0, skipped: 0, errors: 0 };

        // Collect rows to insert (embed in parallel with concurrency cap)
        const CONCURRENCY = 3;
        const toProcess = [];

        for (const email of emails) {
            const subjectLower = (email.subject || '').toLowerCase();
            if (CALENDAR_NOISE.some(p => subjectLower.startsWith(p))) {
                results.skipped++;
                continue;
            }
            const existing = this._stmtGetByOutlookId.get(email.id || email.outlookId);
            if (existing) {
                results.skipped++;
                continue;
            }
            toProcess.push(email);
        }

        logger.info(`Batch ingest: ${toProcess.length} new emails (${results.skipped} skipped)`);

        // Process in chunks of CONCURRENCY
        for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
            const chunk = toProcess.slice(i, i + CONCURRENCY);
            await Promise.all(chunk.map(async (email) => {
                const r = await this.ingestEmail(email);
                if (r.success) results.ingested++;
                else if (r.error) results.errors++;
                else results.skipped++;
            }));
        }

        logger.info(`Batch ingest complete: ${results.ingested} ingested, ${results.skipped} skipped, ${results.errors} errors`);
        return results;
    }

    /**
     * Ingest a Slack message.
     */
    async ingestSlackMessage(msg) {
        if (!this.loaded) await this.init();

        const channel  = String(msg.channel || '');
        const msgTs    = String(msg.id || msg.timestamp || Date.now());
        const msgId    = `slack:${channel}:${msgTs}`;
        const sender   = String(msg.from?.name || msg.user || 'Unknown');
        const received = String(msg.timestamp || new Date().toISOString());

        const existing = this._stmtGetByOutlookId.get(msgId);
        if (existing) return { skipped: true, reason: 'duplicate' };

        const cleanedText = cleanBody(msg.message || msg.text || '');
        if (cleanedText.length < 10) return { skipped: true, reason: 'empty' };

        const textToEmbed = `[Slack #${channel}] ${sender}: ${cleanedText}`;

        try {
            const vector = await this.getEmbedding(textToEmbed);
            const blob = this._toBlob(vector);

            const info = this._stmtInsert.run({
                type:      'slack',
                outlookId: msgId,
                subject:   `[Slack] ${channel}`,
                sender:    sender,
                fromAddr:  '',
                toAddr:    '',
                folder:    channel,
                received:  received,
                snippet:   cleanedText.substring(0, 500),
                fullBody:  cleanedText,
            });

            const docId = info.lastInsertRowid;
            if (docId) {
                this._stmtInsertVec.run(docId, blob);
                return { success: true, id: docId };
            }
            return { skipped: true, reason: 'insert-ignored' };
        } catch (e) {
            logger.error('Slack ingest failed:', e.message);
            return { error: e.message };
        }
    }

    // ── Search ────────────────────────────────────────────────────────────────

    /**
     * Semantic search with optional SQL metadata filters.
     *
     * @param {string} query - Natural language search query
     * @param {number} k     - Max results (default: 5)
     * @param {Object} filter - Optional SQL filters, e.g.:
     *   { hasActionItem: true, folder: 'Inbox', type: 'email',
     *     receivedAfter: '2026-01-01', fromManager: true }
     * @returns {Promise<Array>} Array of matching documents with similarity scores
     */
    async search(query, k = 5, filter = {}) {
        if (!this.loaded) await this.init();

        try {
            const vector = await this.getEmbedding(query);
            return this.searchByVector(vector, k, filter);
        } catch (e) {
            logger.error('Search failed:', e.message);
            return [];
        }
    }

    /**
     * Search by pre-computed vector. Used by ai-insights.js for meeting similarity.
     */
    searchByVector(vector, k = 5, filter = {}) {
        if (!this.loaded) {
            logger.warn('searchByVector called before init — returning empty');
            return [];
        }

        try {
            const blob = this._toBlob(vector);

            // Build WHERE clause from filter object
            const conditions = [];
            const params = [blob, blob]; // first two are for vec_distance_l2

            if (filter.type)           { conditions.push('d.type = ?');           params.push(filter.type); }
            if (filter.folder)         { conditions.push('d.folder = ?');          params.push(filter.folder); }
            if (filter.hasActionItem)  { conditions.push('d.hasActionItem = 1'); }
            if (filter.hasDecision)    { conditions.push('d.hasDecision = 1'); }
            if (filter.hasBlocker)     { conditions.push('d.hasBlocker = 1'); }
            if (filter.requiresReply)  { conditions.push('d.requiresReply = 1'); }
            if (filter.fromManager)    { conditions.push('d.fromManager = 1'); }
            if (filter.receivedAfter)  { conditions.push('d.received >= ?');       params.push(filter.receivedAfter); }
            if (filter.receivedBefore) { conditions.push('d.received <= ?');       params.push(filter.receivedBefore); }
            if (filter.sender)         { conditions.push('d.sender LIKE ?');       params.push(`%${filter.sender}%`); }

            const whereClause = conditions.length > 0
                ? 'WHERE ' + conditions.join(' AND ')
                : '';

            // Pre-filter candidates then rank by vector distance
            // sqlite-vec v0.1.x uses vec_distance_L2(a, b) function
            const sql = `
                SELECT
                    d.*,
                    vec_distance_L2(v.embedding, ?) AS distance
                FROM documents d
                JOIN document_vectors v ON v.id = d.id
                ${whereClause}
                ORDER BY distance ASC
                LIMIT ?
            `;

            params.push(k * 3); // fetch 3x, then slice — handles filtered sets
            const rows = this.db.prepare(sql).all(...params);

            return rows.slice(0, k).map(row => ({
                ...row,
                topics: this._parseTopics(row.topics),
                similarity: parseFloat((1 / (1 + row.distance)).toFixed(3)),
            }));
        } catch (e) {
            logger.error('searchByVector failed:', e.message);
            return [];
        }
    }

    // ── Metadata updates ──────────────────────────────────────────────────────

    /**
     * Update AI enrichment tags for a document.
     * Called by email-tagger.js after ingestion.
     */
    updateEnrichment(outlookId, tags) {
        if (!this.loaded) return false;

        const row = this._stmtGetByOutlookId.get(outlookId);
        if (!row) return false;

        this._stmtUpdateMeta.run({
            id:            row.id,
            hasActionItem: tags.hasActionItem ? 1 : 0,
            hasDecision:   tags.hasDecision   ? 1 : 0,
            hasBlocker:    tags.hasBlocker    ? 1 : 0,
            requiresReply: tags.requiresReply ? 1 : 0,
            sentiment:     tags.sentiment     || null,
            urgency:       tags.urgency       || 'normal',
            topics:        JSON.stringify(tags.topics || []),
            fromManager:   tags.fromManager   ? 1 : 0,
        });
        return true;
    }

    /**
     * Update user engagement signals.
     * Called when user opens/flags an email in the UI.
     */
    updateEngagement(outlookId, signals = {}) {
        if (!this.loaded) return false;

        const row = this._stmtGetByOutlookId.get(outlookId);
        if (!row) return false;

        const updates = [];
        const params = [];

        if (signals.userEngaged !== undefined) {
            updates.push('userEngaged = ?');
            params.push(signals.userEngaged ? 1 : 0);
            if (signals.userEngaged) {
                updates.push('engagedAt = datetime(\'now\')');
            }
        }
        if (signals.userMarkedImportant !== undefined) {
            updates.push('userMarkedImportant = ?');
            params.push(signals.userMarkedImportant ? 1 : 0);
        }

        if (updates.length === 0) return false;
        updates.push('lastUpdated = datetime(\'now\')');
        params.push(row.id);

        this.db.prepare(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        return true;
    }

    // Legacy compat: updateMetadata called by background-agent.js
    updateMetadata(outlookId, updates) {
        return this.updateEngagement(outlookId, updates);
    }

    // Legacy compat: getMetadata called by outlook-indexeddb-reader.js
    getMetadata(outlookId) {
        if (!this.loaded) return null;
        return this._stmtGetByOutlookId.get(outlookId) || null;
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    getStats() {
        if (!this.db) return { totalDocuments: 0 };

        const total = this.db.prepare('SELECT COUNT(*) as c FROM documents').get().c;
        const byType = this.db.prepare('SELECT type, COUNT(*) as c FROM documents GROUP BY type').all();
        const enriched = this.db.prepare(`
            SELECT
                SUM(hasActionItem) as withActionItems,
                SUM(hasDecision)   as withDecisions,
                SUM(hasBlocker)    as withBlockers,
                SUM(requiresReply) as requiresReply,
                SUM(CASE WHEN sentiment IS NOT NULL THEN 1 ELSE 0 END) as withSentiment
            FROM documents
        `).get();

        return {
            totalDocuments: total,
            byType: Object.fromEntries(byType.map(r => [r.type, r.c])),
            withActionItems:  enriched.withActionItems || 0,
            withDecisions:    enriched.withDecisions   || 0,
            withBlockers:     enriched.withBlockers    || 0,
            requiresReply:    enriched.requiresReply   || 0,
            withSentiment:    enriched.withSentiment   || 0,
            dimension:        VECTOR_DIMENSION,
            model:            EMBEDDING_MODEL,
            dbPath:           DB_PATH,
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _parseTopics(topicsStr) {
        try { return JSON.parse(topicsStr || '[]'); } catch { return []; }
    }
}

// Export singleton
const vectorStore = new VectorStore();
module.exports = vectorStore;
module.exports.default = vectorStore; // ESM compat (used by email-search.js with dynamic import)
module.exports.cleanBody = cleanBody;
