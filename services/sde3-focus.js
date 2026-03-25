const orgStore = require('./org-store');
const mcpClient = require('./mcp-client');
const engMetrics = require('./eng-metrics');
const ticketing = require('./ticketing');
const oncall = require('./oncall');
const logger = require('./logger').child('SDE3-Focus');

// Simple in-memory cache for SDE3 Focus
let sde3FocusCache = null;
let sde3FocusCacheTime = 0;
const SDE3_CACHE_TTL = 3600 * 1000; // 1 hour

/**
 * Identify SDE3s from the org structure.
 */
async function getSDE3s() {
    const members = await orgStore.getAllMembers();
    return members.filter(m => {
        const title = (m.jobTitle || '').toLowerCase();
        if (title.includes('manager') || title.includes('mgr') || title.includes('sdm')) {
            return false;
        }
        const level = m.level || 0;
        return level >= 6 
            || title.includes('engineer iii') 
            || title.includes('sde iii') 
            || title.includes('senior sde') 
            || title.includes('sr. software dev engineer')
            || title.includes('senior software dev engineer')
            || title.includes('sr. sde');
    });
}

/**
 * Generate full performance scorecards for all SDE3s.
 */
async function getSDE3FocusData(refresh = false) {
    const now = Date.now();
    
    if (!refresh && sde3FocusCache && (now - sde3FocusCacheTime < SDE3_CACHE_TTL)) {
        logger.info('Returning cached SDE3 focus data');
        return sde3FocusCache;
    }

    const sde3s = await getSDE3s();
    if (sde3s.length === 0) {
        return { sde3s: [], message: 'No SDE3s found in org.' };
    }

    // Initialize metrics
    const ytdData = await engMetrics.getYtdCodeMetrics().catch(() => null);
    const codeMetricsByAlias = {};
    if (ytdData && ytdData.engineers) {
        ytdData.engineers.forEach(e => { codeMetricsByAlias[e.alias] = e; });
    }

    const teamShifts = await oncall.getTeamShiftsYtd('authority-iamq').catch(() => []);
    
    const focusData = {};
    sde3s.forEach(s => { 
        focusData[s.alias] = { 
            ...s, 
            tasks: [],
            deliverables: {},
            ticketing: { total: 0, sev2: 0, sev3: 0, others: 0, oncallCount: 0, mttrHours: 0 },
            codeMetrics: codeMetricsByAlias[s.alias] || { crsCreated: 0, crsReviewed: 0, reviewRatioDisplay: '0.0' }
        }; 
    });

    const sde3Aliases = sde3s.map(s => s.alias);
    const batchSize = 5;
    const currentYear = new Date().getFullYear();

    for (let i = 0; i < sde3Aliases.length; i += batchSize) {
        const batch = sde3Aliases.slice(i, i + batchSize);
        await Promise.all(batch.map(async (alias) => {
            try {
                const userShifts = teamShifts.filter(s => s.members.includes(alias));
                const [openResult, closedResult, ticketingPerf] = await Promise.all([
                    mcpClient.callTool('builder-mcp', 'TaskeiListTasks', { assignee: alias, status: 'Open', pagination: { maxResults: 100 } }),
                    mcpClient.callTool('builder-mcp', 'TaskeiListTasks', { assignee: alias, status: 'Closed', pagination: { maxResults: 100 } }),
                    ticketing.getTicketingPerformance(alias, userShifts)
                ]);
                
                focusData[alias].ticketing = ticketingPerf;
                
                const openTasks = JSON.parse(openResult.content?.[0]?.text || '{}').tasks || [];
                const closedTasks = JSON.parse(closedResult.content?.[0]?.text || '{}').tasks || [];

                const processTask = (t, status) => {
                    const ecd = t.estimatedCompletionDate || t.customAttributes?.['Expected Completion Date'];
                    const ecdYear = ecd ? new Date(ecd).getFullYear() : null;
                    const lastUpdatedYear = t.lastUpdatedDate ? new Date(t.lastUpdatedDate).getFullYear() : currentYear;
                    const createYear = t.createDate ? new Date(t.createDate).getFullYear() : currentYear;

                    if (status === 'Closed') {
                        if (lastUpdatedYear !== currentYear) return;
                    } else {
                        if (ecdYear && ecdYear < currentYear) return; 
                        if (!ecdYear && lastUpdatedYear < currentYear && createYear < currentYear) return;
                    }
                    
                    const needBy = t.dueDate || t.customAttributes?.['Need By Date'] || t.customAttributes?.['Need By'];

                    // Aggregate parent goal for Deliverables Matrix
                    let parentId = t.roomId || t.room?.id;
                    let parentTitle = t.room?.name || 'Other Deliverables';
                    
                    // Prioritize formal "Parent Tasks" if they are Strategic Goals
                    if (t.parentTasks && t.parentTasks.length > 0) {
                        const strategicGoal = t.parentTasks.find(p => 
                            (p.shortId || '').match(/Goal-/i) || 
                            (p.name || '').match(/Goal-/i)
                        );
                        if (strategicGoal) {
                            parentId = strategicGoal.shortId || strategicGoal.id;
                            parentTitle = strategicGoal.name;
                        }
                    }

                    // Fallback: Extract from brackets in task title
                    if (parentTitle === 'Other Deliverables' || !parentTitle.match(/Goal-/i)) {
                        const bracketMatches = (t.name || t.title || '').match(/\[(.*?)\]/g);
                        if (bracketMatches && bracketMatches.length > 0) {
                            for (const match of bracketMatches) {
                                const tag = match.slice(1, -1).trim();
                                if (tag.match(/Goal-/i)) {
                                    parentTitle = tag;
                                    parentId = `tag-${tag}`;
                                    break;
                                }
                                if (!parentTitle || parentTitle === 'Other Deliverables') {
                                    if (!['story', 'epic', 'task', 'bug', 'ticket', 'feature', 'open', 'closed', 'oncall'].includes(tag.toLowerCase())) {
                                        parentTitle = tag;
                                        parentId = `tag-${tag}`;
                                    }
                                }
                            }
                        }
                    }

                    if (parentId && parentTitle) {
                        if (!focusData[alias].deliverables[parentId]) {
                            focusData[alias].deliverables[parentId] = { id: parentId, title: parentTitle, taskCount: 0 };
                        }
                        focusData[alias].deliverables[parentId].taskCount++;
                    }

                    focusData[alias].tasks.push({
                        id: t.shortId || t.id || t.taskId || 'Unknown',
                        title: t.name || t.title || '',
                        status,
                        priority: t.priority || 'Medium',
                        ecd: ecd || null,
                        needBy: needBy || null,
                        parentGoalId: parentId,
                        parentGoalTitle: parentTitle || 'Task'
                    });
                };

                openTasks.forEach(t => processTask(t, 'Open'));
                closedTasks.forEach(t => processTask(t, 'Closed'));
            } catch (e) {
                logger.error(`Search failed for ${alias}: ${e.message}`);
            }
        }));
    }

    const finalizedSDE3s = Object.values(focusData).map(sde => {
        const topDeliverables = Object.values(sde.deliverables)
            .sort((a, b) => b.taskCount - a.taskCount)
            .slice(0, 4);

        return {
            ...sde,
            topDeliverables
        };
    });

    const result = {
        sde3s: finalizedSDE3s,
        timestamp: new Date().toISOString()
    };

    sde3FocusCache = result;
    sde3FocusCacheTime = Date.now();
    return result;
}

module.exports = {
    getSDE3s,
    getSDE3FocusData
};
