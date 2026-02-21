/**
 * Test script to discover all available tools from amzn-mcp server
 */

const mcpClient = require('./services/mcp-client');

async function discoverTools() {
    console.log('\n=== MCP Tool Discovery ===\n');

    try {
        // Connect to amzn-mcp and list all tools
        console.log('Connecting to amzn-mcp server...');
        const tools = await mcpClient.listTools('amzn-mcp');

        if (!tools || tools.length === 0) {
            console.log('❌ No tools found or connection failed');
            return;
        }

        console.log(`✅ Found ${tools.length} available tool(s)\n`);

        // Display all tools with details
        tools.forEach((tool, index) => {
            console.log(`\n[${index + 1}] ${tool.name}`);
            console.log(`Description: ${tool.description || 'No description'}`);
            
            if (tool.inputSchema) {
                console.log('Input Schema:');
                console.log(JSON.stringify(tool.inputSchema, null, 2));
            }
        });

        // Check for QuickSight-related tools
        console.log('\n\n=== QuickSight Tool Analysis ===\n');
        
        const quicksightTools = tools.filter(tool => 
            tool.name.toLowerCase().includes('quicksight') ||
            (tool.description && tool.description.toLowerCase().includes('quicksight'))
        );

        if (quicksightTools.length > 0) {
            console.log(`✅ Found ${quicksightTools.length} QuickSight-related tool(s):`);
            quicksightTools.forEach(tool => {
                console.log(`  - ${tool.name}: ${tool.description}`);
            });
        } else {
            console.log('❌ No QuickSight-specific tools found in amzn-mcp');
            console.log('\nRecommendation: You\'ll need to either:');
            console.log('  1. Create a custom MCP server for QuickSight');
            console.log('  2. Use AWS SDK directly in your Next.js backend');
        }

        // Check for other useful AWS tools
        console.log('\n\n=== Other AWS Tools ===\n');
        
        const awsTools = tools.filter(tool => 
            !tool.name.toLowerCase().includes('quicksight') &&
            (tool.name.toLowerCase().includes('aws') || 
             tool.description.toLowerCase().includes('aws') ||
             tool.description.toLowerCase().includes('amazon'))
        );

        if (awsTools.length > 0) {
            console.log(`Found ${awsTools.length} other AWS-related tool(s):`);
            awsTools.forEach(tool => {
                console.log(`  - ${tool.name}`);
            });
        }

    } catch (error) {
        console.error('❌ Error discovering tools:', error.message);
    } finally {
        // Clean up connection
        await mcpClient.closeAll();
        process.exit(0);
    }
}

// Run the discovery
discoverTools();