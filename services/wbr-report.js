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
const CACHE_TTL = 6 * 24 * 60 * 60 * 1000; // 6 days — goals don't change often; Refresh button forces fresh fetch

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
        throw new Error('WBR config missing roomId/folderId in config/settings.json. Go to Settings to configure.');
    }

    logger.info('Generating WBR report...');

    // Step 1: List all goals in the SIM folder using TaskeiListTasks
    // Fetches ALL statuses (Open + Closed) with pagination support
    logger.info(`Listing tasks in folder ${config.folderId} (room: ${config.roomId})...`);
    let goalIds = [];
    try {
        let hasMore = true;
        let afterCursor = undefined;
        while (hasMore) {
            const listParams = {
                roomId: config.roomId,
                folderId: config.folderId,
                status: 'ALL',
                pagination: { maxResults: 100 }
            };
            if (afterCursor) listParams.pagination.after = afterCursor;

            const listResult = await mcpClient.callTool('builder-mcp', 'TaskeiListTasks', listParams);
            const listText = listResult.content?.map(c => c.text || '').join('') || '{}';
            const listData = JSON.parse(listText);
            const tasks = listData.tasks || [];
            const newIds = tasks.map(t => t.shortId).filter(Boolean);
            goalIds.push(...newIds);

            // Check for pagination
            const pageInfo = listData.pageInfo || {};
            hasMore = pageInfo.hasNextPage === true && pageInfo.endCursor;
            afterCursor = pageInfo.endCursor;
            if (hasMore) logger.info(`TaskeiListTasks page returned ${newIds.length} goals, fetching next page...`);
        }
        logger.info(`TaskeiListTasks returned ${goalIds.length} goals total (all statuses)`);

        // If TaskeiListTasks returned 0 results, fall back to prefix enumeration
        if (goalIds.length === 0) {
            const prefix = config.goalPrefix || 'Goal';
            const maxGoalNum = 50;
            logger.warn(`TaskeiListTasks returned 0 goals — falling back to prefix enumeration (${prefix}-1 to ${prefix}-${maxGoalNum})`);
            for (let n = 1; n <= maxGoalNum; n++) goalIds.push(`${prefix}-${n}`);
        }

        // Gap-fill: TaskeiListTasks can intermittently drop tasks from results.
        // Enumerate all IDs from 1..max+5 and add any missing ones for direct fetch.
        const prefix = config.goalPrefix || 'Goal';
        const goalNums = goalIds.map(id => {
            const m = id.match(/-(\d+)$/);
            return m ? parseInt(m[1], 10) : 0;
        }).filter(n => n > 0);
        const maxNum = Math.max(...goalNums, 0);
        if (maxNum > 0) {
            const existingSet = new Set(goalIds);
            const gapIds = [];
            for (let n = 1; n <= maxNum + 5; n++) {
                const candidateId = `${prefix}-${n}`;
                if (!existingSet.has(candidateId)) {
                    gapIds.push(candidateId);
                }
            }
            if (gapIds.length > 0) {
                logger.info(`Gap-fill: ${gapIds.length} potential missing IDs detected (${gapIds.join(', ')}). Will attempt direct fetch.`);
                goalIds.push(...gapIds);
            }
        }
    } catch (e) {
        // Fallback: use goalPrefix enumeration if TaskeiListTasks fails
        logger.warn(`TaskeiListTasks failed: ${e.message}. Falling back to prefix enumeration.`);
        const prefix = config.goalPrefix || 'Goal';
        const maxGoalNum = 50;
        for (let n = 1; n <= maxGoalNum; n++) goalIds.push(`${prefix}-${n}`);
        logger.info(`Fallback: enumerating ${goalIds.length} potential goal IDs (${prefix}-1 to ${prefix}-${maxGoalNum})`);
    }

    // Step 2: Fetch full details for each goal (custom attributes, subtasks, comments)
    // Helper: fetch a single goal with parsing
    async function fetchGoalDetail(goalId) {
        const result = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
            taskId: goalId,
            includeCustomAttributes: true,
            commentLimit: 1
        });
        const text = result.content?.map(c => c.text || '').join('') || '{}';
        const data = JSON.parse(text);
        if (data.task) return parseGoal(data.task);
        if (data.error) throw new Error(`MCP error: ${data.error}`);
        return null;
    }

    // Fetch goals sequentially (1 at a time) — most reliable for Taskei rate limits
    const goals = [];
    const failedIds = [];
    for (let i = 0; i < goalIds.length; i++) {
        const goalId = goalIds[i];
        try {
            const result = await fetchGoalDetail(goalId);
            if (result) { goals.push(result); }
            else { failedIds.push(goalId); }
        } catch (e) {
            failedIds.push(goalId);
            if (e.message?.includes('Throttl')) {
                logger.warn(`Goal ${goalId}: throttled, waiting 3s...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
        // Log progress every 10 goals
        if ((i + 1) % 10 === 0 || i === goalIds.length - 1) {
            logger.info(`Progress: ${goals.length}/${i + 1} loaded (${goalIds.length - i - 1} remaining, ${failedIds.length} failed)`);
        }
        // Rate limit: 1s between each call
        if (i < goalIds.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    // P0 FIX: Aggressive retry — never silently drop goals
    // Retry ALL failed IDs (no gap-fill vs real distinction) up to 3 times with exponential backoff
    const MAX_RETRY_ROUNDS = 3;
    const RETRY_BACKOFF = [5000, 10000, 15000]; // 5s, 10s, 15s between rounds
    let currentFailedIds = [...failedIds];

    for (let round = 0; round < MAX_RETRY_ROUNDS && currentFailedIds.length > 0; round++) {
        const backoff = RETRY_BACKOFF[round] || 15000;
        logger.info(`Retry round ${round + 1}/${MAX_RETRY_ROUNDS}: ${currentFailedIds.length} goals to retry (backoff: ${backoff / 1000}s)`);
        await new Promise(r => setTimeout(r, backoff));

        const stillFailed = [];
        for (const goalId of currentFailedIds) {
            try {
                const result = await fetchGoalDetail(goalId);
                if (result) {
                    goals.push(result);
                    logger.info(`Retry round ${round + 1} OK: ${goalId} (total: ${goals.length})`);
                } else {
                    stillFailed.push(goalId);
                }
            } catch (e) {
                stillFailed.push(goalId);
                if (e.message?.includes('Throttl')) {
                    await new Promise(r => setTimeout(r, 5000)); // Extra 5s for throttle
                }
            }
            await new Promise(r => setTimeout(r, 2000)); // 2s between each retry call
        }
        currentFailedIds = stillFailed;
    }

    // Validation gate: check if any goals from the original TaskeiListTasks are still missing
    const loadedIdSet = new Set(goals.map(g => g.id));
    const originalMissing = goalIds.filter(id => !loadedIdSet.has(id));
    // Separate genuinely missing (not found in Taskei) from fetch failures
    // Gap-fill IDs that don't exist are expected — filter those out
    const knownGoalNums = goals.map(g => parseInt(g.id.match(/-(\d+)$/)?.[1] || '0')).filter(n => n > 0);
    const maxKnownNum = Math.max(...knownGoalNums, 0);
    const genuinelyMissing = originalMissing.filter(id => {
        const num = parseInt(id.match(/-(\d+)$/)?.[1] || '0');
        // If the ID was in the original TaskeiListTasks response, it's a real miss
        // Gap-fill IDs beyond the max known goal are expected to not exist
        return num <= maxKnownNum;
    });

    if (genuinelyMissing.length > 0) {
        logger.error(`⚠️ CRITICAL: ${genuinelyMissing.length} goals STILL MISSING after ${MAX_RETRY_ROUNDS} retries: ${genuinelyMissing.join(', ')}`);
    }
    if (originalMissing.length > genuinelyMissing.length) {
        const gapFillMissing = originalMissing.filter(id => !genuinelyMissing.includes(id));
        logger.info(`Gap-fill: ${gapFillMissing.length} speculative IDs don't exist (expected): ${gapFillMissing.join(', ')}`);
    }
    
    logger.info(`WBR goal loading complete: ${goals.length}/${goalIds.length} goals with full details`);

    // Step 2.5: Fetch latest announcements (comments) from combinedThread via ReadInternalWebsites
    // TaskeiGetTask doesn't reliably return comments; the combinedThread from the web page does.
    logger.info(`Fetching latest announcements for ${goals.length} goals via ReadInternalWebsites...`);
    const ANNOUNCEMENT_BATCH_SIZE = 10;
    for (let batchStart = 0; batchStart < goals.length; batchStart += ANNOUNCEMENT_BATCH_SIZE) {
        const batch = goals.slice(batchStart, batchStart + ANNOUNCEMENT_BATCH_SIZE);
        const urls = batch.map(g => `https://taskei.amazon.dev/tasks/${g.id}`);
        try {
            const batchResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
                inputs: urls,
                concurrencyLimit: ANNOUNCEMENT_BATCH_SIZE
            });
            const content = batchResult?.content;
            if (Array.isArray(content)) {
                for (const item of content) {
                    try {
                        let outer = null;
                        if (item?.text) { try { outer = JSON.parse(item.text); } catch(e) {} }
                        else if (typeof item === 'string') { try { outer = JSON.parse(item); } catch(e) {} }
                        else { outer = item; }
                        if (!outer) continue;
                        const innerItems = outer?.content || [outer];
                        const arr = Array.isArray(innerItems) ? innerItems : [innerItems];
                        for (const inner of arr) {
                            if (inner?.combinedThread?.items) {
                                // Find the goal this thread belongs to by matching issue shortId
                                const issueId = inner?.issue?.shortId || '';
                                const threadItems = inner.combinedThread.items;
                                // Get the latest comment from the thread
                                const latestComment = threadItems.find(ti => ti.payload?.type === 'COMMENT');
                                if (latestComment && latestComment.payload?.comment) {
                                    const comment = latestComment.payload.comment;
                                    // Find the matching goal and update its announcement
                                    const matchingGoal = goals.find(g => {
                                        // Match by shortId in issue, or by checking if any goal ID appears in the thread's issue
                                        if (issueId && g.id === issueId) return true;
                                        // Also match by issue title as fallback
                                        if (inner?.issue?.title && g.title === inner.issue.title) return true;
                                        return false;
                                    });
                                    if (matchingGoal) {
                                        matchingGoal.announcement = {
                                            text: comment.message || '',
                                            date: formatDate(comment.createDate || comment.lastUpdatedDate),
                                            author: comment.author?.name || comment.submitter?.name || 'unknown'
                                        };
                                    }
                                }
                            }
                        }
                    } catch (e) { /* skip parse errors */ }
                }
            }
            logger.info(`Announcements batch ${Math.floor(batchStart / ANNOUNCEMENT_BATCH_SIZE) + 1}/${Math.ceil(goals.length / ANNOUNCEMENT_BATCH_SIZE)} processed`);
        } catch (e) {
            logger.warn(`Announcement batch fetch failed at offset ${batchStart}: ${e.message}`);
        }
        // Small delay between batches
        if (batchStart + ANNOUNCEMENT_BATCH_SIZE < goals.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    const announcementCount = goals.filter(g => g.announcement?.text && !g.announcement.text.includes('In 2026')).length;
    logger.info(`Announcements loaded: ${announcementCount}/${goals.length} goals have latest team updates`);

    // Step 3: Filter out subtasks from top level — only goals matching goalPrefix are top-level
    // Child tasks (e.g. CDS-*) are already nested under their parent's subtasks array
    const goalPrefixFilter = config.goalPrefix || 'Goal';
    const topLevelGoals = goals.filter(g => g.id.startsWith(goalPrefixFilter));
    logger.info(`Filtered to ${topLevelGoals.length} top-level goals (from ${goals.length} total, removed ${goals.length - topLevelGoals.length} child tasks)`);

    // Step 4: Organize into sections
    const weekNum = getWeekNumber();
    const weekRange = getWeekRange();

    const sections = STATUS_SECTIONS.map(sectionName => {
        const sectionGoals = topLevelGoals
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
        totalGoals: topLevelGoals.length,
        sections,
        projectTasks,
        summary: {
            total: topLevelGoals.length,
            byStatus: {},
            byColor: { Green: 0, Yellow: 0, Red: 0, Missing: 0 },
            byGoalType: {}
        }
    };

    // Compute summary stats (from top-level goals only — excludes child tasks like CDS-*)
    for (const g of topLevelGoals) {
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
    report.summary.missingGoals = genuinelyMissing; // P0: surface any goals that couldn't be fetched

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
