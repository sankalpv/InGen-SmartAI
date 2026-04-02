/**
 * Oncall Service — Interface for Amazon Oncall shifts via builder-mcp
 */
const mcpClient = require('./mcp-client');
const logger = require('./logger').child('Oncall');

async function getTeamShiftsYtd(teamName, year = new Date().getFullYear()) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    
    try {
        const response = await mcpClient.callTool('builder-mcp', 'OncallReadActions', {
            action: 'get-team-shifts',
            teamName,
            startDate,
            endDate
        });

        if (response.isError) {
            logger.error(`Oncall fetch failed for ${teamName}:`, response.content);
            return [];
        }

        const rawText = response.content.find(c => c.type === 'text')?.text;
        if (!rawText) return [];

        const result = JSON.parse(rawText);
        if (result.status === 'success') {
            return (result.data || []).map(s => ({
                start: s.startDateTime,
                end: s.endDateTime,
                members: s.oncallMember || []
            }));
        }
        
        return [];
    } catch (e) {
        logger.error(`Oncall fetch failed for ${teamName}: ${e.message}`);
        return [];
    }
}

/**
 * Get current oncall for a list of resolver group names.
 * Uses search-teams to find oncall teams linked to resolver groups,
 * then extracts currentOncalls from the response.
 * 
 * @param {string[]} resolverGroupNames - Array of resolver group names
 * @returns {Object} Map of resolverGroupName → { oncall: string[], teamName: string, shiftEnd: string }
 */
async function getOncallForResolverGroups(resolverGroupNames) {
    if (!resolverGroupNames || resolverGroupNames.length === 0) return {};

    const result = {};

    // Build a set of resolver groups we're looking for
    const targetGroups = new Set(resolverGroupNames.map(g => g.toLowerCase()));

    // Search using each resolver group name directly as a search term.
    // The search-teams API matches against team names, descriptions, AND resolver group names,
    // so "QuartzDev" will find "authority-iamq" which has QuartzDev as a linked resolver group.
    const searchTerms = [...new Set(resolverGroupNames)];
    const teamsFound = new Map(); // teamName → team data (dedup)

    for (const term of searchTerms) {
        try {
            const response = await mcpClient.callTool('builder-mcp', 'OncallReadActions', {
                action: 'search-teams',
                query: term,
                size: 20,
            });

            const rawText = response?.content?.find(c => c.type === 'text')?.text;
            if (!rawText) continue;

            const parsed = JSON.parse(rawText);
            const teams = parsed?.data || [];

            for (const team of teams) {
                if (!teamsFound.has(team.teamName)) {
                    teamsFound.set(team.teamName, team);
                }
            }
        } catch (e) {
            logger.warn(`Oncall search failed for term "${term}":`, e.message);
        }
    }

    // Map resolver groups to oncall teams via the aliases.resolverGroups field
    // Two-pass matching to avoid false positives:
    //   Pass 1: Exact match (case-insensitive)
    //   Pass 2: Word-start match — one name must start with the other
    //           e.g. "Insights Onboarding".startsWith("Insights") → match
    //           but "kindle-insights-dev".startsWith("Insights") → no match
    const pendingMatches = []; // collect {matchedGroup, oncalls, teamName, shiftEnd, isExact}
    for (const [, team] of teamsFound) {
        for (const alias of (team.aliases || [])) {
            const linkedGroups = alias.resolverGroups || [];
            for (const linked of linkedGroups) {
                const rgNameLower = (linked.resolverGroup || '').toLowerCase();
                for (const tg of resolverGroupNames) {
                    const tgLower = tg.toLowerCase();
                    let isExact = false;
                    let isMatch = false;
                    if (tgLower === rgNameLower) {
                        isExact = true;
                        isMatch = true;
                    } else if (rgNameLower.startsWith(tgLower + ' ') || rgNameLower.startsWith(tgLower + '-') || rgNameLower.startsWith(tgLower + '_')) {
                        // oncall RG starts with our group name followed by separator
                        isMatch = true;
                    } else if (tgLower.startsWith(rgNameLower + ' ') || tgLower.startsWith(rgNameLower + '-') || tgLower.startsWith(rgNameLower + '_')) {
                        // our group name starts with oncall RG followed by separator
                        isMatch = true;
                    }
                    if (isMatch) {
                        const oncalls = alias.oncallDetails?.currentOncalls || [];
                        const shiftEnd = alias.oncallDetails?.shiftEnd || '';
                        if (oncalls.length > 0) {
                            pendingMatches.push({ matchedGroup: tg, oncalls, teamName: team.teamName, shiftEnd, isExact });
                        }
                    }
                }
            }
        }
    }
    // Exact matches win over fuzzy; first match per group wins within same priority
    pendingMatches.sort((a, b) => (b.isExact ? 1 : 0) - (a.isExact ? 1 : 0));
    for (const m of pendingMatches) {
        if (!result[m.matchedGroup]) {
            result[m.matchedGroup] = {
                oncall: m.oncalls,
                teamName: m.teamName,
                shiftEnd: m.shiftEnd.replace(/\[.*\]$/, ''),
            };
        }
    }

    logger.info(`Resolved oncall for ${Object.keys(result).length}/${resolverGroupNames.length} resolver groups`);
    return result;
}

module.exports = {
    getTeamShiftsYtd,
    getOncallForResolverGroups,
};
