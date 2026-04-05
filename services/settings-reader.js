/**
 * Settings Reader — Safe, cached access to config/settings.json
 * 
 * Eliminates duplicate fs.readFileSync + JSON.parse + try/catch patterns
 * across 8+ services (ticket-health, ollama-client, platform-detector, etc.)
 * 
 * Usage:
 *   const { readSettingsSafe } = require('./settings-reader');
 *   const alias = readSettingsSafe('phonetoolAlias', 'unknown');
 *   const temp = readSettingsSafe('aiTemperature', 0.25);
 *   const all = readSettingsSafe(); // returns full settings object
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

// In-memory cache with 30-second TTL (avoids repeated disk reads)
let _cache = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000;

/**
 * Read a value from config/settings.json with a safe fallback.
 * 
 * @param {string} [key] - Dot-notation key (e.g., 'phonetoolAlias'). If omitted, returns full object.
 * @param {*} [defaultValue=null] - Fallback if key is missing or file can't be read.
 * @returns {*} The setting value, or defaultValue if not found.
 */
function readSettingsSafe(key, defaultValue = null) {
  try {
    // Use cache if fresh
    if (_cache && (Date.now() - _cacheTimestamp) < CACHE_TTL) {
      return key ? (_cache[key] ?? defaultValue) : { ..._cache };
    }

    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    _cache = JSON.parse(raw);
    _cacheTimestamp = Date.now();

    if (!key) return { ..._cache };
    return _cache[key] ?? defaultValue;
  } catch (e) {
    // File doesn't exist, invalid JSON, or permission error — return safe default
    return key ? defaultValue : {};
  }
}

/**
 * Invalidate the settings cache (useful after writes to settings.json).
 */
function clearSettingsCache() {
  _cache = null;
  _cacheTimestamp = 0;
}

module.exports = { readSettingsSafe, clearSettingsCache };
