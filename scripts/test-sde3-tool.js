/**
 * Test script to verify the get_sde3_focus_scorecards tool via the Tool Registry.
 */
const toolRegistry = require('../services/tool-registry');
const logger = require('../services/logger').child('TestSDE3Tool');

async function testTool() {
    console.log('\n=== Testing SDE3 Performance Scorecards Tool ===\n');

    try {
        console.log('Executing get_sde3_focus_scorecards...');
        const result = await toolRegistry.execute('get_sde3_focus_scorecards', { refresh: false });

        if (result._error) {
            console.error('❌ Tool execution failed:', result.summary);
            process.exit(1);
        }

        console.log('✅ Tool executed successfully!');
        console.log('Summary:', result.summary);
        console.log('Elapsed Time:', result._elapsed, 'seconds');
        
        const data = result.data;
        if (data && data.sde3s) {
            console.log(`\nFound ${data.sde3s.length} SDE3s:`);
            data.sde3s.forEach((sde, index) => {
                const deliverables = sde.topDeliverables.map(d => d.title).join(', ');
                console.log(`[${index + 1}] ${sde.name} (${sde.alias}) - L${sde.level}`);
                console.log(`    Top Deliverables: ${deliverables || 'None'}`);
                console.log(`    PRs Authored: ${sde.codeMetrics?.crsCreated || 0}, Reviewed: ${sde.codeMetrics?.crsReviewed || 0}`);
                console.log(`    On-call MTTR: ${sde.ticketing?.mttrHours?.toFixed(1) || 0}h (across ${sde.ticketing?.oncallCount || 0} tickets)`);
            });
        } else {
            console.log('⚠️ No SDE3 data returned.');
        }

    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
    } finally {
        process.exit(0);
    }
}

testTool();
