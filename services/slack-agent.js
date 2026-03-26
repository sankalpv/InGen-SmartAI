/**
 * Slack DM Agent — polls the user's self-DM on Slack and responds via InGen
 * 
 * TRIGGER: Only responds to messages starting with "Hey InGen" (case-insensitive)
 * This eliminates all loop/self-response issues by design.
 * 
 * Flow:
 *   1. Every 60s, read recent messages from the user's self-DM
 *   2. Only process messages that start with "hey ingen" (case-insensitive)
 *   3. Strip the trigger phrase, post "⏳ Thinking..." placeholder
 *   4. Run query through chat-engine (RAG + page data + LLM)
 *   5. Edit the placeholder with "🤖 InGen: [response]"
 * 
 * Works on a locked laptop (uses cached data + MCP, not AppleScript)
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('SlackAgent');

// Separate state file — never touched by background-agent email/insight sync
// Use __dirname (not process.cwd()) for reliable path resolution in Next.js server context
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'slack-agent-state.json');

// Ensure data directory exists + log the resolved path for debugging
try {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    console.log(`[SlackAgent] State file path: ${STATE_FILE}`);
} catch (e) {
    console.error(`[SlackAgent] FATAL: Cannot create data dir ${DATA_DIR}:`, e.message);
}

// Prefix with hyperlinked "InGen" — clickable link to code repo
const INGEN_PREFIX = '🤖 <https://code.amazon.com/packages/InGen-SmartAI/trees/mainline|InGen>:';
const THINKING_MSG = '⏳ _Thinking..._';

/**
 * Convert standard Markdown (from LLM) to Slack mrkdwn format.
 * Slack uses different formatting syntax than Markdown.
 */
function markdownToSlackMrkdwn(md) {
    if (!md) return md;
    let text = md;

    // 1. Convert Markdown links [text](url) → Slack <url|text>
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

    // 2. Convert headers: ## Header → *Header* (bold in Slack)
    //    Must do this BEFORE bold conversion to avoid double-processing
    text = text.replace(/^#{1,4}\s+(.+)$/gm, (_, content) => {
        // Strip any existing ** from header content first
        const clean = content.replace(/\*\*/g, '');
        return `\n*${clean}*`;
    });

    // 3. Convert bold: **text** → *text* (Slack uses single * for bold)
    text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');

    // 4. Convert italic: single *text* that's NOT bold → _text_ (Slack italic)
    //    Skip this if already converted to Slack bold — tricky edge case
    //    Only convert standalone _text_ patterns (Markdown italic with underscores already works in Slack)

    // 5. Convert horizontal rules: --- → blank line
    text = text.replace(/^---+$/gm, '');

    // 6. Convert strikethrough: ~~text~~ → ~text~
    text = text.replace(/~~(.+?)~~/g, '~$1~');

    // 7. Clean up excessive blank lines (max 2 consecutive)
    text = text.replace(/\n{4,}/g, '\n\n\n');

    // 8. Trim leading/trailing whitespace
    text = text.trim();

    return text;
}

// Trigger phrase — only messages starting with this are processed (case-insensitive)
const TRIGGER_PHRASE = 'hey ingen';

// Max messages to process per poll — prevents startup storms
const MAX_PROCESS_PER_POLL = 3;

// Conversation history buffer (last N exchanges for context)
const MAX_HISTORY = 6;

// Use global to survive Next.js hot-reloads in dev mode
// Without this, every file edit resets the module and loses processedTs/cachedChannelId
if (!global._slackAgentState) {
    global._slackAgentState = {
        processedTs: new Set(),
        cachedChannelId: null,
        conversationHistory: [],
        isProcessing: false,
    };
}
const agentState = global._slackAgentState;

/**
 * Convert any timestamp format to epoch milliseconds for comparison.
 * Handles: ISO 8601 strings ("2026-03-20T16:21:05.615Z"), Slack numeric ("1774023354.498399"), epoch ms
 */
function toEpochMs(ts) {
    if (!ts || ts === '0') return 0;
    // If it looks like an ISO date string
    if (typeof ts === 'string' && ts.includes('T')) {
        return new Date(ts).getTime() || 0;
    }
    // If it's a number or Slack-style numeric ts
    const num = parseFloat(ts);
    if (isNaN(num)) return 0;
    // Slack ts is seconds.microseconds — convert to ms if < 1e12
    return num < 1e12 ? num * 1000 : num;
}

/**
 * Get the timestamp string from a message (slack-mcp uses 'timestamp' field with ISO 8601)
 */
function getMsgTs(msg) {
    return msg.timestamp || msg.ts || msg.message_ts || '';
}

/**
 * Load last processed watermark (epoch ms) from state file
 */
function getLastProcessedTs() {
    try {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const state = JSON.parse(raw);
        const ms = state.slackLastProcessedMs || 0;
        logger.info(`READ watermark: ${ms}ms from ${STATE_FILE}`);
        return ms;
    } catch (e) {
        return 0;
    }
}

/**
 * Save last processed watermark (epoch ms) to state file
 */
function setLastProcessedTs(epochMs) {
    try {
        const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
        state.slackLastProcessedMs = epochMs;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        logger.info(`Watermark saved: ${epochMs}ms → ${STATE_FILE}`);
    } catch (e) {
        console.error(`[SlackAgent] WRITE FAILED for ${STATE_FILE}:`, e.message);
        logger.error('Failed to save Slack state:', e.message);
    }
}

/**
 * Check if Slack agent is enabled in settings
 */
function isEnabled() {
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return !!(settings.phonetoolAlias && settings.mcpServers?.['slack-mcp']);
    } catch (e) { return false; }
}

/**
 * Main polling function — called every 60s by background-agent cron
 */
async function poll() {
    if (agentState.isProcessing) {
        logger.info('Slack poll skipped — already processing');
        return;
    }
    if (!isEnabled()) return;

    agentState.isProcessing = true;
    try {
        const slack = require('./slack');
        
        // Resolve self-DM channel (cached on global to survive hot-reloads)
        let channelId = agentState.cachedChannelId;
        if (!channelId) {
            logger.info('Resolving self-DM channel...');
            const dmInfo = await slack.getMyDMs(5);
            channelId = dmInfo.channelId;
            agentState.cachedChannelId = channelId;
            logger.info(`Self-DM channel resolved: ${channelId}`);
        }

        // Read recent messages
        const messages = await slack.getMessages(channelId, 20);
        if (!messages || messages.length === 0) return;

        // Compute max epoch ms across ALL messages (for watermark)
        const maxEpochMs = messages.reduce((max, msg) => {
            const ms = toEpochMs(getMsgTs(msg));
            return ms > max ? ms : max;
        }, 0);

        const lastWatermarkMs = getLastProcessedTs();

        // ──────────────────────────────────────────────────────
        // ONLY process messages that start with "Hey InGen"
        // ──────────────────────────────────────────────────────
        const newMessages = messages.filter(msg => {
            const msgTimestamp = getMsgTs(msg);
            const msgMs = toEpochMs(msgTimestamp);
            const text = (msg.text || '').trim();
            
            // Already processed this session?
            if (agentState.processedTs.has(msgTimestamp)) return false;
            // Must be newer than last watermark (epoch ms comparison)
            if (msgMs <= lastWatermarkMs) return false;
            // THE KEY FILTER: only respond to "Hey InGen ..." messages
            if (!text.toLowerCase().startsWith(TRIGGER_PHRASE)) return false;
            // Skip system messages
            if (msg.subtype) return false;
            return true;
        }).sort((a, b) => toEpochMs(getMsgTs(a)) - toEpochMs(getMsgTs(b)))
          .slice(0, MAX_PROCESS_PER_POLL);

        // Advance watermark BEFORE processing
        if (maxEpochMs > lastWatermarkMs) {
            setLastProcessedTs(maxEpochMs);
            logger.info(`Watermark advanced to ${maxEpochMs}ms (${new Date(maxEpochMs).toISOString()})`);
        }

        if (newMessages.length === 0) return;

        logger.info(`Found ${newMessages.length} new "Hey InGen" message(s) to process`);

        // Process each triggered message
        for (const msg of newMessages) {
            const rawText = (msg.text || '').trim();
            // Strip the "Hey InGen" trigger phrase to get the actual query
            const query = rawText.substring(TRIGGER_PHRASE.length).replace(/^[,:\s]+/, '').trim();
            
            if (!query || query.length < 2) {
                // User typed just "Hey InGen" with no question
                await slack.postMessage(channelId, `${INGEN_PREFIX} Hey! What can I help you with? Try: "Hey InGen what meetings do I have today?"`);
                agentState.processedTs.add(getMsgTs(msg));
                continue;
            }

            logger.info(`Processing Slack query: "${query.substring(0, 80)}"`);

            try {
                // Step 1: Post "Thinking..." placeholder
                const placeholder = await slack.postMessage(channelId, THINKING_MSG);
                const placeholderTs = placeholder.messageTs;

                // Step 2: Run through agent executor (LLM plans which tools to invoke)
                let response = '';
                try {
                    const { executeAgent } = await import('./agent-executor.js');
                    const result = await executeAgent(query, { skipClarify: true }, (event) => {
                        if (event.type === 'chunk') response += event.text;
                    });
                    if (!response && result?.result) response = result.result;
                } catch (agentErr) {
                    logger.warn('Agent executor failed, falling back to chat-engine:', agentErr.message);
                    const chatEngine = require('./chat-engine');
                    response = await chatEngine.processQuery(query, agentState.conversationHistory);
                }

                // Step 3: Convert Markdown → Slack mrkdwn, then add prefix
                const slackFormatted = markdownToSlackMrkdwn(response);
                const fullResponse = `${INGEN_PREFIX}\n${slackFormatted}`;

                // Step 4: Post as Block Kit message (ensures mrkdwn + hyperlink rendering)
                // Delete the "Thinking..." placeholder first, then post fresh Block Kit message
                if (placeholderTs) {
                    try {
                        // Edit placeholder to show it's done (can't delete via slack-mcp)
                        await slack.editMessage(channelId, placeholderTs, '✅ _Done_');
                    } catch (editErr) {
                        // Best effort — placeholder cleanup is non-critical
                    }
                }
                try {
                    await slack.postBlockMessage(channelId, fullResponse);
                } catch (blockErr) {
                    // Fallback: if Block Kit fails, use plain post_message
                    logger.warn('Block message failed, falling back to plain post:', blockErr.message);
                    await slack.postMessage(channelId, fullResponse);
                }

                // Update conversation history
                agentState.conversationHistory.push({ role: 'user', content: query });
                agentState.conversationHistory.push({ role: 'assistant', content: response });
                if (agentState.conversationHistory.length > MAX_HISTORY * 2) {
                    agentState.conversationHistory = agentState.conversationHistory.slice(-MAX_HISTORY * 2);
                }

                // Mark as processed (survives hot-reloads)
                agentState.processedTs.add(getMsgTs(msg));
                logger.info(`Responded to Slack query: "${query.substring(0, 50)}"`);
            } catch (queryErr) {
                logger.error(`Failed to process Slack query "${query.substring(0, 50)}":`, queryErr.message);
                try {
                    await slack.postMessage(channelId, `${INGEN_PREFIX} Sorry, I hit an error:\n\`${queryErr.message}\`\n\nTry rephrasing or check that InGen services are running.`);
                } catch (e2) { /* best effort */ }
                agentState.processedTs.add(getMsgTs(msg));
            }
        }

    } catch (e) {
        if (e.message?.includes('ENOENT') || e.message?.includes('not available')) {
            // Silent — slack-mcp not installed
        } else {
            logger.error('Slack agent poll error:', e.message);
        }
    } finally {
        agentState.isProcessing = false;
    }
}

/**
 * Reset the agent state (for testing)
 */
function reset() {
    agentState.cachedChannelId = null;
    agentState.conversationHistory = [];
    agentState.processedTs.clear();
    agentState.isProcessing = false;
}

module.exports = { poll, isEnabled, reset };
