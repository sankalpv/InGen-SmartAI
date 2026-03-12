/**
 * InGen Agent Memory Store — Phase 2
 * 
 * Persists agent task history for context chaining.
 * Enables follow-up tasks to reference previous results without re-running tools.
 * 
 * Storage: data/agent-history.json (last 10 tasks)
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('AgentMemory');

const HISTORY_PATH = path.join(process.cwd(), 'data', 'agent-history.json');
const MAX_HISTORY = 10;
const MAX_RESULT_LENGTH = 800; // Truncate results for context injection

// Follow-up detection patterns
const FOLLOW_UP_PATTERNS = [
    /\b(now|then|next|also)\b.*\b(draft|email|write|send|create|export|share)\b/i,
    /\b(about this|about that|about it|from that|from this|with this|with that)\b/i,
    /\b(more detail|elaborate|expand on|dig deeper|follow up|continue)\b/i,
    /\b(the same|those|these|that meeting|that person|that topic)\b/i,
    /\b(based on|given that|considering|using the)\b/i,
];

/**
 * Load task history from disk.
 */
function loadHistory() {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            const raw = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
            return Array.isArray(raw) ? raw : (raw.history || []);
        }
    } catch (e) {
        logger.warn('Failed to load agent history:', e.message);
    }
    return [];
}

/**
 * Save a completed task to history.
 * @param {Object} entry - { task, subAgent, evidence, result, totalElapsed }
 */
function saveTask(entry) {
    try {
        const history = loadHistory();

        const record = {
            id: `task-${Date.now()}`,
            task: entry.task,
            subAgent: entry.subAgent || null,
            toolCount: (entry.evidence || []).length,
            toolNames: (entry.evidence || []).map(e => e.tool),
            resultSummary: (entry.result || '').substring(0, MAX_RESULT_LENGTH),
            resultFull: entry.result || '',
            evidenceSummary: (entry.evidence || []).map(e => ({
                tool: e.tool,
                summary: e.result?.summary || '',
                count: e.result?.count || 0,
            })),
            totalElapsed: entry.totalElapsed,
            timestamp: new Date().toISOString(),
        };

        history.unshift(record); // Most recent first

        // Prune old entries
        while (history.length > MAX_HISTORY) history.pop();

        // Ensure data dir exists
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
        logger.info(`Saved task to history: "${entry.task?.substring(0, 50)}" (${history.length} total)`);
    } catch (e) {
        logger.error('Failed to save agent history:', e.message);
    }
}

/**
 * Get recent task summaries for context injection into the planner.
 * Returns last N task summaries formatted as a string.
 * @param {number} count - Number of recent tasks (default: 3)
 */
function getRecentContext(count = 3) {
    const history = loadHistory();
    if (history.length === 0) return '';

    const recent = history.slice(0, count);
    return recent.map((h, i) => {
        const ago = getTimeAgo(h.timestamp);
        const tools = h.toolNames?.join(', ') || 'unknown';
        const agent = h.subAgent ? ` [${h.subAgent}]` : '';
        return `[Previous Task ${i + 1}${agent} — ${ago}]
Task: "${h.task}"
Tools used: ${tools} (${h.toolCount} tools, ${h.totalElapsed}s)
Result summary: ${h.resultSummary?.substring(0, 300) || 'No result'}`;
    }).join('\n\n');
}

/**
 * Get the most recent task's full result (for follow-up injection).
 */
function getLastResult() {
    const history = loadHistory();
    return history.length > 0 ? history[0] : null;
}

/**
 * Detect if the current task is a follow-up to a previous task.
 * @param {string} task - Current task text
 * @returns {boolean}
 */
function isFollowUp(task) {
    const taskLower = (task || '').toLowerCase();
    return FOLLOW_UP_PATTERNS.some(p => p.test(taskLower));
}

/**
 * Get the full history for the UI (last 10 tasks, summarized).
 */
function getHistoryForUI() {
    const history = loadHistory();
    return history.map(h => ({
        id: h.id,
        task: h.task,
        subAgent: h.subAgent,
        toolCount: h.toolCount,
        totalElapsed: h.totalElapsed,
        timestamp: h.timestamp,
        timeAgo: getTimeAgo(h.timestamp),
    }));
}

/**
 * Get a specific task result by ID.
 */
function getTaskById(id) {
    const history = loadHistory();
    return history.find(h => h.id === id) || null;
}

/**
 * Helper: human-readable time ago.
 */
function getTimeAgo(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
}

module.exports = {
    loadHistory,
    saveTask,
    getRecentContext,
    getLastResult,
    isFollowUp,
    getHistoryForUI,
    getTaskById,
};
