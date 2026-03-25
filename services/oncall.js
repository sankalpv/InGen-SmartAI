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

module.exports = {
    getTeamShiftsYtd
};
