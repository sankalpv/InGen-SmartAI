// Slack MCP Service — uses slack-mcp via mcp-client
const mcpClient = require('./mcp-client');
const logger = require('./logger').child('SlackMCP');

const SERVER = 'slack-mcp';

// Known user mappings (cached from prior lookups)
const KNOWN_USERS = {
    'panaskar': { userId: 'W017FUZM60Z', channelId: 'D01GQP4L03G' },
};

function parseResult(result) {
    try {
        const text = result?.content?.[0]?.text || result?.content?.text || '';
        return typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
        return result?.content?.[0]?.text || '';
    }
}

function checkError(result) {
    const text = result?.content?.[0]?.text || '';
    if (typeof text === 'string' && text.includes('Error:')) {
        throw new Error(`Slack MCP error: ${text}`);
    }
}

/**
 * Fetch recent DMs and mentions via MCP
 */
async function fetchSlackMessages() {
    const messages = [];
    try {
        const [dmsResult, mentionsResult] = await Promise.allSettled([
            mcpClient.callTool(SERVER, 'search', { query: 'to:me is:dm', count: 10, scope: 'messages' }),
            mcpClient.callTool(SERVER, 'search', { query: 'to:me -is:dm', count: 10, scope: 'messages' }),
        ]);

        for (const [r, isDM] of [[dmsResult, true], [mentionsResult, false]]) {
            if (r.status !== 'fulfilled') continue;
            const data = parseResult(r.value);
            for (const m of (data?.messages?.matches || []).slice(0, 10)) {
                messages.push({
                    id: m.ts || m.iid || String(Date.now()),
                    channel: isDM ? 'DM' : `#${m.channel?.name || 'unknown'}`,
                    from: { name: m.username || m.user || 'Unknown', avatar: isDM ? '💬' : '📢' },
                    message: m.text || '',
                    timestamp: m.ts ? new Date(parseFloat(m.ts) * 1000).toISOString() : new Date().toISOString(),
                    isDirectMessage: isDM,
                    needsResponse: true,
                });
            }
        }
        logger.info(`Fetched ${messages.length} Slack messages via MCP`);
    } catch (error) {
        logger.error('Slack MCP fetch error:', error.message);
    }
    return messages;
}

/**
 * Send a DM to a user by alias
 */
async function sendDM(alias, text) {
    const known = KNOWN_USERS[alias];
    let channelId = known?.channelId;
    let userId = known?.userId;

    // Lookup if not known
    if (!userId) {
        const searchResult = await mcpClient.callTool(SERVER, 'search', { query: `from:@${alias}`, count: 1, scope: 'messages' });
        checkError(searchResult);
        const data = parseResult(searchResult);
        userId = data?.messages?.matches?.[0]?.user;
        if (!userId) throw new Error(`Could not find Slack user: ${alias}`);
    }

    // Open DM if no cached channel
    if (!channelId) {
        const dmResult = await mcpClient.callTool(SERVER, 'conversations_open', { users: userId });
        checkError(dmResult);
        const dmData = parseResult(dmResult);
        channelId = dmData?.channel?.id;
        if (!channelId) throw new Error(`Could not open DM channel with ${alias}`);
    }

    // Post message
    const sendResult = await mcpClient.callTool(SERVER, 'post_message', { channel: channelId, text });
    checkError(sendResult);
    logger.info(`Sent DM to ${alias}: ${text.substring(0, 50)}`);
    return { ok: true, channelId, userId };
}

/**
 * Post a message to a channel by ID
 */
async function postToChannel(channelId, text) {
    const sendResult = await mcpClient.callTool(SERVER, 'post_message', { channel: channelId, text });
    checkError(sendResult);
    logger.info(`Posted to channel ${channelId}: ${text.substring(0, 50)}`);
    return { ok: true, channelId };
}

/**
 * Search Slack messages
 */
async function searchSlack(query) {
    const result = await mcpClient.callTool(SERVER, 'search', { query, count: 20, scope: 'messages' });
    checkError(result);
    return parseResult(result);
}

/**
 * List channels the user is a member of
 */
async function listMyChannels() {
    const result = await mcpClient.callTool(SERVER, 'list_my_channels', {});
    checkError(result);
    const data = parseResult(result);
    // Return simplified list: { id, name, is_private }
    const channels = (data?.channels || data || []);
    return Array.isArray(channels) ? channels.map(c => ({
        id: c.id, name: c.name || c.name_normalized, is_private: !!c.is_private,
    })) : [];
}

/**
 * Post a message to a channel by name (resolves name → ID first)
 * Uses multiple strategies: direct name, search-based resolution, channel listing
 */
async function postToChannelByName(channelName, text) {
    // Strip leading # if present
    const name = channelName.replace(/^#/, '');

    // Strategy 1: Try posting directly with #channel-name
    // Slack API sometimes accepts channel names
    try {
        logger.info(`Trying direct post to #${name}`);
        const sendResult = await mcpClient.callTool(SERVER, 'post_message', { channel: `#${name}`, text });
        const sendText = sendResult?.content?.[0]?.text || '';
        if (typeof sendText === 'string' && sendText.includes('Error:')) {
            throw new Error(sendText);
        }
        logger.info(`Direct post to #${name} succeeded`);
        return { ok: true, channelName: name };
    } catch (e1) {
        logger.info(`Direct post failed: ${e1.message}, trying search-based resolution`);
    }

    // Strategy 2: Search for a message in the channel to discover its ID
    try {
        const searchResult = await mcpClient.callTool(SERVER, 'search', { query: `in:#${name}`, count: 1, scope: 'messages' });
        const data = parseResult(searchResult);
        const channelId = data?.messages?.matches?.[0]?.channel?.id;
        if (channelId) {
            logger.info(`Resolved #${name} to ${channelId} via search`);
            const sendResult = await mcpClient.callTool(SERVER, 'post_message', { channel: channelId, text });
            checkError(sendResult);
            return { ok: true, channelId, channelName: name };
        }
    } catch (e2) {
        logger.info(`Search-based resolution failed: ${e2.message}, trying channel list`);
    }

    // Strategy 3: List channels and find by name
    try {
        const channels = await listMyChannels();
        const match = channels.find(c => c.name === name);
        if (match) {
            const sendResult = await mcpClient.callTool(SERVER, 'post_message', { channel: match.id, text });
            checkError(sendResult);
            return { ok: true, channelId: match.id, channelName: name };
        }
    } catch (e3) {
        logger.info(`Channel list resolution failed: ${e3.message}`);
    }

    throw new Error(`Could not find or post to Slack channel: #${name}. Make sure you are a member of this channel.`);
}

module.exports = { fetchSlackMessages, sendDM, searchSlack, listMyChannels, postToChannel, postToChannelByName };
