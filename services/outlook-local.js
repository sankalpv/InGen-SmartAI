
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import * as WindowsService from './outlook-windows';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const logger = require('./logger').child('Outlook-Mac');

const execAsync = promisify(exec);
const isWin = process.platform === 'win32';
const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

export async function fetchOutlookEmails(count = 20) {
    if (isWin) {
        return WindowsService.fetchOutlookEmails(count);
    }
    try {
        const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_outlook_ui_optimized.js');

        let stdout, stderr;
        // Simple retry logic (1 retry)
        try {
            // JXA requires -l JavaScript
            const result = await execAsync(`osascript -l JavaScript "${scriptPath}" ${count}`, { timeout: 15000 });
            stdout = result.stdout;
            stderr = result.stderr;
        } catch (e) {
            console.warn('First Outlook fetch attempt failed, retrying...', e.message);
            // Retry once with slightly longer timeout? or just retry.
            const result = await execAsync(`osascript -l JavaScript "${scriptPath}" ${count}`, { timeout: 20000 });
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
        return filteredEmails.map(e => ({
            id: e.id,
            source: 'outlook',
            from: parseSender(e.from),
            subject: e.subject || '(No Subject)',
            snippet: e.snippet,
            body: e.body || e.snippet, // Use body if available
            date: parseDate(e.date),
            isUnread: false, // Script doesn't fetch read status yet
            labels: []
        }));

    } catch (error) {
        console.error('Failed to fetch Outlook emails:', error);
        return [{ id: 'error', source: 'outlook', from: { name: 'System', email: 'error' }, subject: `Error: ${error.message}`, snippet: '', date: new Date().toISOString(), labels: [] }];
        // return []; 
    }
}

// Simple in-memory cache
let calendarCache = {
    data: [],
    timestamp: 0
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetchOutlookCalendar(calendarId) {
    if (isWin) {
        return WindowsService.fetchOutlookCalendar(calendarId);
    }
    // Check Cache (Include calendarId in cache key to avoid mixing data)
    const cacheKey = calendarId || 'default';
    const now = Date.now();

    // Simple cache invalidation if ID changes or TTL expires
    // ideally we'd map cache by ID but for now let's just clear if ID is different
    if (calendarCache.id !== cacheKey) {
        calendarCache.data = [];
    }

    if (calendarCache.data.length > 0 && (now - calendarCache.timestamp < CACHE_TTL)) {
        console.log('Returning cached Outlook calendar data');
        return calendarCache.data;
    }

    try {
        // Use absolute path to ensure script is found regardless of CWD
        // process.cwd() in Next.js api routes is usually the project root, but let's be explicit
        const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_calendar_local.scpt');

        let cmd = `osascript "${scriptPath}"`;
        if (calendarId) {
            cmd += ` "${calendarId}"`; // Pass ID as argument
        }

        // AppleScript doesn't need -l JavaScript
        const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });

        if (stderr) {
            logger.warn('Outlook Calendar Script Error:', stderr);
        }

        logger.debug('Outlook Calendar Raw Output:', stdout);

        // Parse Pipe-Delimited Output (ID|||Subject|||Start|||End|||Location|||Body)
        const lines = stdout.trim().split('\n');
        const mappedEvents = lines
            .filter(line => line.trim().length > 0 && !line.startsWith('Error:'))
            .map(line => {
                const parts = line.split('|||');
                if (parts.length < 6) return null;

                return {
                    id: parts[0],
                    title: parts[1] || 'Untitled',
                    startTime: parts[2] || new Date().toISOString(),
                    endTime: parts[3] || new Date().toISOString(),
                    location: parts[4] || '',
                    description: parts[5] || '',
                    attendees: [], // Script doesn't fetch attendees yet to keep it fast
                    source: 'outlook'
                };
            })
            .filter(evt => evt !== null);

        // Update Cache ONLY if we found events
        // This prevents caching temporary failures or empty results if that's wrong
        if (mappedEvents.length > 0) {
            calendarCache = {
                data: mappedEvents,
                timestamp: Date.now(),
                id: cacheKey
            };
        }

        return mappedEvents;
    } catch (error) {
        logger.error('Failed to fetch Outlook calendar:', error.message);
        return [];
    }
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
        return WindowsService.getCalendarList();
    }

    // Mac Logic (Moved from Route for Facade consistency)
    try {
        const scriptPath = path.resolve(process.cwd(), 'scripts', 'get_calendar_list.scpt');
        const { stdout, stderr } = await execAsync(`osascript "${scriptPath}"`);

        if (stderr) console.error('Error fetching calendar list:', stderr);

        return JSON.parse(stdout.trim());
    } catch (error) {
        logger.error('Failed to get calendar list:', error.message);
        return [];
    }
}
