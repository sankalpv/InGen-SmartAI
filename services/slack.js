// Slack MCP Service — send + read for InGen Slack DM agent
// Uses slack-mcp via mcp-client
const mcpClient = require('./mcp-client');
const logger = require('./logger').child('SlackMCP');

const SERVER = 'slack-mcp';


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
 * Send a DM to a user by alias (e.g. 'panaskar')
 * Looks up user → opens DM channel → posts message
 */
async function sendDM(alias, text) {
    const name = alias.replace(/^@/, '');

    // Step 1: Look up user by alias to get their Slack User ID
    let userId;
    try {
        const lookupResult = await mcpClient.callTool(SERVER, 'lookup_user', { query: name });
        checkError(lookupResult);
        const data = parseResult(lookupResult);
        userId = data?.id;
    } catch (e) {
        logger.info(`lookup_user failed for ${name}: ${e.message}, trying search fallback`);
    }

    // Fallback: search for a message from that user to discover their ID
    if (!userId) {
        const searchResult = await mcpClient.callTool(SERVER, 'search', { query: `from:@${name}`, count: 1, scope: 'messages' });
        checkError(searchResult);
        const data = parseResult(searchResult);
        userId = data?.messages?.matches?.[0]?.user;
    }

    if (!userId) throw new Error(`Could not find Slack user: @${name}`);

    // Step 2: Open DM channel
    const dmResult = await mcpClient.callTool(SERVER, 'open_dm_channel', { userIds: userId });
    checkError(dmResult);
    const rawDmText = dmResult?.content?.[0]?.text || '';
    logger.info(`open_dm_channel raw response: ${rawDmText.substring(0, 500)}`);
    const dmData = parseResult(dmResult);
    // Try multiple paths — slack-mcp returns { channel_id, user_id } as text
    let channelId = dmData?.channel_id || dmData?.channel?.id || dmData?.id;
    // Fallback: extract channel ID from raw text using regex (D/C followed by alphanums)
    if (!channelId && typeof rawDmText === 'string') {
        const match = rawDmText.match(/["\s:](D[A-Z0-9]{8,}|C[A-Z0-9]{8,})/);
        if (match) channelId = match[1];
    }
    if (!channelId) throw new Error(`Could not open DM channel with @${name}. Response: ${rawDmText.substring(0, 200)}`);

    // Step 3: Post message
    const sendResult = await mcpClient.callTool(SERVER, 'post_message', { channel: channelId, text });
    checkError(sendResult);
    logger.info(`Sent DM to @${name}: ${text.substring(0, 50)}`);
    return { ok: true, channelId, userId, alias: name };
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
 * List channels the user is a member of
 */
async function listMyChannels() {
    const result = await mcpClient.callTool(SERVER, 'list_my_channels', {});
    checkError(result);
    const data = parseResult(result);
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

// ──────────────────────────────────────────────────────────
// Slack DM Agent — read + edit functions
// ──────────────────────────────────────────────────────────

/**
 * Post a message to a channel/DM and return the message timestamp (for later editing)
 */
async function postMessage(channel, text) {
    const result = await mcpClient.callTool(SERVER, 'post_message', { channel, text });
    checkError(result);
    const raw = result?.content?.[0]?.text || '';
    const data = parseResult(result);
    // Extract message timestamp from response
    let messageTs = data?.ts || data?.message?.ts || data?.messageTs;
    if (!messageTs && typeof raw === 'string') {
        const match = raw.match(/(\d{10}\.\d{6})/);
        if (match) messageTs = match[1];
    }
    logger.info(`Posted message to ${channel}: ts=${messageTs}`);
    return { ok: true, channel, messageTs };
}

/**
 * Edit an existing message (for ⏳ → real response swap)
 */
async function editMessage(channel, messageTs, newText) {
    const result = await mcpClient.callTool(SERVER, 'edit_message', {
        channel,
        messageTs,
        text: newText,
    });
    checkError(result);
    logger.info(`Edited message ${messageTs} in ${channel}`);
    return { ok: true, channel, messageTs };
}

/**
 * Read recent messages from a channel/DM
 * @param {string} channel - Channel name (e.g. '#my-channel') or ID
 * @param {number} limit - Max messages to return (default 10)
 * @param {object} options - Additional options
 * @returns {Array} Messages with { user, text, ts, threadTs, files }
 */
async function getMessages(channel, limit = 10, options = {}) {
    const args = {
        channel,
        limit,
        includeThreadReplies: false, // Faster — skip thread fetching
        ...options,
    };
    const result = await mcpClient.callTool(SERVER, 'get_messages', args);
    checkError(result);
    const data = parseResult(result);
    // Normalize — get_messages returns { messages: [...] } with enriched data
    const messages = data?.messages || data || [];
    return Array.isArray(messages) ? messages : [];
}

/**
 * Get messages from the user's self-DM (note-to-self channel)
 * Uses the configured phonetool alias to find the self-DM
 * @param {number} limit - Max messages to fetch
 * @returns {Array} Recent messages from self-DM
 */
async function getMyDMs(limit = 10) {
    const fs = require('fs');
    const path = require('path');
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const alias = settings.phonetoolAlias;
        if (!alias) throw new Error('phonetoolAlias not configured in settings.json');

        // Look up user to get their Slack user ID
        const lookupResult = await mcpClient.callTool(SERVER, 'lookup_user', { query: alias });
        checkError(lookupResult);
        const userData = parseResult(lookupResult);
        const userId = userData?.id;
        if (!userId) throw new Error(`Could not find Slack user for alias: ${alias}`);

        // Open self-DM channel
        const dmResult = await mcpClient.callTool(SERVER, 'open_dm_channel', { userIds: userId });
        checkError(dmResult);
        const rawDmText = dmResult?.content?.[0]?.text || '';
        const dmData = parseResult(dmResult);
        let channelId = dmData?.channel_id || dmData?.channel?.id || dmData?.id;
        if (!channelId && typeof rawDmText === 'string') {
            const match = rawDmText.match(/["\s:](D[A-Z0-9]{8,}|C[A-Z0-9]{8,})/);
            if (match) channelId = match[1];
        }
        if (!channelId) throw new Error(`Could not resolve self-DM channel for ${alias}`);

        // Fetch messages from self-DM
        const messages = await getMessages(channelId, limit);
        return { channelId, userId, alias, messages };
    } catch (e) {
        logger.error('getMyDMs failed:', e.message);
        throw e;
    }
}

/**
 * Post a Block Kit message (ensures mrkdwn rendering for links and formatting)
 * @param {string} channel - Channel ID
 * @param {string} text - Slack mrkdwn formatted text
 * @returns {{ ok, channel, messageTs }}
 */
async function postBlockMessage(channel, text) {
    // Split text into chunks of ~3000 chars for Slack's block limit
    // Each section block has a 3000 char text limit
    const MAX_BLOCK_TEXT = 2900;
    const blocks = [];
    let remaining = text;

    while (remaining.length > 0) {
        let chunk = remaining.substring(0, MAX_BLOCK_TEXT);
        // Try to split at a newline boundary
        if (remaining.length > MAX_BLOCK_TEXT) {
            const lastNewline = chunk.lastIndexOf('\n');
            if (lastNewline > MAX_BLOCK_TEXT * 0.5) {
                chunk = remaining.substring(0, lastNewline);
            }
        }
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: chunk }
        });
        remaining = remaining.substring(chunk.length).trim();
    }

    // Slack limits to 50 blocks per message
    const finalBlocks = blocks.slice(0, 50);

    const result = await mcpClient.callTool(SERVER, 'post_block_message', {
        channel,
        blocks: finalBlocks,
        text: text.substring(0, 200), // Fallback text for notifications
    });
    checkError(result);
    const raw = result?.content?.[0]?.text || '';
    const data = parseResult(result);
    let messageTs = data?.ts || data?.message?.ts || data?.messageTs;
    if (!messageTs && typeof raw === 'string') {
        const match = raw.match(/(\d{10}\.\d{6})/);
        if (match) messageTs = match[1];
    }
    logger.info(`Posted block message to ${channel}: ts=${messageTs}`);
    return { ok: true, channel, messageTs };
}

module.exports = {
    postToChannel, postToChannelByName, sendDM,
    postMessage, editMessage, getMessages, getMyDMs, postBlockMessage,
};
