/**
 * Slack Channel Ambient Indexer
 * 
 * Polls configured Slack channels on a schedule and ingests messages into
 * the vector store (brain/vectors.db) for semantic search via RAG.
 * 
 * Design decisions:
 *   - Thread = unit of chunking (parent + replies become one document)
 *   - Solo messages (no replies) are indexed as single-message chunks
 *   - User names resolved from enriched get_messages payload; cache-miss falls back to lookup_user
 *   - Per-channel cursor in data/slack-index-cursor.json — only advances on successful ingest
 *   - Rate limited: 1.2s between every Slack API call
 *   - Bot messages kept if text > 20 chars (CI alerts, Jira, PagerDuty are useful)
 * 
 * Called by: background-agent.js every 15 min
 * One-shot backfill: scripts/backfill-slack-channels.js
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('SlackIndexer');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CURSOR_FILE = path.join(DATA_DIR, 'slack-index-cursor.json');
const USER_CACHE_FILE = path.join(DATA_DIR, 'slack-user-cache.json');

// Subtypes that are pure noise — always skip regardless of text length
const SKIP_SUBTYPES = new Set([
    'channel_join', 'channel_leave', 'channel_archive', 'channel_unarchive',
    'bot_add', 'bot_remove', 'channel_purpose', 'channel_topic', 'channel_name',
    'pinned_item', 'unpinned_item', 'group_join', 'group_leave',
]);

// Max body size for a thread chunk (chars). Keeps embedding quality high.
const MAX_CHUNK_CHARS = 1500;

// Rate limit delay between Slack API calls (ms). Tier 3 = 50 req/min → 1.2s is safe.
const API_DELAY_MS = 1200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Get indexer config from settings.json
 * @returns {{ enabled: boolean, channels: string[], lookbackDays: number }}
 */
function getConfig() {
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const cfg = settings.slackIndexer || {};
        return {
            enabled: !!cfg.enabled,
            channels: cfg.channels || [],
            lookbackDays: cfg.lookbackDays || 30,
        };
    } catch (e) {
        return { enabled: false, channels: [], lookbackDays: 30 };
    }
}

// ─── Cursor Management ────────────────────────────────────────────────────────

function loadCursors() {
    try {
        return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function saveCursors(cursors) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursors, null, 2));
}

function getCursor(cursors, channelId) {
    return cursors[channelId]?.lastTs || null;
}

function setCursor(cursors, channelId, ts) {
    cursors[channelId] = { lastTs: ts, lastSync: new Date().toISOString() };
}

// ─── User Name Cache ──────────────────────────────────────────────────────────

let _userCache = null;

function loadUserCache() {
    if (_userCache) return _userCache;
    try {
        _userCache = JSON.parse(fs.readFileSync(USER_CACHE_FILE, 'utf8'));
    } catch {
        _userCache = {};
    }
    return _userCache;
}

function saveUserCache() {
    if (!_userCache) return;
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(USER_CACHE_FILE, JSON.stringify(_userCache, null, 2));
    } catch (e) {
        logger.warn('Failed to save user cache:', e.message);
    }
}

/**
 * Resolve a user ID to a display name.
 * Prefers enriched data from the message payload (zero API calls).
 * Falls back to cache → lookup_user with rate limiting.
 */
async function resolveUserName(msg, slack) {
    // 1. Enriched data from get_messages (slack-mcp enriches user details)
    const enrichedName = msg.user_name || msg.display_name || msg.real_name
        || msg.user_profile?.display_name || msg.user_profile?.real_name;
    if (enrichedName) return enrichedName;

    // 2. If only user ID available, check cache
    const userId = msg.user || msg.user_id;
    if (!userId) return 'Unknown';

    const cache = loadUserCache();
    if (cache[userId]) return cache[userId];

    // 3. Cache miss — call lookup_user (Tier 4, rate limited)
    try {
        await sleep(2000); // Extra delay for Tier 4
        const userData = await slack.lookupUser(userId);
        const name = userData?.display_name || userData?.real_name || userId;
        cache[userId] = name;
        saveUserCache();
        return name;
    } catch (e) {
        logger.warn(`Failed to resolve user ${userId}:`, e.message);
        cache[userId] = userId; // Cache the ID itself to avoid retrying
        saveUserCache();
        return userId;
    }
}

// ─── Message Filtering ────────────────────────────────────────────────────────

/**
 * Should this message be indexed?
 * Keeps substantive bot messages (CI, Jira, PagerDuty).
 * Skips join/leave/topic-change system events.
 */
function shouldIndex(msg) {
    const subtype = msg.subtype || msg.message_subtype;
    // Always skip pure noise subtypes
    if (subtype && SKIP_SUBTYPES.has(subtype)) return false;
    // Skip bot/system messages with trivial text
    if (subtype && (msg.text || '').length < 20) return false;
    // Skip empty messages
    if (!(msg.text || '').trim()) return false;
    return true;
}

// ─── Thread Grouping & Chunking ───────────────────────────────────────────────

/**
 * Group messages by thread. Messages with no replies become solo chunks.
 * 
 * @param {Array} messages - Flat list of channel messages
 * @returns {Map<string, Object>} threadTs → { parent, replies: [] }
 */
function groupByThread(messages) {
    const threads = new Map();

    for (const msg of messages) {
        if (!shouldIndex(msg)) continue;

        // Thread root: ts matches thread_ts, or no thread_ts (solo message)
        const ts = msg.ts || msg.timestamp || '';
        const threadTs = msg.thread_ts || ts;

        if (!threads.has(threadTs)) {
            threads.set(threadTs, { parent: null, replies: [], maxTs: ts });
        }
        const thread = threads.get(threadTs);

        // Track max ts for cursor advancement
        if (ts > thread.maxTs) thread.maxTs = ts;

        if (ts === threadTs) {
            // This is the parent message
            thread.parent = msg;
        } else {
            thread.replies.push(msg);
        }
    }

    // For threads where we only have replies (parent was before our fetch window),
    // promote the earliest reply as pseudo-parent
    for (const [, thread] of threads) {
        if (!thread.parent && thread.replies.length > 0) {
            thread.parent = thread.replies.shift();
        }
    }

    return threads;
}

/**
 * Trim thread text at a sentence boundary, keeping parent message intact.
 * 
 * @param {string} parentText - Parent message text (always kept)
 * @param {Array<string>} replyTexts - Reply texts in chronological order
 * @param {number} limit - Max total chars
 * @returns {{ text: string, truncated: boolean, repliesIncluded: number, totalReplies: number }}
 */
function buildChunkText(parentText, replyTexts, limit = MAX_CHUNK_CHARS) {
    let text = parentText;
    let repliesIncluded = 0;
    const totalReplies = replyTexts.length;

    for (const reply of replyTexts) {
        const candidate = text + '\n' + reply;
        if (candidate.length > limit) {
            // Try to fit a partial reply at sentence boundary
            const remaining = limit - text.length - 1; // -1 for newline
            if (remaining > 50) {
                const partial = reply.substring(0, remaining);
                // Find last sentence boundary
                const lastSentence = partial.search(/[.!?]\s[^.!?]*$/);
                if (lastSentence > remaining * 0.5) {
                    text += '\n' + partial.substring(0, lastSentence + 1);
                    repliesIncluded++;
                }
            }
            break;
        }
        text += '\n' + reply;
        repliesIncluded++;
    }

    const truncated = repliesIncluded < totalReplies;
    if (truncated) {
        const remaining = totalReplies - repliesIncluded;
        text += `\n[thread continues — ${remaining} more repl${remaining === 1 ? 'y' : 'ies'}]`;
    }

    return { text, truncated, repliesIncluded, totalReplies };
}

// ─── Channel Indexer ──────────────────────────────────────────────────────────

/**
 * Index a single channel: fetch new messages, group by thread, ingest chunks.
 * 
 * @param {string} channelId - Slack channel ID
 * @param {string} channelName - Channel name for metadata
 * @param {Object} cursors - Cursor state (mutated on success)
 * @param {Object} options - { slack, vectorStore, dryRun, lookbackDays }
 * @returns {{ chunksIndexed: number, messagesProcessed: number, errors: number }}
 */
async function indexChannel(channelId, channelName, cursors, options = {}) {
    const { slack, vectorStore, dryRun = false, lookbackDays = 30 } = options;
    const stats = { chunksIndexed: 0, messagesProcessed: 0, errors: 0, skipped: 0 };

    // Determine fetch window
    const cursorTs = getCursor(cursors, channelId);
    let since;
    if (cursorTs) {
        // Fetch from cursor with 5-min buffer for clock skew
        const cursorDate = new Date(cursorTs);
        cursorDate.setMinutes(cursorDate.getMinutes() - 5);
        since = cursorDate.toISOString();
    } else {
        // No cursor — look back N days
        const lookback = new Date();
        lookback.setDate(lookback.getDate() - lookbackDays);
        since = lookback.toISOString();
    }

    logger.info(`Indexing #${channelName} (${channelId}) since ${since}`);

    // Fetch messages (paginated — get up to 200 per call)
    let allMessages = [];
    try {
        const messages = await slack.getMessages(channelId, 200, { since });
        await sleep(API_DELAY_MS);
        if (messages && messages.length > 0) {
            allMessages = messages;
        }
    } catch (e) {
        logger.error(`Failed to fetch messages for #${channelName}:`, e.message);
        stats.errors++;
        return stats;
    }

    if (allMessages.length === 0) {
        logger.info(`#${channelName}: no new messages`);
        return stats;
    }

    stats.messagesProcessed = allMessages.length;

    // Group into threads
    const threads = groupByThread(allMessages);
    logger.info(`#${channelName}: ${allMessages.length} messages → ${threads.size} threads`);

    // For threads with reply_count > 0, fetch full replies
    for (const [threadTs, thread] of threads) {
        const parentReplyCount = thread.parent?.reply_count || thread.parent?.replies?.length || 0;
        if (parentReplyCount > 0 && thread.replies.length === 0) {
            try {
                const replies = await slack.getThread(channelId, threadTs);
                await sleep(API_DELAY_MS);
                // First message in thread response is the parent — skip it
                const replyMsgs = (replies || []).filter(r => {
                    const rTs = r.ts || r.timestamp || '';
                    return rTs !== threadTs && shouldIndex(r);
                });
                thread.replies = replyMsgs;
                // Update maxTs
                for (const r of replyMsgs) {
                    const rTs = r.ts || r.timestamp || '';
                    if (rTs > thread.maxTs) thread.maxTs = rTs;
                }
            } catch (e) {
                logger.warn(`Failed to fetch thread ${threadTs} in #${channelName}:`, e.message);
            }
        }
    }

    // Track the max successfully-ingested timestamp for cursor advancement
    let maxIngestedTs = cursorTs || '';

    // Ingest each thread chunk
    for (const [threadTs, thread] of threads) {
        if (!thread.parent) continue;

        const parentName = await resolveUserName(thread.parent, slack);
        const parentText = `${parentName}: ${(thread.parent.text || '').trim()}`;

        const replyTexts = [];
        for (const reply of thread.replies) {
            const replyName = await resolveUserName(reply, slack);
            replyTexts.push(`${replyName}: ${(reply.text || '').trim()}`);
        }

        const { text: chunkText, truncated } = buildChunkText(parentText, replyTexts);

        if (dryRun) {
            stats.chunksIndexed++;
            if (thread.maxTs > maxIngestedTs) maxIngestedTs = thread.maxTs;
            continue;
        }

        // Ingest via vectorStore.ingestSlackMessage()
        try {
            const result = await vectorStore.ingestSlackMessage({
                channel: channelName,
                id: threadTs,
                timestamp: thread.parent.ts || thread.parent.timestamp || threadTs,
                user: parentName,
                text: chunkText,
                from: { name: parentName },
            });

            if (result.success) {
                stats.chunksIndexed++;
                if (thread.maxTs > maxIngestedTs) maxIngestedTs = thread.maxTs;
            } else if (result.skipped) {
                stats.skipped++;
                // Still advance cursor past duplicates
                if (thread.maxTs > maxIngestedTs) maxIngestedTs = thread.maxTs;
            } else if (result.error) {
                stats.errors++;
                // DON'T advance cursor past failed ingests
                logger.warn(`Ingest failed for thread ${threadTs} in #${channelName}:`, result.error);
            }
        } catch (e) {
            stats.errors++;
            logger.error(`Ingest threw for thread ${threadTs} in #${channelName}:`, e.message);
        }
    }

    // Advance cursor only to max of successfully processed messages
    if (maxIngestedTs && maxIngestedTs > (cursorTs || '')) {
        setCursor(cursors, channelId, maxIngestedTs);
        if (!dryRun) saveCursors(cursors);
        logger.info(`#${channelName}: cursor advanced to ${maxIngestedTs}`);
    }

    logger.info(`#${channelName}: indexed ${stats.chunksIndexed} chunks, ${stats.skipped} skipped, ${stats.errors} errors`);
    return stats;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run the indexer across all configured channels.
 * Called by background-agent.js every 15 min.
 * 
 * @param {Object} overrides - { dryRun, lookbackDays, channels }
 * @returns {{ totalChunks: number, totalMessages: number, totalErrors: number, channels: Object }}
 */
async function run(overrides = {}) {
    const config = getConfig();
    const channels = overrides.channels || config.channels;
    const lookbackDays = overrides.lookbackDays || config.lookbackDays;
    const dryRun = overrides.dryRun || false;

    if (!config.enabled && !overrides.channels) {
        logger.debug('Slack indexer disabled in settings');
        return { totalChunks: 0, totalMessages: 0, totalErrors: 0, channels: {} };
    }

    if (!channels || channels.length === 0) {
        logger.debug('No channels configured for Slack indexing');
        return { totalChunks: 0, totalMessages: 0, totalErrors: 0, channels: {} };
    }

    const slack = require('./slack');
    let vectorStore;
    if (!dryRun) {
        vectorStore = require('./vector-store');
        await vectorStore.init();
    }

    const cursors = loadCursors();
    const results = { totalChunks: 0, totalMessages: 0, totalErrors: 0, channels: {} };

    logger.info(`Slack indexer starting: ${channels.length} channel(s), dryRun=${dryRun}`);

    for (const channelRef of channels) {
        let channelId, channelName;

        // Resolve channel name → ID if needed
        if (channelRef.startsWith('C') && channelRef.length > 8 && !channelRef.includes('#')) {
            // Already a channel ID
            channelId = channelRef;
            channelName = channelRef;
        } else {
            try {
                const resolved = await slack.resolveChannel(channelRef);
                await sleep(API_DELAY_MS);
                if (!resolved?.id) {
                    logger.warn(`Could not resolve channel: ${channelRef} — skipping`);
                    continue;
                }
                channelId = resolved.id;
                channelName = resolved.name || channelRef.replace(/^#/, '');
            } catch (e) {
                logger.warn(`Error resolving channel ${channelRef}:`, e.message);
                continue;
            }
        }

        try {
            const stats = await indexChannel(channelId, channelName, cursors, {
                slack, vectorStore, dryRun, lookbackDays,
            });
            results.channels[channelName] = stats;
            results.totalChunks += stats.chunksIndexed;
            results.totalMessages += stats.messagesProcessed;
            results.totalErrors += stats.errors;
        } catch (e) {
            logger.error(`Indexer failed for #${channelName}:`, e.message);
            results.totalErrors++;
        }

        // Rate limit between channels
        await sleep(API_DELAY_MS);
    }

    logger.info(`Slack indexer complete: ${results.totalChunks} chunks indexed across ${channels.length} channel(s)`);
    return results;
}

module.exports = { run, indexChannel, groupByThread, buildChunkText, getConfig };
