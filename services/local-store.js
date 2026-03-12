/**
 * Local Data Store — Offline-first cache for Outlook emails and calendar
 * 
 * All API routes read from local JSON files for instant responses (<1ms).
 * Background agent writes to these files on a cron schedule.
 * Stale-while-revalidate: serve cached data immediately, refresh in background.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('LocalStore');

const DATA_DIR = path.join(process.cwd(), 'data');
const EMAILS_FILE = path.join(DATA_DIR, 'emails.json');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar.json');
const CALENDAR_WEEK_FILE = path.join(DATA_DIR, 'calendar-week.json');
const ISSUES_FILE = path.join(DATA_DIR, 'issues-raw.json');

const MAX_STALE_MS = 60 * 60 * 1000; // 60 minutes — consider data stale after this

// Ensure data directory exists
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info('Created data directory');
    }
}

// ─── Generic read/write ───

function readStore(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const store = JSON.parse(raw);
            const age = Date.now() - new Date(store.updatedAt).getTime();
            return {
                data: store.data,
                updatedAt: store.updatedAt,
                ageMs: age,
                ageMinutes: Math.round(age / 60000),
                isStale: age > MAX_STALE_MS,
                exists: true
            };
        }
    } catch (e) {
        logger.error(`Failed to read ${path.basename(filePath)}:`, e.message);
    }
    return { data: null, updatedAt: null, ageMs: Infinity, ageMinutes: Infinity, isStale: true, exists: false };
}

function writeStore(filePath, data) {
    try {
        ensureDataDir();
        const store = {
            updatedAt: new Date().toISOString(),
            count: Array.isArray(data) ? data.length : Object.keys(data).length,
            data
        };
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
        logger.info(`Updated ${path.basename(filePath)} (${store.count} items)`);
        return true;
    } catch (e) {
        logger.error(`Failed to write ${path.basename(filePath)}:`, e.message);
        return false;
    }
}

// ─── Emails ───

function getEmails() {
    return readStore(EMAILS_FILE);
}

function saveEmails(emails) {
    return writeStore(EMAILS_FILE, emails);
}

// ─── Calendar (Dashboard: 7 days back, 3 forward) ───

function getCalendar() {
    return readStore(CALENDAR_FILE);
}

function saveCalendar(events) {
    return writeStore(CALENDAR_FILE, events);
}

// ─── Calendar Week (Week Ahead: 0 back, 8 forward) ───

function getCalendarWeek() {
    return readStore(CALENDAR_WEEK_FILE);
}

function saveCalendarWeek(events) {
    return writeStore(CALENDAR_WEEK_FILE, events);
}

// ─── Issues (from Outlook "Issues" folder) ───

function getIssues() {
    return readStore(ISSUES_FILE);
}

function saveIssues(issues) {
    return writeStore(ISSUES_FILE, issues);
}

// ─── Status ───

function getStatus() {
    const emails = readStore(EMAILS_FILE);
    const calendar = readStore(CALENDAR_FILE);
    const calendarWeek = readStore(CALENDAR_WEEK_FILE);

    const issues = readStore(ISSUES_FILE);

    return {
        emails: {
            exists: emails.exists,
            count: emails.data ? emails.data.length : 0,
            ageMinutes: emails.ageMinutes,
            isStale: emails.isStale,
            updatedAt: emails.updatedAt
        },
        calendar: {
            exists: calendar.exists,
            count: calendar.data ? calendar.data.length : 0,
            ageMinutes: calendar.ageMinutes,
            isStale: calendar.isStale,
            updatedAt: calendar.updatedAt
        },
        calendarWeek: {
            exists: calendarWeek.exists,
            count: calendarWeek.data ? calendarWeek.data.length : 0,
            ageMinutes: calendarWeek.ageMinutes,
            isStale: calendarWeek.isStale,
            updatedAt: calendarWeek.updatedAt
        },
        issues: {
            exists: issues.exists,
            count: issues.data ? issues.data.length : 0,
            ageMinutes: issues.ageMinutes,
            isStale: issues.isStale,
            updatedAt: issues.updatedAt
        }
    };
}

// ─── Full Sync (called by background agent) ───
// Uses a child process to avoid ESM/CJS incompatibility
// (outlook-local.js uses ESM imports, background-agent.js uses CJS)

const { exec } = require('child_process');

// Fix 3: Coalesce concurrent sync requests — if a sync is already in-flight,
// return the same promise instead of spawning a duplicate child process.
let _pendingSyncPromise = null;

async function fullSync() {
    if (_pendingSyncPromise) {
        logger.info('Sync already in progress, coalescing — returning in-flight promise');
        return _pendingSyncPromise;
    }

    logger.info('Starting full local data sync from Outlook...');
    const startTime = Date.now();

    _pendingSyncPromise = (async () => {
        try {
            const syncScript = path.join(process.cwd(), 'scripts', 'sync-local-data.mjs');
            
            return await new Promise((resolve) => {
                exec(
                    `node "${syncScript}"`,
                    { cwd: process.cwd(), timeout: 300000, maxBuffer: 10 * 1024 * 1024 },
                    (error, stdout, stderr) => {
                        const elapsed = Math.round((Date.now() - startTime) / 1000);
                        
                        if (error) {
                            logger.error('Sync script failed:', error.message);
                            if (stderr) logger.error('Sync stderr:', stderr.substring(0, 500));
                            resolve({ success: false, error: error.message, elapsed });
                            return;
                        }

                        try {
                            const result = JSON.parse(stdout.trim().split('\n').pop());
                            logger.info(`Full sync complete in ${elapsed}s: ${result.emails} emails, ${result.calendar} cal, ${result.calendarWeek} week`);
                            resolve({ success: true, ...result, elapsed });
                        } catch (e) {
                            logger.warn(`Sync completed but output parse failed. stdout: ${stdout.substring(0, 200)}`);
                            resolve({ success: true, elapsed });
                        }
                    }
                );
            });

        } catch (error) {
            logger.error('Full sync failed:', error.message);
            return { success: false, error: error.message };
        } finally {
            _pendingSyncPromise = null;
        }
    })();

    return _pendingSyncPromise;
}

module.exports = {
    getEmails,
    saveEmails,
    getCalendar,
    saveCalendar,
    getCalendarWeek,
    saveCalendarWeek,
    getIssues,
    saveIssues,
    getStatus,
    fullSync,
    ensureDataDir
};
