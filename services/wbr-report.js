/**
 * WBR Report Service
 * Generates a Weekly Business Review report from SIM/Taskei goals
 * using builder-mcp's TaskeiListTasks and TaskeiGetTask tools.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('WBR');
const mcpClient = require('./mcp-client');

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
const CACHE_PATH = path.join(process.cwd(), 'brain', 'wbr-cache.json');
const ECD_HISTORY_PATH = path.join(process.cwd(), 'brain', 'ecd-history.json');
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Status sections in order
const STATUS_SECTIONS = [
    'Blocked', 'In Planning', 'Started', 'Open', 'Paused', 'Not Started',
    'DNM', 'Completed Late', 'Completed', 'Cancelled', 'Cut'
];

// Goal type sort order
const GOAL_TYPE_ORDER = {
    '00-STeam': 0, '02-eLT': 1, '04-VP': 2, '06-Director': 3, '08-2PT': 4
};

function getWbrConfig() {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        return settings.wbr || {};
    } catch (e) {
        return {};
    }
}

/**
 * Normalize workflowAction to one of our 10 status sections
 */
function normalizeStatus(workflowAction, blocked, taskStatus) {
    if (blocked) return 'Blocked';
    const action = (workflowAction || '').trim();
    // Map common Taskei workflow actions to our sections
    const mapping = {
        'Started': 'Started',
        'In Planning': 'In Planning',
        'In Progress': 'Started',
        'Blocked': 'Blocked',
        'Paused': 'Paused',
        'Not Started': 'Not Started',
        'Completed': 'Completed',
        'Completed Late': 'Completed Late',
        'Cancelled': 'Cancelled',
        'Canceled': 'Cancelled',
        'Cut': 'Cut',
        'DNM': 'DNM',
        'Did Not Meet': 'DNM',
        'Resolved': 'Completed',
        'Closed': 'Completed',
        // Additional actions that don't map to sections
        'Comment': null, // will use taskStatus fallback
        'Edit': null,
        'Assign': null,
        'Create': null,
    };
    
    if (mapping[action] !== undefined) {
        if (mapping[action] !== null) return mapping[action];
    } else if (action) {
        // Unknown action — try to infer from action name
    }
    
    // Fallback: use the task's status field (Open/Closed)
    const status = (taskStatus || '').trim();
    if (status === 'Closed') return 'Completed';
    if (status === 'Open') return 'Open';
    
    return 'Not Started';
}

/**
 * Extract status color from labels (status-green, status-red, status-yellow)
 */
function extractStatusColor(labels) {
    for (const label of (labels || [])) {
        const name = (label.name || '').toLowerCase();
        if (name.includes('status-green') || name === 'green') return 'Green';
        if (name.includes('status-red') || name === 'red') return 'Red';
        if (name.includes('status-yellow') || name === 'yellow') return 'Yellow';
    }
    return 'Missing';
}

/**
 * Extract custom attribute value by attribute ID pattern
 */
function getCustomAttr(attrs, idPattern) {
    const pattern = idPattern.toLowerCase().replace(/\s+/g, '_');
    for (const a of (attrs || [])) {
        const id = (a.attribute?.id || '').toLowerCase();
        const label = (a.attribute?.label || '').toLowerCase().replace(/\s+/g, '_');
        if (id.includes(pattern) || label.includes(pattern)) {
            return a.stringValue || a.multiLineStringValue?.content || null;
        }
    }
    return null;
}

/**
 * Format a date as mm-dd-yyyy
 */
function formatDate(dateStr) {
    if (!dateStr) return 'Missing';
    try {
        const d = new Date(dateStr);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}-${dd}-${yyyy}`;
    } catch (e) {
        return 'Missing';
    }
}

/**
 * Get the current ISO week number
 */
function getWeekNumber() {
    const d = new Date();
    const oneJan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
}

/**
 * Get week date range (Monday to Sunday)
 */
function getWeekRange() {
    const d = new Date();
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
        from: formatDate(monday),
        to: formatDate(sunday)
    };
}

/**
 * Parse a single goal task into WBR format
 */
function parseGoal(task) {
    const allLabels = [...(task.localLabels || []), ...(task.inheritedLabels || [])];
    const attrs = task.owningRoomCustomAttributes || [];

    const goalType = getCustomAttr(attrs, 'ascs_goal_type') || getCustomAttr(attrs, 'goal_type') || 'Missing';
    const pmOwner = getCustomAttr(attrs, 'project_contact') || getCustomAttr(attrs, 'pm_owner') || 'Missing';
    const pmtOwner = getCustomAttr(attrs, 'pmt_owner') || 'Missing';
    const peOwner = getCustomAttr(attrs, 'pe_owner') || 'Missing';
    const sdmOwner = getCustomAttr(attrs, 'sdm_owner') || 'Missing';
    const pathToGreen = getCustomAttr(attrs, 'path_to_green') || null;

    // Get announcement — it's a custom attribute in SIM called "Latest Announcement"
    let announcement = null;
    const announcementAttr = getCustomAttr(attrs, 'latest_announcement') 
        || getCustomAttr(attrs, 'announcement')
        || getCustomAttr(attrs, 'latest announcement');
    if (announcementAttr) {
        announcement = {
            text: announcementAttr,
            date: formatDate(task.lastUpdatedDate || task.lastCommentDate),
            author: task.lastUpdatedIdentity?.username || task.assignee?.username || 'unknown'
        };
    }

    // Fallback to comments if announcement custom attribute is empty
    if (!announcement && task.comments && task.comments.length > 0) {
        const latest = task.comments[0];
        announcement = {
            text: latest.content || latest.text || '',
            date: formatDate(latest.createDate || latest.lastUpdatedDate),
            author: latest.author?.username || latest.creator?.username || 'unknown'
        };
    }
    
    // Final fallback: use "Why this matters" custom attribute
    if (!announcement || !announcement.text) {
        const whyMatters = getCustomAttr(attrs, 'why_this_matters') || getCustomAttr(attrs, 'why this matters');
        if (whyMatters) {
            announcement = {
                text: whyMatters,
                date: formatDate(task.lastUpdatedDate || task.lastCommentDate),
                author: task.lastUpdatedIdentity?.username || task.assignee?.username || 'unknown'
            };
        }
    }

    // Extract additional useful attributes
    const theme = getCustomAttr(attrs, 'theme') || null;
    const measurement = getCustomAttr(attrs, 'measurement') || null;
    const successCriteria = getCustomAttr(attrs, 'success_criteria') || null;

    return {
        id: task.shortId || task.id,
        title: task.name || 'Untitled',
        description: task.description || '',
        status: normalizeStatus(task.workflowAction, task.blocked, task.status),
        statusColor: extractStatusColor(allLabels),
        ecd: formatDate(task.estimatedCompletionDate),
        goalType,
        quad: { pm: pmOwner, pmt: pmtOwner, tech: peOwner, sdm: sdmOwner },
        assignee: task.assignee?.username || 'unassigned',
        assigneeName: task.assignee?.name || task.assignee?.username || 'unassigned',
        announcement,
        theme,
        measurement,
        successCriteria,
        pathToGreen,
        subtasks: (task.subtasks || []).map(s => ({
            id: s.shortId || s.id,
            title: s.name || '',
            status: s.status || 'Open',
            assignee: s.assignee?.username || 'unassigned',
            assigneeName: s.assignee?.name || '',
            ecd: formatDate(s.estimatedCompletionDate),
        })),
        lastUpdated: formatDate(task.lastUpdatedDate),
        blocked: task.blocked || false,
        blockedReason: task.blockedReason || null,
    };
}

/**
 * Fetch all goals from the SIM folder and build the WBR report.
 */
async function generateWbrReport(forceRefresh = false) {
    // Check cache
    if (!forceRefresh) {
        try {
            if (fs.existsSync(CACHE_PATH)) {
                const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
                if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
                    logger.info('Returning cached WBR report');
                    return cached.report;
                }
            }
        } catch (e) { /* ignore */ }
    }

    const config = getWbrConfig();
    if (!config.roomId || !config.folderId) {
        throw new Error('WBR config missing roomId/folderId in config/settings.json');
    }

    logger.info('Generating WBR report...');

    // Step 1 & 2: Enumerate goals by ID pattern (CPP2026Goal-1 through CPP2026Goal-50)
    // This ensures we find ALL goals regardless of which folder/sub-folder they're in
    const prefix = config.goalPrefix || 'CPP2026Goal';
    const maxGoalNum = 50; // generous upper bound
    const goalIds = [];
    for (let n = 1; n <= maxGoalNum; n++) goalIds.push(`${prefix}-${n}`);
    
    logger.info(`Enumerating ${goalIds.length} potential goal IDs (${prefix}-1 to ${prefix}-${maxGoalNum})...`);
    
    const goals = [];
    const batchSize = 5;
    for (let i = 0; i < goalIds.length; i += batchSize) {
        const batch = goalIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(async (goalId) => {
                try {
                    const result = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
                        taskId: goalId,
                        includeCustomAttributes: true,
                        commentLimit: 1
                    });
                    const text = result.content?.map(c => c.text || '').join('') || '{}';
                    const data = JSON.parse(text);
                    if (data.task) {
                        return parseGoal(data.task);
                    }
                    return null;
                } catch (e) {
                    // Goal doesn't exist — skip silently
                    return null;
                }
            })
        );
        const found = batchResults.filter(Boolean);
        goals.push(...found);
        if (found.length > 0) {
            logger.info(`Batch ${Math.floor(i/batchSize)+1}: found ${found.length} goals (total: ${goals.length})`);
        }
    }
    
    logger.info(`Goal enumeration complete: ${goals.length} goals found out of ${maxGoalNum} checked`);

    // Step 3: Organize into sections
    const weekNum = getWeekNumber();
    const weekRange = getWeekRange();

    const sections = STATUS_SECTIONS.map(sectionName => {
        const sectionGoals = goals
            .filter(g => g.status === sectionName)
            .sort((a, b) => {
                const aOrder = GOAL_TYPE_ORDER[a.goalType] ?? 99;
                const bOrder = GOAL_TYPE_ORDER[b.goalType] ?? 99;
                return aOrder - bOrder;
            });

        return {
            name: sectionName,
            goals: sectionGoals,
            count: sectionGoals.length
        };
    });

    // Build project tasks section (Started goals with child issues)
    const projectTasks = goals
        .filter(g => g.status === 'Started' && g.subtasks.length > 0)
        .sort((a, b) => {
            const aOrder = GOAL_TYPE_ORDER[a.goalType] ?? 99;
            const bOrder = GOAL_TYPE_ORDER[b.goalType] ?? 99;
            return aOrder - bOrder;
        });

    const report = {
        title: config.title || 'Weekly Business Review',
        subtitle: `For Week ${weekNum}, from ${weekRange.from} to ${weekRange.to}`,
        weekNumber: weekNum,
        weekRange,
        generatedAt: new Date().toISOString(),
        totalGoals: goals.length,
        sections,
        projectTasks,
        summary: {
            total: goals.length,
            byStatus: {},
            byColor: { Green: 0, Yellow: 0, Red: 0, Missing: 0 },
            byGoalType: {}
        }
    };

    // Compute summary stats
    for (const g of goals) {
        report.summary.byStatus[g.status] = (report.summary.byStatus[g.status] || 0) + 1;
        report.summary.byColor[g.statusColor] = (report.summary.byColor[g.statusColor] || 0) + 1;
        report.summary.byGoalType[g.goalType] = (report.summary.byGoalType[g.goalType] || 0) + 1;
    }

    // Compute ECD alerts (missed + upcoming within 3 days)
    const today = new Date(new Date().toDateString());
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    const parseEcd = (ecdStr) => {
        if (!ecdStr || ecdStr === 'Missing') return null;
        try {
            const [mm, dd, yyyy] = ecdStr.split('-').map(Number);
            return new Date(yyyy, mm - 1, dd);
        } catch (e) { return null; }
    };

    const missedEcd = [];
    const ecdSoon = [];
    const closedStatuses = ['Completed', 'Closed', 'Cancelled', 'Cut', 'DNM', 'Completed Late'];

    for (const g of goals) {
        // Check goal-level ECD
        const gEcd = parseEcd(g.ecd);
        if (gEcd && !closedStatuses.includes(g.status)) {
            if (gEcd < today) {
                missedEcd.push({ id: g.id, title: g.title, ecd: g.ecd, assignee: g.assignee, type: 'goal', parentGoal: null });
            } else if (gEcd <= threeDaysFromNow) {
                ecdSoon.push({ id: g.id, title: g.title, ecd: g.ecd, assignee: g.assignee, type: 'goal', parentGoal: null });
            }
        }
        // Check child issue ECDs
        for (const s of (g.subtasks || [])) {
            const sEcd = parseEcd(s.ecd);
            if (sEcd && s.status !== 'Closed') {
                if (sEcd < today) {
                    missedEcd.push({ id: s.id, title: s.title, ecd: s.ecd, assignee: s.assignee, type: 'child', parentGoal: g.id });
                } else if (sEcd <= threeDaysFromNow) {
                    ecdSoon.push({ id: s.id, title: s.title, ecd: s.ecd, assignee: s.assignee, type: 'child', parentGoal: g.id });
                }
            }
        }
    }

    report.summary.missedEcd = missedEcd;
    report.summary.ecdSoon = ecdSoon;

    // ECD Change Tracking — compare against previous snapshot
    const ecdChanges = computeEcdChanges(goals);
    report.summary.ecdChanges = ecdChanges;

    // Save current ECD snapshot
    saveEcdSnapshot(goals);

    // Cache
    try {
        const brainDir = path.join(process.cwd(), 'brain');
        if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
        fs.writeFileSync(CACHE_PATH, JSON.stringify({ report, timestamp: Date.now() }, null, 2));
    } catch (e) { /* ignore */ }

    logger.info(`WBR report generated: ${goals.length} goals in ${sections.filter(s => s.count > 0).length} active sections`);
    return report;
}

// ─── ECD History Tracking ───

function loadEcdHistory() {
    try {
        if (fs.existsSync(ECD_HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(ECD_HISTORY_PATH, 'utf8'));
        }
    } catch (e) { /* ignore */ }
    return { snapshots: {} };
}

function saveEcdSnapshot(goals) {
    try {
        const history = loadEcdHistory();
        const todayKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        const snapshot = {};
        for (const g of goals) {
            if (g.ecd && g.ecd !== 'Missing') {
                snapshot[g.id] = { ecd: g.ecd, title: g.title, assignee: g.assignee, type: 'goal' };
            }
            for (const s of (g.subtasks || [])) {
                if (s.ecd && s.ecd !== 'Missing') {
                    snapshot[s.id] = { ecd: s.ecd, title: s.title, assignee: s.assignee, type: 'child', parentGoal: g.id };
                }
            }
        }
        
        history.snapshots[todayKey] = snapshot;
        
        // Keep only last 12 weeks of snapshots
        const keys = Object.keys(history.snapshots).sort().reverse();
        if (keys.length > 12) {
            for (const k of keys.slice(12)) {
                delete history.snapshots[k];
            }
        }
        
        const brainDir = path.join(process.cwd(), 'brain');
        if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
        fs.writeFileSync(ECD_HISTORY_PATH, JSON.stringify(history, null, 2));
        logger.info(`ECD snapshot saved for ${todayKey}: ${Object.keys(snapshot).length} items`);
    } catch (e) {
        logger.warn('Failed to save ECD snapshot:', e.message);
    }
}

function computeEcdChanges(goals) {
    const history = loadEcdHistory();
    const dates = Object.keys(history.snapshots).sort().reverse();
    
    // Find the most recent PREVIOUS snapshot (not today)
    const todayKey = new Date().toISOString().split('T')[0];
    const previousDate = dates.find(d => d !== todayKey);
    
    if (!previousDate) {
        return { slipped: [], pulledIn: [], unchanged: 0, previousDate: null, totalChanged: 0 };
    }
    
    const previousSnapshot = history.snapshots[previousDate];
    const slipped = [];
    const pulledIn = [];
    let unchanged = 0;
    
    const parseEcdDate = (ecdStr) => {
        if (!ecdStr || ecdStr === 'Missing') return null;
        try {
            const [mm, dd, yyyy] = ecdStr.split('-').map(Number);
            return new Date(yyyy, mm - 1, dd);
        } catch (e) { return null; }
    };
    
    const daysDiff = (d1, d2) => Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
    
    for (const g of goals) {
        const prev = previousSnapshot[g.id];
        if (prev && prev.ecd && g.ecd && g.ecd !== 'Missing' && prev.ecd !== g.ecd) {
            const prevDate = parseEcdDate(prev.ecd);
            const currDate = parseEcdDate(g.ecd);
            if (prevDate && currDate) {
                const diff = daysDiff(currDate, prevDate);
                const item = { id: g.id, title: g.title, assignee: g.assignee, type: 'goal', parentGoal: null, previousEcd: prev.ecd, currentEcd: g.ecd, daysDiff: diff };
                if (diff > 0) slipped.push(item);
                else pulledIn.push(item);
            }
        } else if (prev && prev.ecd === g.ecd) {
            unchanged++;
        }
        
        // Check child tasks
        for (const s of (g.subtasks || [])) {
            const prevChild = previousSnapshot[s.id];
            if (prevChild && prevChild.ecd && s.ecd && s.ecd !== 'Missing' && prevChild.ecd !== s.ecd) {
                const prevDate = parseEcdDate(prevChild.ecd);
                const currDate = parseEcdDate(s.ecd);
                if (prevDate && currDate) {
                    const diff = daysDiff(currDate, prevDate);
                    const item = { id: s.id, title: s.title, assignee: s.assignee, type: 'child', parentGoal: g.id, previousEcd: prevChild.ecd, currentEcd: s.ecd, daysDiff: diff };
                    if (diff > 0) slipped.push(item);
                    else pulledIn.push(item);
                }
            } else if (prevChild && prevChild.ecd === s.ecd) {
                unchanged++;
            }
        }
    }
    
    // Sort by absolute drift magnitude
    slipped.sort((a, b) => b.daysDiff - a.daysDiff);
    pulledIn.sort((a, b) => a.daysDiff - b.daysDiff);
    
    return {
        slipped,
        pulledIn,
        unchanged,
        previousDate,
        totalChanged: slipped.length + pulledIn.length
    };
}


module.exports = {
    generateWbrReport,
    getWbrConfig,
    STATUS_SECTIONS,
    GOAL_TYPE_ORDER,
};
