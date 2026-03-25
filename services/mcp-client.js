const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('MCPClient');

// Cache for MCP client connections
const clientCache = new Map();

/**
 * Resolve MCP server command path for the current platform.
 * If the configured path doesn't exist, try the platform-appropriate toolbox path.
 */
function resolveMCPCommand(serverName, configuredCommand) {
    if (!configuredCommand) return configuredCommand;
    
    // If the configured path exists, use it as-is
    if (fs.existsSync(configuredCommand)) return configuredCommand;
    
    // Extract the binary name from the configured path (e.g., "amzn-mcp" from "/Users/.../amzn-mcp")
    const binaryName = path.basename(configuredCommand).replace(/\.exe$/, '');
    
    // Try platform-specific toolbox paths
    const IS_WIN = process.platform === 'win32';
    const homedir = require('os').homedir();
    
    const candidates = IS_WIN
        ? [
            path.join(process.env.LOCALAPPDATA || '', 'Toolbox', 'bin', `${binaryName}.exe`),
            path.join(homedir, '.toolbox', 'bin', `${binaryName}.exe`),
            path.join(homedir, 'AppData', 'Local', 'Toolbox', 'bin', `${binaryName}.exe`),
        ]
        : [
            path.join(homedir, '.toolbox', 'bin', binaryName),
            path.join(homedir, '.aim', 'mcp-servers', binaryName),
            `/opt/homebrew/bin/${binaryName}`,
            `/usr/local/bin/${binaryName}`,
        ];
    
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            logger.info(`MCP ${serverName}: resolved path ${configuredCommand} → ${candidate}`);
            return candidate;
        }
    }

    // Try system PATH if still not found
    if (!configuredCommand.includes('/') && !configuredCommand.includes('\\')) {
        try {
            const { execSync } = require('child_process');
            const foundPath = execSync(IS_WIN ? `where ${configuredCommand}` : `which ${configuredCommand}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim().split('\n')[0];
            if (foundPath && fs.existsSync(foundPath)) {
                logger.info(`MCP ${serverName}: resolved ${configuredCommand} from PATH → ${foundPath}`);
                return foundPath;
            }
        } catch (e) { /* which/where failed or not found */ }
    }
    
    // Return original — will fail at connection time with a clear error
    return configuredCommand;
}

/**
 * Load MCP server configuration from settings
 * Auto-resolves command paths for the current platform
 */
function getMCPConfig() {
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const servers = settings.mcpServers || {};
        
        // Resolve paths for current platform
        for (const [name, config] of Object.entries(servers)) {
            if (config.command) {
                config.command = resolveMCPCommand(name, config.command);
            } else {
                // No command configured — try auto-discovery using the server name
                config.command = resolveMCPCommand(name, name);
            }
        }
        
        return servers;
    } catch (error) {
        logger.error('Failed to load MCP config:', error.message);
        return {};
    }
}

/**
 * Get or create MCP client for a server
 */
async function getClient(serverName) {
    // Check cache first
    if (clientCache.has(serverName)) {
        const cached = clientCache.get(serverName);
        if (cached.client && !cached.closed) {
            return cached.client;
        }
    }

    const config = getMCPConfig();
    const serverConfig = config[serverName];

    if (!serverConfig) {
        throw new Error(`MCP server '${serverName}' not configured. Please add it to config/settings.json`);
    }

    try {
        logger.info(`Connecting to MCP server: ${serverName}`);

        // Create transport based on configuration
        let transport;
        
        if (serverConfig.command) {
            // Stdio transport (most common for local MCP servers)
            transport = new StdioClientTransport({
                command: serverConfig.command,
                args: serverConfig.args || [],
                env: serverConfig.env || {}
            });
        } else {
            throw new Error(`Unsupported transport configuration for ${serverName}`);
        }

        // Create and initialize client
        const client = new Client({
            name: 'smartai-mcp-client',
            version: '1.0.0',
        }, {
            capabilities: {}
        });

        await client.connect(transport);
        
        // Cache the client
        clientCache.set(serverName, {
            client,
            closed: false,
            connectedAt: new Date()
        });

        logger.info(`Successfully connected to ${serverName}`);
        return client;

    } catch (error) {
        // Downgrade ENOENT (binary not found) to warn — non-blocking
        if (error.message?.includes('ENOENT')) {
            logger.warn(`MCP server "${serverName}" not available (binary not found) — skipping`);
        } else {
            logger.error(`Failed to connect to MCP server ${serverName}:`, error.message);
        }
        throw error;
    }
}

/**
 * Call a tool on an MCP server
 */
async function callTool(serverName, toolName, args = {}) {
    try {
        const client = await getClient(serverName);
        
        logger.info(`Calling tool '${toolName}' on ${serverName}`);
        logger.debug('Tool arguments:', JSON.stringify(args).substring(0, 200));

        const result = await client.callTool({
            name: toolName,
            arguments: args
        });

        logger.info(`Tool '${toolName}' completed successfully`);
        return result;

    } catch (error) {
        if (error.message?.includes('ENOENT') || error.message?.includes('not available')) {
            logger.warn(`Tool call skipped (${serverName}.${toolName}): server not available`);
        } else {
            logger.error(`Tool call failed (${serverName}.${toolName}):`, error.message);
        }
        throw error;
    }
}

/**
 * List available tools from an MCP server
 */
async function listTools(serverName) {
    try {
        const client = await getClient(serverName);
        const result = await client.listTools();
        return result.tools || [];
    } catch (error) {
        logger.error(`Failed to list tools from ${serverName}:`, error.message);
        return [];
    }
}

/**
 * Close connection to an MCP server
 */
async function closeClient(serverName) {
    const cached = clientCache.get(serverName);
    if (cached && cached.client) {
        try {
            await cached.client.close();
            cached.closed = true;
            logger.info(`Closed connection to ${serverName}`);
        } catch (error) {
            logger.error(`Error closing ${serverName}:`, error.message);
        }
    }
    clientCache.delete(serverName);
}

/**
 * Close all MCP client connections
 */
async function closeAll() {
    const closePromises = Array.from(clientCache.keys()).map(serverName => 
        closeClient(serverName)
    );
    await Promise.allSettled(closePromises);
    clientCache.clear();
    logger.info('Closed all MCP connections');
}

/**
 * Check if a server is connected
 */
function isConnected(serverName) {
    const cached = clientCache.get(serverName);
    return cached && cached.client && !cached.closed;
}

/**
 * Get connection status for all configured servers
 */
function getConnectionStatus() {
    const config = getMCPConfig();
    const status = {};

    for (const [serverName, serverConfig] of Object.entries(config)) {
        status[serverName] = {
            configured: true,
            connected: isConnected(serverName),
            command: serverConfig.command
        };
    }

    return status;
}

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down MCP clients...');
    await closeAll();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Shutting down MCP clients...');
    await closeAll();
    process.exit(0);
});

module.exports = {
    callTool,
    listTools,
    getClient,
    closeClient,
    closeAll,
    isConnected,
    getConnectionStatus,
    getMCPConfig
};