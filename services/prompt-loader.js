/**
 * SmartAI Prompt Loader
 * 
 * Loads prompts from config/prompts.json with hot-reload support.
 * When a new prompt is pushed from the server (via /api/settings/update-prompts),
 * it takes effect on the next AI call without a restart.
 * 
 * Usage:
 *   const promptLoader = require('./prompt-loader');
 *   const systemPrompt = promptLoader.get('system');
 *   const template = promptLoader.get('dailyBriefing.promptTemplate');
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('PromptLoader');

const PROMPTS_PATH = path.join(process.cwd(), 'config', 'prompts.json');
const CACHE_TTL_MS = 30 * 1000; // Re-read file every 30 seconds

let cache = null;
let cacheTimestamp = 0;

function loadPrompts() {
    const now = Date.now();
    if (cache && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cache;
    }

    try {
        const raw = fs.readFileSync(PROMPTS_PATH, 'utf8');
        cache = JSON.parse(raw);
        cacheTimestamp = now;
        logger.debug('Prompts loaded from disk (version:', cache.version || 'unknown', ')');
    } catch (e) {
        logger.error('Failed to load prompts.json:', e.message, '— using cached or defaults.');
        if (!cache) {
            // Absolute fallback if file never existed
            cache = {
                version: 'fallback',
                system: "You are the AI engine for 'SmartAI', a productivity dashboard. Be helpful, concise, and proactive.",
            };
        }
    }

    return cache;
}

/**
 * Get a prompt value by dot-notation key.
 * e.g. get('system'), get('dailyBriefing.promptTemplate')
 * Returns the value or null if not found.
 */
function get(key) {
    const prompts = loadPrompts();
    const parts = key.split('.');
    let current = prompts;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return null;
        current = current[part];
    }
    return current ?? null;
}

/** Force a cache refresh (useful after a remote prompt update) */
function invalidate() {
    cache = null;
    cacheTimestamp = 0;
    logger.info('Prompt cache invalidated — will reload on next call.');
}

module.exports = { get, invalidate };
