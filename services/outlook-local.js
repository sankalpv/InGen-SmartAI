
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const logger = require('./logger').child('Outlook-Mac');

const execAsync = promisify(exec);
const isWin = process.platform === 'win32';
const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

// ─── Global Outlook Access Mutex ───
// Outlook's AppleScript bridge is single-threaded. Concurrent osascript processes
// cause Outlook to hang and become sluggish. This mutex ensures only ONE osascript
// process communicates with Outlook at any given time.
let _outlookLock = Promise.resolve();
let _lockHolder = null;

function withOutlookLock(label, fn) {
    const acquireTime = Date.now();
    const prev = _outlookLock;
    let releaseLock;
    _outlookLock = new Promise((resolve) => { releaseLock = resolve; });

    return prev.then(async () => {
        const waitMs = Date.now() - acquireTime;
        if (waitMs > 100) {
            logger.info(`[Mutex] "${label}" acquired lock after waiting ${waitMs}ms (was held by "${_lockHolder}")`);
        }
        _lockHolder = label;
        try {
            return await fn();
        } finally {
            _lockHolder = null;
            releaseLock();
        }
    });
}

// Conditionally import Windows service - use dynamic import inline where needed
const getWindowsService = async () => {
    if (!isWin) return null;
    return await import('./outlook-windows.js');
};

export async function fetchOutlookEmails(count = 20) {
    if (isWin) {
        const WindowsService = await getWindowsService();
        return WindowsService.fetchOutlookEmails(count);
    }
    return withOutlookLock(`fetchEmails(${count})`, async () => {
        try {
            const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_outlook_ui_optimized.js');

            let stdout, stderr;
            // Simple retry logic (1 retry) with backoff
            try {
                const result = await execAsync(`osascript -l JavaScript "${scriptPath}" ${count}`, {
                    timeout: 45000,
                    maxBuffer: 1024 * 1024 * 10
                });
                stdout = result.stdout;
                stderr = result.stderr;
            } catch (e) {
                // Fix 6: Don't retry on timeout — Outlook is busy
                if (e.killed || e.signal === 'SIGTERM') {
                    logger.warn('Email fetch timed out — Outlook is busy, skipping retry');
                    throw e;
                }
                logger.warn('First Outlook fetch attempt failed, retrying after 10s...', e.message);
                await new Promise(r => setTimeout(r, 10000)); // Fix 6: 10s backoff before retry
                const result = await execAsync(`osascript -l JavaScript "${scriptPath}" ${count}`, {
                    timeout: 60000,
                    maxBuffer: 1024 * 1024 * 10
                });
                stdout = result.stdout;
                stderr = result.stderr;
            }

            if (stderr) {
                logger.warn('Outlook Script Error:', stderr);
            }

            const cleanJson = stdout.trim();
            if (cleanJson.startsWith('{ "error":')) {
                throw new Error(JSON.parse(cleanJson).error);
            }

            const emails = JSON.parse(cleanJson);

            // Filter External Emails if configured
            let ignoreExternal = false;
            try {
                if (fs.existsSync(SETTINGS_PATH)) {
                    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
                    ignoreExternal = settings.ignoreExternalEmails === true;
                }
            } catch (e) {
                console.error('Failed to read settings in outlook-local:', e);
            }

            const filteredEmails = ignoreExternal
                ? emails.filter(e => !((e.subject || '').includes('[EXTERNAL]')))
                : emails;

            // Normalize to match Gmail format for the UI
            return filteredEmails.map(e => {
                const normalized = {
                    id: e.id,
                    source: 'outlook',
                    subject: e.subject || '(No Subject)',
                    snippet: e.snippet,
                    body: e.body || e.snippet,
                    date: parseDate(e.date),
                    isUnread: false,
                    labels: [],
                    isSent: e.isSent || false,
                    folder: e.folder
                };

                if (e.isSent && e.to) {
                    normalized.to = parseSender(e.to);
                    normalized.from = { name: 'Me', email: 'me' };
                } else if (e.from) {
                    normalized.from = parseSender(e.from);
                } else {
                    normalized.from = { name: 'Unknown', email: '' };
                }

                return normalized;
            });

        } catch (error) {
            console.error('Failed to fetch Outlook emails:', error);
            return [{ id: 'error', source: 'outlook', from: { name: 'System', email: 'error' }, subject: `Error: ${error.message}`, snippet: '', date: new Date().toISOString(), labels: [] }];
        }
    });
}

// Simple in-memory cache
let calendarCache = {
    data: [],
    timestamp: 0
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Export function to clear cache (useful for testing/debugging)
export function clearCalendarCache() {
    calendarCache = { data: [], timestamp: 0 };
    console.log('[Outlook] Calendar cache cleared');
}

export async function fetchOutlookCalendar(calendarId, lookbackDays = 30, forwardDays = 3) {
    if (isWin) {
        const WindowsService = await getWindowsService();
        return WindowsService.fetchOutlookCalendar(calendarId);
    }
    // Check Cache BEFORE acquiring the lock (cache check is free, no need to block)
    const cacheKey = `${calendarId || 'default'}_${lookbackDays}`;
    const now = Date.now();

    if (calendarCache.id === cacheKey && calendarCache.data.length > 0 && (now - calendarCache.timestamp < CACHE_TTL)) {
        console.log(`Returning cached Outlook calendar data (${lookbackDays} days)`);
        return calendarCache.data;
    }

    return withOutlookLock(`fetchCalendar(${lookbackDays}d)`, async () => {
        // Double-check cache inside lock (another caller may have just populated it)
        const nowInner = Date.now();
        if (calendarCache.id === cacheKey && calendarCache.data.length > 0 && (nowInner - calendarCache.timestamp < CACHE_TTL)) {
            logger.info('Calendar cache was populated while waiting for lock');
            return calendarCache.data;
        }

        // Reset cache if key changed
        if (calendarCache.id !== cacheKey) {
            calendarCache.data = [];
        }

        try {
            const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_calendar_with_recurring.scpt');
            const calId = calendarId || '432';
            const cmd = `osascript "${scriptPath}" "${calId}" "${lookbackDays}" "${forwardDays}"`;
            
            logger.info(`Fetching calendar ID ${calId} with ${lookbackDays} days back, ${forwardDays} days forward`);

            const { stdout, stderr } = await execAsync(cmd, { timeout: 120000, maxBuffer: 1024 * 1024 * 10 });

            if (stderr) {
                logger.warn('Outlook Calendar Script Error:', stderr);
            }

            logger.debug('Outlook Calendar Raw Output:', stdout);

            const lines = stdout.trim().split('\n');
            const mappedEvents = lines
                .filter(line => line.trim().length > 0 && !line.startsWith('Error:'))
                .map(line => {
                    const parts = line.split('|||');
                    if (parts.length < 6) return null;

                    const busyStatus = parts[6] || 'busy';
                    const attendeeCount = parseInt(parts[7]) || 0;

                    return {
                        id: parts[0],
                        title: parts[1] || 'Untitled',
                        startTime: parts[2] || new Date().toISOString(),
                        endTime: parts[3] || new Date().toISOString(),
                        location: parts[4] || '',
                        description: parts[5] || '',
                        busyStatus: busyStatus.toLowerCase(),
                        attendees: Array(attendeeCount).fill({}),
                        source: 'outlook'
                    };
                })
                .filter(evt => evt !== null);

            const seen = new Set();
            const deduped = mappedEvents.filter(evt => {
                const key = `${evt.title}_${evt.startTime}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            logger.info(`Calendar fetch: ${mappedEvents.length} raw events → ${deduped.length} after dedup`);

            if (deduped.length > 0) {
                calendarCache = {
                    data: deduped,
                    timestamp: Date.now(),
                    id: cacheKey
                };
            }

            return deduped;
        } catch (error) {
            logger.error('Failed to fetch Outlook calendar:', error.message);
            // Fix 6: Don't retry on timeout — Outlook is busy
            if (error.killed || error.signal === 'SIGTERM') {
                logger.warn('Calendar fetch timed out — Outlook is busy, skipping retry');
                return [];
            }
            // Retry once after 10 seconds with backoff (Fix 6)
            try {
                logger.info('Retrying calendar fetch in 10 seconds...');
                await new Promise(r => setTimeout(r, 10000));
                const calId = calendarId || '432';
                const retryCmd = `osascript "${path.resolve(process.cwd(), 'scripts/fetch_calendar_with_recurring.scpt')}" "${calId}" "${lookbackDays}" "${forwardDays}"`;
                const retryResult = await execAsync(retryCmd, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
                const retryEvents = retryResult.stdout.trim().split('\n').filter(l => l.trim() && !l.startsWith('Error:')).map(line => {
                    const parts = line.split('|||');
                    if (parts.length < 6) return null;
                    return { id: parts[0], title: parts[1] || 'Untitled', startTime: parts[2], endTime: parts[3], location: parts[4] || '', description: parts[5] || '', busyStatus: (parts[6] || 'busy').toLowerCase(), attendees: Array(parseInt(parts[7]) || 0).fill({}), source: 'outlook' };
                }).filter(Boolean);
                if (retryEvents && retryEvents.length > 0) {
                    logger.info(`Calendar retry successful: ${retryEvents.length} events`);
                    return retryEvents;
                }
            } catch (retryErr) {
                logger.error('Calendar retry also failed:', retryErr.message);
            }
            return [];
        }
    });
}


function parseSender(senderStr) {
    const match = senderStr.match(/^(.*?)\s*<(.+)>$/);
    if (match) {
        return { name: match[1], email: match[2] };
    }
    return { name: senderStr, email: '' };
}

function parseDate(dateStr) {
    try {
        if (!dateStr) return new Date().toISOString();
        // Remove 'at' and potential non-breaking spaces
        const cleanStr = dateStr.replace(/\bat\b/i, '').replace(/\u202F/g, ' ').replace(/\s+/g, ' ').trim();
        const date = new Date(cleanStr);
        if (isNaN(date.getTime())) {
            console.warn('Failed to parse date:', dateStr);
            return new Date().toISOString();
        }
        return date.toISOString();
    } catch (e) {
        return new Date().toISOString();
    }
}

export async function getCalendarList() {
    if (isWin) {
        const WindowsService = await getWindowsService();
        return WindowsService.getCalendarList();
    }

    return withOutlookLock('getCalendarList', async () => {
        try {
            const scriptPath = path.resolve(process.cwd(), 'scripts', 'get_calendar_list.scpt');
            const { stdout, stderr } = await execAsync(`osascript "${scriptPath}"`);

            if (stderr) console.error('Error fetching calendar list:', stderr);

            return JSON.parse(stdout.trim());
        } catch (error) {
            logger.error('Failed to get calendar list:', error.message);
            return [];
        }
    });
}
