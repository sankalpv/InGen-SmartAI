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

// ─── Status ───

function getStatus() {
    const emails = readStore(EMAILS_FILE);
    const calendar = readStore(CALENDAR_FILE);
    const calendarWeek = readStore(CALENDAR_WEEK_FILE);

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
        }
    };
}

// ─── Full Sync (called by background agent) ───

let isSyncing = false;

async function fullSync() {
    if (isSyncing) {
        logger.info('Sync already in progress, skipping');
        return { success: false, reason: 'already_syncing' };
    }

    isSyncing = true;
    logger.info('Starting full local data sync from Outlook...');
    const startTime = Date.now();

    try {
        // Dynamic import to avoid circular deps
        const outlookLocal = require('./outlook-local');

        // Fetch emails (100)
        let emailCount = 0;
        try {
            const emails = await outlookLocal.fetchOutlookEmails(100);
            if (emails && emails.length > 0) {
                saveEmails(emails);
                emailCount = emails.length;
            }
        } catch (e) {
            logger.error('Email sync failed:', e.message);
        }

        // Fetch calendar (dashboard view: 7 days back, 3 forward)
        let calendarCount = 0;
        try {
            const calendarId = null; // Uses default from settings
            const events = await outlookLocal.fetchOutlookCalendar(calendarId, 7, 3);
            if (events && events.length > 0) {
                saveCalendar(events);
                calendarCount = events.length;
            }
        } catch (e) {
            logger.error('Calendar sync failed:', e.message);
        }

        // Fetch week-ahead calendar (0 back, 8 forward)
        let weekCount = 0;
        try {
            const calendarId = null;
            const weekEvents = await outlookLocal.fetchOutlookCalendar(calendarId, 0, 8);
            if (weekEvents && weekEvents.length > 0) {
                saveCalendarWeek(weekEvents);
                weekCount = weekEvents.length;
            }
        } catch (e) {
            logger.error('Week calendar sync failed:', e.message);
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.info(`Full sync complete in ${elapsed}s: ${emailCount} emails, ${calendarCount} calendar events, ${weekCount} week events`);

        return {
            success: true,
            emails: emailCount,
            calendar: calendarCount,
            calendarWeek: weekCount,
            elapsed
        };

    } catch (error) {
        logger.error('Full sync failed:', error.message);
        return { success: false, error: error.message };
    } finally {
        isSyncing = false;
    }
}

module.exports = {
    getEmails,
    saveEmails,
    getCalendar,
    saveCalendar,
    getCalendarWeek,
    saveCalendarWeek,
    getStatus,
    fullSync,
    ensureDataDir
};