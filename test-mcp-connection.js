const mcpClient = require('./services/mcp-client');
const logger = require('./services/logger').child('MCPTest');

async function testMCPConnection() {
    try {
        logger.info('Testing MCP connection to amzn-mcp...');
        
        // Test: List available tools
        logger.info('Listing available tools...');
        const tools = await mcpClient.listTools('amzn-mcp');
        logger.info(`Found ${tools.length} tools`);
        tools.forEach(tool => {
            logger.info(`  - ${tool.name}: ${tool.description || 'No description'}`);
        });
        
        // Test: Call read_internal_website tool
        logger.info('\nTesting read_internal_website tool with Quip URL...');
        const result = await mcpClient.callTool('amzn-mcp', 'read_internal_website', {
            url: 'https://quip-amazon.com/GaZaAjEkYHt5',
            useGenericStrategy: false
        });
        
        logger.info('Tool call successful!');
        logger.info('Result type:', typeof result);
        logger.info('Result keys:', Object.keys(result));
        
        if (result.content) {
            if (Array.isArray(result.content)) {
                logger.info(`Content is array with ${result.content.length} items`);
                logger.info('First item:', JSON.stringify(result.content[0]).substring(0, 200));
            } else {
                logger.info('Content preview:', JSON.stringify(result.content).substring(0, 500));
            }
        }
        
        logger.info('\n✅ MCP connection test PASSED!');
        process.exit(0);
        
    } catch (error) {
        logger.error('❌ MCP connection test FAILED:', error.message);
        logger.error('Stack:', error.stack);
        process.exit(1);
    }
}

testMCPConnection();