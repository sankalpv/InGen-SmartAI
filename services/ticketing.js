/**
 * Ticketing Service — Interface for Amazon Ticketing (SIM-T) via builder-mcp
 */
const mcpClient = require('./mcp-client');
const logger = require('./logger').child('Ticketing');

async function getTicketingPerformance(alias, shifts = [], year = new Date().getFullYear()) {
    const identity = `kerberos:${alias}@ANT.AMAZON.COM`;
    const query = `lastResolvedByIdentity:"${identity}" AND lastResolvedDate:[${year}-01-01T00:00:00Z TO NOW]`;
    
    try {
        const response = await mcpClient.callTool('builder-mcp', 'TicketingReadActions', {
            action: 'search-tickets',
            input: { 
                query, 
                rows: 100, // Sample the latest 100 for MTTR
                responseFields: ['createDate', 'lastResolvedDate', 'extensions.tt.impact']
            }
        });

        if (response.isError) return { total: 0, sev2: 0, sev3: 0, others: 0, mttrHours: 0, oncallCount: 0 };

        const rawText = response.content.find(c => c.type === 'text')?.text;
        if (!rawText) return { total: 0, sev2: 0, sev3: 0, others: 0, mttrHours: 0, oncallCount: 0 };

        const result = JSON.parse(rawText);
        const tickets = result.data?.tickets || [];
        const total = result.data?.totalResults || 0;

        let sev2 = 0, sev3 = 0, others = 0;
        let oncallTotalMs = 0;
        let oncallCount = 0;

        tickets.forEach(t => {
            const impact = t.extensions?.tt?.impact;
            if (impact <= 2.5) sev2++;
            else if (impact === 3) sev3++;
            else others++;

            const created = new Date(t.createDate);
            const resolved = new Date(t.lastResolvedDate);
            
            // Oncall-aware MTTR: Only count if the ticket was CREATED during their shift
            const isOncall = shifts.some(s => {
                const start = new Date(s.start);
                const end = new Date(s.end);
                return created >= start && created <= end;
            });

            if (isOncall && resolved > created) {
                oncallCount++;
                oncallTotalMs += (resolved - created);
            }
        });

        // Use oncall MTTR if available, otherwise 0
        const mttrHours = oncallCount > 0 
            ? (oncallTotalMs / oncallCount / (1000 * 60 * 60)).toFixed(1) 
            : 0;

        return { 
            total, 
            sev2, 
            sev3, 
            others, 
            oncallCount,
            mttrHours: parseFloat(mttrHours)
        };
    } catch (e) {
        logger.error(`Ticketing performance fetch failed for ${alias}: ${e.message}`);
        return { total: 0, sev2: 0, sev3: 0, others: 0, mttrHours: 0, oncallCount: 0 };
    }
}

module.exports = {
    getTicketingPerformance
};
