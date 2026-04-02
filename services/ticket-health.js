const mcpClient = require('./mcp-client');
const oncallService = require('./oncall');
const logger = require('./logger').child('TicketHealth');
const fs = require('fs');
const path = require('path');

// In-memory cache (5 min TTL)
let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000;

function getSettings() {
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
        return {};
    }
}

function getUserAlias() {
    return getSettings().phonetoolAlias || 'unknown';
}

function daysSince(dateStr) {
    if (!dateStr) return 0;
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function ageBucket(days) {
    if (days >= 30) return 'critical';
    if (days >= 14) return 'warning';
    if (days >= 7) return 'attention';
    return 'ok';
}

// ─── MCP Calls ───

async function fetchResolverGroups() {
    logger.info('Fetching resolver groups via builder-mcp...');
    const result = await mcpClient.callTool('builder-mcp', 'TicketingReadActions', {
        action: 'get-my-resolver-groups',
    });

    // Parse the result
    const content = result?.content;
    if (!content) return [];

    let parsed;
    if (typeof content === 'string') {
        parsed = JSON.parse(content);
    } else if (Array.isArray(content)) {
        const textItem = content.find(c => c.type === 'text');
        parsed = textItem ? JSON.parse(textItem.text) : {};
    } else {
        parsed = content;
    }

    const groups = parsed?.data?.groups || parsed?.groups || [];
    logger.info(`Found ${groups.length} resolver groups`);
    return groups;
}

async function fetchOpenTickets(groupNames) {
    const allTickets = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < groupNames.length; i += BATCH_SIZE) {
        const batch = groupNames.slice(i, i + BATCH_SIZE);
        logger.info(`Fetching tickets for batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.join(', ')}`);

        try {
            const result = await mcpClient.callTool('builder-mcp', 'TicketingReadActions', {
                action: 'search-tickets',
                input: {
                    assignedGroup: batch,
                    status: ['Assigned', 'Researching', 'Work In Progress', 'Pending'],
                    sort: 'lastUpdatedDate desc',
                    rows: 100,
                    responseFields: [
                        'id', 'title', 'extensions.tt.status', 'extensions.tt.assignedGroup',
                        'assigneeIdentity', 'createDate', 'lastUpdatedDate',
                        'extensions.tt.impact', 'extensions.tt.rootCause',
                    ],
                },
            });

            const content = result?.content;
            let parsed;
            if (typeof content === 'string') {
                parsed = JSON.parse(content);
            } else if (Array.isArray(content)) {
                const textItem = content.find(c => c.type === 'text');
                parsed = textItem ? JSON.parse(textItem.text) : {};
            } else {
                parsed = content;
            }

            const tickets = parsed?.data?.tickets || [];
            allTickets.push(...tickets);
        } catch (err) {
            logger.error(`Failed to fetch tickets for batch: ${err.message}`);
        }
    }

    logger.info(`Total open tickets fetched: ${allTickets.length}`);
    return allTickets;
}

async function fetchResolvedTickets(groupNames, days = 30) {
    const allTickets = [];
    const BATCH_SIZE = 5;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    for (let i = 0; i < groupNames.length; i += BATCH_SIZE) {
        const batch = groupNames.slice(i, i + BATCH_SIZE);

        try {
            const result = await mcpClient.callTool('builder-mcp', 'TicketingReadActions', {
                action: 'search-tickets',
                input: {
                    assignedGroup: batch,
                    status: ['Resolved'],
                    lastResolvedDate: `[${sinceDate} TO NOW]`,
                    sort: 'lastResolvedDate desc',
                    rows: 100,
                    responseFields: [
                        'id', 'title', 'extensions.tt.status', 'extensions.tt.assignedGroup',
                        'createDate', 'lastResolvedDate',
                    ],
                },
            });

            const content = result?.content;
            let parsed;
            if (typeof content === 'string') {
                parsed = JSON.parse(content);
            } else if (Array.isArray(content)) {
                const textItem = content.find(c => c.type === 'text');
                parsed = textItem ? JSON.parse(textItem.text) : {};
            } else {
                parsed = content;
            }

            const tickets = parsed?.data?.tickets || [];
            allTickets.push(...tickets);
        } catch (err) {
            logger.error(`Failed to fetch resolved tickets: ${err.message}`);
        }
    }

    return allTickets;
}

// ─── Parsing helpers ───

function extractAlias(assigneeIdentity) {
    if (!assigneeIdentity) return null;
    // "kerberos:sankalpv@ANT.AMAZON.COM" → "sankalpv"
    if (assigneeIdentity.startsWith('kerberos:')) {
        const email = assigneeIdentity.replace('kerberos:', '');
        return email.split('@')[0];
    }
    // "email-alias:UUID" → keep as-is (we can't resolve)
    return assigneeIdentity;
}

function getTicketGroup(ticket) {
    return ticket?.extensions?.tt?.assignedGroup || 'Unknown';
}

function getTicketStatus(ticket) {
    return ticket?.extensions?.tt?.status || 'Unknown';
}

// ─── Dashboard Builder ───

async function buildDashboard(forceRefresh = false) {
    // Check cache
    if (!forceRefresh && cache.data && (Date.now() - cache.timestamp) < CACHE_TTL) {
        logger.info('Returning cached dashboard');
        return cache.data;
    }

    const userAlias = getUserAlias();
    logger.info(`Building ticket health dashboard for user: ${userAlias}`);

    // 1. Fetch resolver groups
    const groups = await fetchResolverGroups();
    const groupNames = groups.map(g => g.name);

    if (groupNames.length === 0) {
        return { empty: true, message: 'No resolver groups found for current user.' };
    }

    // 2. Build group metadata
    const groupMeta = {};
    for (const g of groups) {
        const primaryOwner = g.primaryOwner?.value || null;
        const secondaryOwners = (g.secondaryOwners || []).map(o => o.value);
        let role = 'Member';
        if (primaryOwner === userAlias) role = 'Primary Owner';
        else if (secondaryOwners.includes(userAlias)) role = 'Secondary Owner';

        groupMeta[g.name] = {
            id: g.id,
            name: g.name,
            description: g.description || '',
            location: g.location || '',
            primaryOwner,
            secondaryOwners,
            role,
            baselineStatus: g.baselineStatus || 'UNKNOWN',
            escalation: g.escalationIdentity?.value || null,
            status: g.status,
            businessHours: g.businessHours,
        };
    }

    // 3. Fetch open tickets
    const openTickets = await fetchOpenTickets(groupNames);

    // 4. Fetch resolved tickets (last 30 days) for velocity
    let resolvedTickets = [];
    try {
        resolvedTickets = await fetchResolvedTickets(groupNames, 30);
    } catch (e) {
        logger.warn('Could not fetch resolved tickets:', e.message);
    }

    // 5. Per-group breakdown
    const perGroup = {};
    for (const name of groupNames) {
        perGroup[name] = {
            ...groupMeta[name],
            open: 0,
            statusBreakdown: {},
            oldestAge: 0,
            oldestTicket: null,
            tickets: [],
            resolved30d: 0,
        };
    }

    for (const ticket of openTickets) {
        const group = getTicketGroup(ticket);
        const status = getTicketStatus(ticket);
        const age = daysSince(ticket.createDate);
        const alias = extractAlias(ticket.assigneeIdentity);

        if (!perGroup[group]) continue;

        perGroup[group].open++;
        perGroup[group].statusBreakdown[status] = (perGroup[group].statusBreakdown[status] || 0) + 1;

        if (age > perGroup[group].oldestAge) {
            perGroup[group].oldestAge = age;
            perGroup[group].oldestTicket = ticket.id;
        }

        perGroup[group].tickets.push({
            id: ticket.id,
            title: ticket.title,
            status,
            assignee: alias,
            createDate: ticket.createDate,
            lastUpdatedDate: ticket.lastUpdatedDate,
            age,
            ageBucket: ageBucket(age),
            impact: ticket?.extensions?.tt?.impact || null,
        });
    }

    for (const ticket of resolvedTickets) {
        const group = getTicketGroup(ticket);
        if (perGroup[group]) {
            perGroup[group].resolved30d++;
        }
    }

    // Sort tickets in each group by age descending
    for (const g of Object.values(perGroup)) {
        g.tickets.sort((a, b) => b.age - a.age);
    }

    // 6. Executive summary
    const totalOpen = openTickets.length;
    const totalResolved30d = resolvedTickets.length;

    const agingTickets = openTickets
        .map(t => {
            const group = getTicketGroup(t);
            const age = daysSince(t.createDate);
            return {
                id: t.id,
                title: t.title,
                group,
                status: getTicketStatus(t),
                assignee: extractAlias(t.assigneeIdentity),
                createDate: t.createDate,
                lastUpdatedDate: t.lastUpdatedDate,
                age,
                ageBucket: ageBucket(age),
            };
        })
        .sort((a, b) => b.age - a.age);

    const aging7d = agingTickets.filter(t => t.age >= 7).length;
    const aging14d = agingTickets.filter(t => t.age >= 14).length;
    const aging30d = agingTickets.filter(t => t.age >= 30).length;

    // My tickets
    const myTickets = agingTickets.filter(t => t.assignee === userAlias);

    // Status distribution
    const statusDist = {};
    for (const t of openTickets) {
        const s = getTicketStatus(t);
        statusDist[s] = (statusDist[s] || 0) + 1;
    }

    // Groups needing baseline
    const baselineOverdue = Object.values(groupMeta).filter(
        g => g.baselineStatus && g.baselineStatus !== 'UP_TO_DATE'
    ).length;

    // 7. Fetch current oncall for each resolver group (non-blocking — dashboard still loads if this fails)
    let oncallMap = {};
    try {
        oncallMap = await oncallService.getOncallForResolverGroups(groupNames);
    } catch (e) {
        logger.warn('Oncall lookup failed (non-blocking):', e.message);
    }

    // Groups sorted by open count
    const groupList = Object.values(perGroup).sort((a, b) => b.open - a.open);

    const dashboard = {
        userAlias,
        timestamp: new Date().toISOString(),
        summary: {
            totalOpen,
            totalResolved30d,
            aging7d,
            aging14d,
            aging30d,
            myTicketsCount: myTickets.length,
            totalGroups: groupNames.length,
            baselineOverdue,
            statusDistribution: statusDist,
        },
        groups: groupList.map(g => {
            const oc = oncallMap[g.name] || null;
            return {
                name: g.name,
                role: g.role,
                primaryOwner: g.primaryOwner,
                baselineStatus: g.baselineStatus,
                open: g.open,
                resolved30d: g.resolved30d,
                oldestAge: g.oldestAge,
                statusBreakdown: g.statusBreakdown,
                ticketCount: g.tickets.length,
                oncall: oc ? oc.oncall : [],
                oncallTeam: oc ? oc.teamName : null,
                shiftEnd: oc ? oc.shiftEnd : null,
            };
        }),
        agingTickets: agingTickets.filter(t => t.age >= 7).slice(0, 50),
        myTickets,
        allTickets: agingTickets,
    };

    // Cache it
    cache = { data: dashboard, timestamp: Date.now() };
    return dashboard;
}

async function getGroupDetail(groupName) {
    // Use cached data if available
    if (cache.data && (Date.now() - cache.timestamp) < CACHE_TTL) {
        const group = cache.data.allTickets.filter(t => t.group === groupName);
        return {
            groupName,
            tickets: group,
            total: group.length,
        };
    }

    // Otherwise fetch fresh
    const tickets = await fetchOpenTickets([groupName]);
    return {
        groupName,
        tickets: tickets.map(t => ({
            id: t.id,
            title: t.title,
            group: getTicketGroup(t),
            status: getTicketStatus(t),
            assignee: extractAlias(t.assigneeIdentity),
            createDate: t.createDate,
            lastUpdatedDate: t.lastUpdatedDate,
            age: daysSince(t.createDate),
            ageBucket: ageBucket(daysSince(t.createDate)),
        })),
        total: tickets.length,
    };
}

async function getMyTickets() {
    const dashboard = await buildDashboard();
    return dashboard.myTickets;
}

function clearCache() {
    cache = { data: null, timestamp: 0 };
}

module.exports = {
    buildDashboard,
    getGroupDetail,
    getMyTickets,
    clearCache,
};