const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('MCPClient');

// Cache for MCP client connections
const clientCache = new Map();
const pendingConnections = new Map();

/**
 * Find a Node.js binary that is >= v22.
 * Needed when process.execPath is the system node (v20) but MCP servers require v22+.
 */
function resolveNode22Plus() {
  // If current node is already v22+, use it
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major >= 22) return process.execPath;

  const { execSync } = require('child_process');
  const homedir = require('os').homedir();

  // Well-known candidate locations for a newer node
  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    path.join(homedir, '.volta', 'bin', 'node'),
    // nvm: find all installed versions, pick highest
    ...(() => {
      try {
        const nvmDir = process.env.NVM_DIR || path.join(homedir, '.nvm');
        const versionsDir = path.join(nvmDir, 'versions', 'node');
        if (!fs.existsSync(versionsDir)) return [];
        return fs
          .readdirSync(versionsDir)
          .filter((v) => /^v\d/.test(v))
          .sort((a, b) => {
            const [ma] = a.slice(1).split('.').map(Number);
            const [mb] = b.slice(1).split('.').map(Number);
            return mb - ma; // newest first
          })
          .map((v) => path.join(versionsDir, v, 'bin', 'node'));
      } catch {
        return [];
      }
    })(),
  ];

  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      const ver = execSync(`"${candidate}" --version`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const maj = parseInt(ver.replace('v', '').split('.')[0], 10);
      if (maj >= 22) {
        logger.info(
          `Using node ${ver} at ${candidate} for MCP servers (process.execPath is v${major})`
        );
        return candidate;
      }
    } catch {
      /* skip */
    }
  }

  // Fall back to process.execPath — will fail at runtime with a clear message
  logger.warn(
    `Could not find Node v22+ for MCP server; using process.execPath (v${major}) — expect version errors`
  );
  return process.execPath;
}

// Memoize so we only probe once per process
let _node22Path = null;
function getNode22Plus() {
  if (!_node22Path) _node22Path = resolveNode22Plus();
  return _node22Path;
}

/**
 * Find the direct .cjs entry point for a toolbox-installed MCP server.
 * Prefers this over the wrapper binary which can hang on some systems.
 * e.g. ~/.toolbox/tools/aws-outlook-mcp/0.3.1/aws-outlook-mcp.cjs
 */
function resolveToolboxCjs(homedir, binaryName) {
  try {
    const toolsDir = path.join(homedir, '.toolbox', 'tools', binaryName);
    if (!fs.existsSync(toolsDir)) return [];

    // Priority 1: Read info.json and use pinned CurrentVersion (prevents auto-upgrade breakage)
    const infoPath = path.join(toolsDir, 'info.json');
    if (fs.existsSync(infoPath)) {
      try {
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        const pinnedVersion = info?.CurrentVersion?.Version;
        if (pinnedVersion) {
          const pinnedCjs = path.join(toolsDir, pinnedVersion, `${binaryName}.cjs`);
          if (fs.existsSync(pinnedCjs)) {
            logger.info(`MCP ${binaryName}: pinned to v${pinnedVersion} via info.json`);
            return [pinnedCjs];
          }
        }
      } catch {
        /* info.json parse failed — fall through to glob */
      }
    }

    // Fallback: Find all version dirs, newest first (only if info.json missing/invalid)
    const versions = fs
      .readdirSync(toolsDir)
      .filter((d) => /^\d/.test(d))
      .sort()
      .reverse();
    const results = [];
    for (const ver of versions) {
      const cjsPath = path.join(toolsDir, ver, `${binaryName}.cjs`);
      if (fs.existsSync(cjsPath)) results.push(cjsPath);
    }
    return results;
  } catch {
    return [];
  }
}

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
        // Prefer direct .cjs entry point — avoids the wrapper binary which can hang
        // (glob: ~/.toolbox/tools/<name>/*/name.cjs)
        ...resolveToolboxCjs(homedir, binaryName),
        path.join(homedir, '.toolbox', 'bin', binaryName),
        path.join(homedir, '.aim', 'mcp-servers', binaryName),
        `/opt/homebrew/bin/${binaryName}`,
        `/usr/local/bin/${binaryName}`,
      ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      logger.info(`MCP ${serverName}: resolved path ${configuredCommand} → ${candidate}`);
      return candidate;
    }
  }

  // Try system PATH if still not found
  if (!configuredCommand.includes('/') && !configuredCommand.includes('\\')) {
    try {
      const { execSync } = require('child_process');
      const foundPath = execSync(
        IS_WIN ? `where ${configuredCommand}` : `which ${configuredCommand}`,
        { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
      )
        .trim()
        .split('\n')[0];
      if (foundPath && fs.existsSync(foundPath)) {
        logger.info(`MCP ${serverName}: resolved ${configuredCommand} from PATH → ${foundPath}`);
        return foundPath;
      }
    } catch (e) {
      /* which/where failed or not found */
    }
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
    throw new Error(
      `MCP server '${serverName}' not configured. Please add it to config/settings.json`
    );
  }

  // Check for a pending connection to this server
  if (pendingConnections.has(serverName)) {
    logger.info(`Waiting for existing connection attempt to ${serverName}...`);
    return pendingConnections.get(serverName);
  }

  const connectPromise = (async () => {
    try {
      logger.info(`Connecting to MCP server: ${serverName}`);
      // ... (rest of the logic)

      // Create transport based on configuration
      let transport;

      if (serverConfig.command) {
        // Stdio transport (most common for local MCP servers)
        // If the command is a .cjs file, run it explicitly with process.execPath
        // to avoid the shebang resolving to /usr/bin/env node (system Node v20)
        // which breaks aws-outlook-mcp that requires Node v22+.
        let mcpCommand = serverConfig.command;
        let mcpArgs = serverConfig.args || [];
        if (
          mcpCommand.endsWith('.cjs') ||
          mcpCommand.endsWith('.js') ||
          mcpCommand.endsWith('.mjs')
        ) {
          // Run the script with a Node v22+ binary — process.execPath may be v20
          // (e.g. when Next.js is launched via system node)
          mcpArgs = [mcpCommand, ...mcpArgs];
          mcpCommand = getNode22Plus();
        }
        transport = new StdioClientTransport({
          command: mcpCommand,
          args: mcpArgs,
          env: serverConfig.env || {},
        });
      } else {
        throw new Error(`Unsupported transport configuration for ${serverName}`);
      }

      // Create and initialize client
      const client = new Client(
        {
          name: 'smartai-mcp-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);

      // Cache the client
      clientCache.set(serverName, {
        client,
        closed: false,
        connectedAt: new Date(),
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
    } finally {
      pendingConnections.delete(serverName);
    }
  })();

  pendingConnections.set(serverName, connectPromise);
  return connectPromise;
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
      arguments: args,
    });

    if (result?.isError) {
      const errText = result?.content?.[0]?.text || 'Unknown tool error';
      logger.error(`Tool error (${toolName}): ${errText}`);
    } else {
      logger.info(`Tool '${toolName}' completed successfully`);
    }
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
 * List available resources from an MCP server
 */
async function listResources(serverName) {
  try {
    const client = await getClient(serverName);
    const result = await client.listResources();
    return result.resources || [];
  } catch (error) {
    logger.error(`Failed to list resources from ${serverName}:`, error.message);
    return [];
  }
}

/**
 * List available prompts from an MCP server
 */
async function listPrompts(serverName) {
  try {
    const client = await getClient(serverName);
    const result = await client.listPrompts();
    return result.prompts || [];
  } catch (error) {
    logger.error(`Failed to list prompts from ${serverName}:`, error.message);
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
  const closePromises = Array.from(clientCache.keys()).map((serverName) => closeClient(serverName));
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
      command: serverConfig.command,
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

/**
 * Parse MCP tool response content into a plain JS object.
 * Handles 3 content formats returned by builder-mcp:
 *   1. String content (raw JSON string)
 *   2. Array content with { type: 'text', text: '...' } items
 *   3. Object content (already parsed)
 * 
 * @param {Object} result - Raw MCP callTool response
 * @returns {Object} Parsed content object (empty object if unparseable)
 */
function parseMCPResponse(result) {
  const content = result?.content;
  if (!content) return {};

  try {
    if (typeof content === 'string') {
      return JSON.parse(content);
    }
    if (Array.isArray(content)) {
      const textItem = content.find(c => c.type === 'text');
      return textItem ? JSON.parse(textItem.text) : {};
    }
    return content;
  } catch (e) {
    return {};
  }
}

module.exports = {
  callTool,
  listTools,
  listResources,
  listPrompts,
  getClient,
  closeClient,
  closeAll,
  isConnected,
  getConnectionStatus,
  getMCPConfig,
  parseMCPResponse,
};
