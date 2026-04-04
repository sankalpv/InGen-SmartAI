/**
 * Insight Store
 * SQLite-based storage for proactive AI insights
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger').child('InsightStore');

const DB_PATH = path.join(process.cwd(), 'brain', 'insights.db');
const BRAIN_DIR = path.join(process.cwd(), 'brain');

// Ensure brain directory exists
if (!fs.existsSync(BRAIN_DIR)) {
    fs.mkdirSync(BRAIN_DIR, { recursive: true });
}

class InsightStore {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    logger.error('Failed to open database:', err);
                    reject(err);
                    return;
                }

                logger.info('Insight database opened');

                // Create tables
                this.db.serialize(() => {
                    // Insights table
                    this.db.run(`
                        CREATE TABLE IF NOT EXISTS insights (
                            id TEXT PRIMARY KEY,
                            type TEXT NOT NULL,
                            priority TEXT NOT NULL,
                            title TEXT NOT NULL,
                            description TEXT NOT NULL,
                            reasoning TEXT,
                            data JSON NOT NULL,
                            confidence REAL,
                            created_at INTEGER NOT NULL,
                            read_at INTEGER,
                            dismissed_at INTEGER,
                            acted_at INTEGER,
                            action_type TEXT,
                            feedback TEXT,
                            feedback_score INTEGER,
                            feedback_comment TEXT
                        )
                    `);

                    // Create indexes
                    this.db.run(`
                        CREATE INDEX IF NOT EXISTS idx_insights_unread 
                        ON insights(read_at) WHERE read_at IS NULL
                    `);
                    
                    this.db.run(`
                        CREATE INDEX IF NOT EXISTS idx_insights_priority 
                        ON insights(priority, created_at)
                    `);
                    
                    this.db.run(`
                        CREATE INDEX IF NOT EXISTS idx_insights_type 
                        ON insights(type, created_at)
                    `);

                    logger.info('Insight tables initialized');
                    this.initialized = true;
                    resolve();
                });
            });
        });
    }

    /**
     * Store a new insight
     */
    async storeInsight(insight) {
        if (!this.initialized) await this.init();

        const id = `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO insights (
                    id, type, priority, title, description, reasoning, 
                    data, confidence, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id,
                insight.type,
                insight.priority,
                insight.title,
                insight.description,
                insight.reasoning || '',
                JSON.stringify(insight),
                insight.confidence || 1.0,
                Date.now()
            ], (err) => {
                if (err) {
                    logger.error('Failed to store insight:', err);
                    reject(err);
                } else {
                    logger.info(`Stored insight: ${insight.title}`);
                    // Record in feedback store for adaptive learning
                    try { require('./feedback-store').recordAlertFired(id, insight.type).catch(() => {}); } catch (e) { /* feedback store not ready */ }
                    resolve(id);
                }
            });
        });
    }

    /**
     * Get unread insights
     */
    async getUnreadInsights(limit = 10) {
        if (!this.initialized) await this.init();

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM insights 
                WHERE read_at IS NULL AND dismissed_at IS NULL
                ORDER BY 
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                    END,
                    created_at DESC
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) {
                    logger.error('Failed to get unread insights:', err);
                    reject(err);
                } else {
                    const insights = rows.map(row => ({
                        ...JSON.parse(row.data),
                        id: row.id,
                        createdAt: row.created_at
                    }));
                    resolve(insights);
                }
            });
        });
    }

    /**
     * Get recent insights (last N days)
     */
    async getRecentInsights(days = 7, limit = 50) {
        if (!this.initialized) await this.init();

        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM insights 
                WHERE created_at > ?
                ORDER BY created_at DESC
                LIMIT ?
            `, [cutoff, limit], (err, rows) => {
                if (err) {
                    logger.error('Failed to get recent insights:', err);
                    reject(err);
                } else {
                    const insights = rows.map(row => ({
                        ...JSON.parse(row.data),
                        id: row.id,
                        createdAt: row.created_at,
                        readAt: row.read_at,
                        dismissedAt: row.dismissed_at,
                        actedAt: row.acted_at
                    }));
                    resolve(insights);
                }
            });
        });
    }

    /**
     * Mark insight as read
     */
    async markAsRead(insightId) {
        if (!this.initialized) await this.init();

        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE insights 
                SET read_at = ? 
                WHERE id = ?
            `, [Date.now(), insightId], (err) => {
                if (err) {
                    logger.error('Failed to mark as read:', err);
                    reject(err);
                } else {
                    logger.info(`Marked insight as read: ${insightId}`);
                    resolve();
                }
            });
        });
    }

    /**
     * Dismiss insight
     */
    async dismissInsight(insightId) {
        if (!this.initialized) await this.init();

        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE insights 
                SET dismissed_at = ? 
                WHERE id = ?
            `, [Date.now(), insightId], (err) => {
                if (err) {
                    logger.error('Failed to dismiss insight:', err);
                    reject(err);
                } else {
                    logger.info(`Dismissed insight: ${insightId}`);
                    try { require('./feedback-store').recordAlertOutcome(insightId, 'dismissed').catch(() => {}); } catch (e) { /* */ }
                    resolve();
                }
            });
        });
    }

    /**
     * Mark insight as acted upon
     */
    async markAsActed(insightId, actionType, feedback = null) {
        if (!this.initialized) await this.init();

        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE insights 
                SET acted_at = ?, action_type = ?, feedback = ? 
                WHERE id = ?
            `, [Date.now(), actionType, feedback, insightId], (err) => {
                if (err) {
                    logger.error('Failed to mark as acted:', err);
                    reject(err);
                } else {
                    logger.info(`Marked insight as acted: ${insightId}`);
                    try { require('./feedback-store').recordAlertOutcome(insightId, 'acted').catch(() => {}); } catch (e) { /* */ }
                    resolve();
                }
            });
        });
    }

    /**
     * Submit feedback for an insight
     */
    async submitFeedback(insightId, score, comment = null) {
        if (!this.initialized) await this.init();

        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE insights 
                SET feedback_score = ?, feedback_comment = ? 
                WHERE id = ?
            `, [score, comment, insightId], (err) => {
                if (err) {
                    logger.error('Failed to submit feedback:', err);
                    reject(err);
                } else {
                    logger.info(`Submitted feedback for insight: ${insightId} (score: ${score})`);
                    resolve();
                }
            });
        });
    }

    /**
     * Check if similar insight exists recently (dedupe)
     */
    async hasRecentSimilarInsight(type, title, hours = 24) {
        if (!this.initialized) await this.init();

        const cutoff = Date.now() - (hours * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT COUNT(*) as count FROM insights 
                WHERE type = ? AND title = ? AND created_at > ?
            `, [type, title, cutoff], (err, row) => {
                if (err) {
                    logger.error('Failed to check for duplicates:', err);
                    reject(err);
                } else {
                    resolve(row.count > 0);
                }
            });
        });
    }

    /**
     * Get insight statistics
     */
    async getStats(days = 30) {
        if (!this.initialized) await this.init();

        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) as read,
                    SUM(CASE WHEN acted_at IS NOT NULL THEN 1 ELSE 0 END) as acted,
                    SUM(CASE WHEN dismissed_at IS NOT NULL THEN 1 ELSE 0 END) as dismissed,
                    type,
                    priority,
                    AVG(confidence) as avg_confidence
                FROM insights
                WHERE created_at > ?
                GROUP BY type, priority
            `, [cutoff], (err, rows) => {
                if (err) {
                    logger.error('Failed to get stats:', err);
                    reject(err);
                } else {
                    // Calculate engagement rate
                    const total = rows.reduce((sum, r) => sum + r.total, 0);
                    const acted = rows.reduce((sum, r) => sum + r.acted, 0);
                    const engagementRate = total > 0 ? (acted / total * 100).toFixed(1) : 0;

                    resolve({
                        total,
                        engaged: acted,
                        engagementRate,
                        byType: rows.reduce((acc, r) => {
                            if (!acc[r.type]) acc[r.type] = { total: 0, acted: 0 };
                            acc[r.type].total += r.total;
                            acc[r.type].acted += r.acted;
                            return acc;
                        }, {}),
                        byPriority: rows.reduce((acc, r) => {
                            if (!acc[r.priority]) acc[r.priority] = { total: 0, acted: 0 };
                            acc[r.priority].total += r.total;
                            acc[r.priority].acted += r.acted;
                            return acc;
                        }, {}),
                        avgConfidence: rows.length > 0 
                            ? (rows.reduce((sum, r) => sum + r.avg_confidence, 0) / rows.length).toFixed(2)
                            : 0
                    });
                }
            });
        });
    }

    /**
     * Clean up old insights (older than N days)
     */
    async cleanupOldInsights(days = 90) {
        if (!this.initialized) await this.init();

        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

        return new Promise((resolve, reject) => {
            this.db.run(`
                DELETE FROM insights WHERE created_at < ?
            `, [cutoff], function(err) {
                if (err) {
                    logger.error('Failed to cleanup old insights:', err);
                    reject(err);
                } else {
                    logger.info(`Cleaned up ${this.changes} old insights`);
                    resolve(this.changes);
                }
            });
        });
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    logger.error('Error closing database:', err);
                } else {
                    logger.info('Database closed');
                }
            });
        }
    }
}

module.exports = new InsightStore();