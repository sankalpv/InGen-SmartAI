/**
 * Safe settings reader — never crashes on missing/malformed config.
 *
 * Phase 2 adoption from nkand/ahs branch.
 * Replaces scattered JSON.parse(fs.readFileSync('config/settings.json')) calls
 * with a single, crash-proof function.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('Settings');

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
const PROMPTS_PATH = path.join(process.cwd(), 'config', 'prompts.json');

// In-memory cache with 30s TTL (avoids re-reading file on every call)
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30_000;

/**
 * Read config/settings.json safely. Never throws.
 * Returns the parsed object, or `defaults` if file is missing/corrupt.
 *
 * @param {object} [defaults={}] - Fallback if settings can't be read
 * @returns {object}
 */
function readSettingsSafe(defaults = {}) {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return { ...defaults, ..._cache };

  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      logger.warn('config/settings.json not found — using defaults');
      return defaults;
    }
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    _cache = parsed;
    _cacheAt = now;
    return { ...defaults, ...parsed };
  } catch (e) {
    logger.error('Failed to read settings.json:', e.message);
    return defaults;
  }
}

/**
 * Read a single setting by dot-path. e.g. readSetting('phonetoolAlias')
 * Returns undefined if not found.
 */
function readSetting(key, defaultValue) {
  const settings = readSettingsSafe();
  return settings[key] !== undefined ? settings[key] : defaultValue;
}

/**
 * Read config/prompts.json safely. Never throws.
 */
function readPromptsSafe(defaults = {}) {
  try {
    if (!fs.existsSync(PROMPTS_PATH)) return defaults;
    return { ...defaults, ...JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8')) };
  } catch (e) {
    logger.warn('Failed to read prompts.json:', e.message);
    return defaults;
  }
}

/**
 * Invalidate the in-memory cache (e.g. after settings update).
 */
function clearSettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Write a setting to config/settings.json.
 */
function writeSetting(key, value) {
  try {
    const settings = readSettingsSafe();
    settings[key] = value;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 4), 'utf8');
    clearSettingsCache();
    logger.info(`Updated setting: ${key}`);
  } catch (e) {
    logger.error(`Failed to write setting ${key}: ${e.message}`);
  }
}

module.exports = {
  readSettingsSafe,
  readSetting,
  readPromptsSafe,
  clearSettingsCache,
  writeSetting,
  SETTINGS_PATH,
  PROMPTS_PATH,
};
