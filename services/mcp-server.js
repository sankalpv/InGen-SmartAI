/**
 * InGen MCP Server
 * 
 * Exposes InGen's internal tool registry (Sprint Board, Email, Calendar, People)
 * as a standard MCP server for interoperability with external AI clients.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const toolRegistry = require('./tool-registry');
const logger = require('./logger').child('MCPServer');

// Initialize the MCP Server
const server = new Server(
    {
        name: 'ingen-mcp-server',
        version: '1.0.0',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

/**
 * Handler for listing available tools.
 * Maps InGen's tool registry to the MCP tool schema.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.info('External client requested tool list');
    const ingenTools = toolRegistry.listAll();
    
    // Map InGen internal tool schema to MCP standard
    const tools = ingenTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: {
            type: 'object',
            properties: Object.entries(t.parameters || {}).reduce((acc, [key, val]) => {
                acc[key] = {
                    type: val.type || 'string',
                    description: val.description || ''
                };
                return acc;
            }, {}),
            // Assume all parameters are strings for now if not specified
        }
    }));

    return { tools };
});

/**
 * Handler for executing a specific tool.
 * Delegates to InGen's centralized tool registry.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Executing tool via MCP: ${name}`);
    
    try {
        const result = await toolRegistry.execute(name, args);
        
        // Format result as MCP content
        return {
            content: [
                {
                    type: 'text',
                    text: result.summary || 'Tool executed successfully.'
                },
                {
                    type: 'text',
                    text: JSON.stringify(result.data, null, 2)
                }
            ],
            isError: !!result._error
        };
    } catch (error) {
        logger.error(`MCP execution failed for ${name}:`, error.message);
        return {
            content: [
                {
                    type: 'text',
                    text: `Execution Error: ${error.message}`
                }
            ],
            isError: true
        };
    }
});

/**
 * Start the server using Stdio transport.
 */
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('InGen MCP Server started on stdio transport');
}

main().catch((error) => {
    logger.error('Fatal error in InGen MCP server:', error);
    process.exit(1);
});
