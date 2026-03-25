/**
 * Test script to verify the ingen-mcp server and its tools.
 */
const mcpClient = require('../services/mcp-client');
const logger = require('../services/logger').child('TestIngenMCP');

async function testIngenMCP() {
    console.log('\n=== Testing InGen MCP Server ===\n');

    try {
        console.log('Connecting to ingen-mcp server...');
        // Note: mcpClient.listTools('ingen-mcp') will start the server via stdio as configured in settings.json
        const tools = await mcpClient.listTools('ingen-mcp');

        if (!tools || tools.length === 0) {
            console.error('❌ No tools found in ingen-mcp or connection failed.');
            process.exit(1);
        }

        console.log(`✅ Found ${tools.length} available tool(s) in InGen MCP:\n`);

        const sde3Tool = tools.find(t => t.name === 'get_sde3_focus_scorecards');
        if (sde3Tool) {
            console.log(`✅ SUCCESS: "get_sde3_focus_scorecards" is registered and available!`);
            console.log(`Description: ${sde3Tool.description}`);
            console.log('Input Schema:', JSON.stringify(sde3Tool.inputSchema, null, 2));
        } else {
            console.error('❌ ERROR: "get_sde3_focus_scorecards" NOT found in tool list.');
            console.log('Available tools:', tools.map(t => t.name).join(', '));
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Unexpected error during MCP test:', error.message);
    } finally {
        await mcpClient.closeAll();
        process.exit(0);
    }
}

testIngenMCP();
