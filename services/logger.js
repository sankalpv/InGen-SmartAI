/**
 * SmartAI Structured Logger
 * 
 * Usage (CommonJS):  const logger = require('./logger');
 * Usage (ESM):       import logger from './logger.js';
 * 
 * Log levels: DEBUG < INFO < WARN < ERROR
 * Set LOG_LEVEL env var to control verbosity (default: INFO)
 */

const fs = require('fs');
const path = require('path');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_LABELS = { 0: 'DEBUG', 1: 'INFO ', 2: 'WARN ', 3: 'ERROR' };
const LEVEL_COLORS = { 0: '\x1b[36m', 1: '\x1b[32m', 2: '\x1b[33m', 3: '\x1b[31m' };
const RESET = '\x1b[0m';

const configuredLevel = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LEVELS.INFO;

const LOG_FILE = path.join(process.cwd(), 'smartai.log');
let logStream = null;

function getLogStream() {
    if (!logStream) {
        try {
            logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
        } catch (e) {
            // If we can't open the log file, just use console
        }
    }
    return logStream;
}

function formatMessage(level, module, ...args) {
    const timestamp = new Date().toISOString();
    const label = LEVEL_LABELS[level];
    const parts = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a)));
    const message = parts.join(' ');
    return { timestamp, label, module, message };
}

function write(level, module, ...args) {
    if (level < configuredLevel) return;

    const { timestamp, label, module: mod, message } = formatMessage(level, module, ...args);
    const color = LEVEL_COLORS[level];

    // Console output (colorized)
    console.log(`${color}[${timestamp}] [${label}] [${mod}]${RESET} ${message}`);

    // File output (plain text)
    const stream = getLogStream();
    if (stream) {
        stream.write(`[${timestamp}] [${label}] [${mod}] ${message}\n`);
    }
}

const logger = {
    debug: (module, ...args) => write(LEVELS.DEBUG, module, ...args),
    info: (module, ...args) => write(LEVELS.INFO, module, ...args),
    warn: (module, ...args) => write(LEVELS.WARN, module, ...args),
    error: (module, ...args) => write(LEVELS.ERROR, module, ...args),

    /** Create a child logger pre-bound to a module name */
    child: (module) => ({
        debug: (...args) => write(LEVELS.DEBUG, module, ...args),
        info: (...args) => write(LEVELS.INFO, module, ...args),
        warn: (...args) => write(LEVELS.WARN, module, ...args),
        error: (...args) => write(LEVELS.ERROR, module, ...args),
    }),
};

module.exports = logger;

// ESM-compatible default export shim
module.exports.default = logger;
