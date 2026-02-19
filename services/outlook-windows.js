
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const logger = require('./logger').child('Outlook-Win');

const execAsync = promisify(exec);
const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

// Helper to execute PowerShell scripts
async function executePowerShell(scriptName, args = []) {
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'windows', scriptName);

    // Construct command: powershell -NoProfile -ExecutionPolicy Bypass -File "path/to/script.ps1" -Arg1 "val1"
    let cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
    if (args.length > 0) {
        // Simple argument quoting
        const safeArgs = args.map(a => `"${a}"`).join(' ');
        cmd += ` ${safeArgs}`;
    }

    // Windows operations can be slow, especially COM instantiation
    const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });

    if (stderr) {
        // PowerShell often writes non-errors to stderr (like progress), but we set ErrorActionPreference=Stop in scripts
        // So real errors should be caught here or in the script output
        // We'll log it but return stdout if present
        logger.warn(`PowerShell stderr (${scriptName}):`, stderr);
    }

    return stdout.trim();
}

export async function fetchOutlookEmails(count = 20) {
    try {
        const jsonOutput = await executePowerShell('fetch_emails.ps1', [count]);

        if (!jsonOutput || jsonOutput === '[]') return [];

        const emails = JSON.parse(jsonOutput);

        // Filter External Emails if configured
        let ignoreExternal = false;
        try {
            if (fs.existsSync(SETTINGS_PATH)) {
                const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
                ignoreExternal = settings.ignoreExternalEmails === true;
            }
        } catch (e) {
            console.error('Failed to read settings in outlook-windows:', e);
        }

        const filteredEmails = ignoreExternal
            ? emails.filter(e => !((e.subject || '').includes('[EXTERNAL]')))
            : emails;

        // Normalize
        return filteredEmails.map(e => ({
            id: e.id,
            source: 'outlook',
            from: parseSender(e.from),
            subject: e.subject || '(No Subject)',
            snippet: e.snippet || '',
            body: e.body || '',
            date: e.date || new Date().toISOString(),
            isUnread: false,
            labels: []
        }));
    } catch (error) {
        logger.error('Windows Outlook Email Fetch Error:', error.message);
        return [];
    }
}

let calendarCache = {
    data: [],
    timestamp: 0,
    id: null
};
const CACHE_TTL = 5 * 60 * 1000;

export async function fetchOutlookCalendar(calendarId) {
    const cacheKey = calendarId || 'default';
    const now = Date.now();

    if (calendarCache.id !== cacheKey) {
        calendarCache.data = [];
    }

    if (calendarCache.data.length > 0 && (now - calendarCache.timestamp < CACHE_TTL)) {
        logger.debug('Returning cached Windows Outlook calendar');
        return calendarCache.data;
    }

    try {
        // Pass calendarId (EntryID) to script
        // If ID is '432' (MacOS default), we pass empty string to let script find default
        const actualId = (calendarId === '432' || !calendarId) ? '' : calendarId;

        const rawData = await executePowerShell('fetch_calendar.ps1', [actualId]);

        const lines = rawData.split('\n');
        const mappedEvents = lines
            .filter(line => line.trim().length > 0)
            .map(line => {
                const parts = line.split('|||');
                if (parts.length < 6) return null;
                return {
                    id: parts[0],
                    title: parts[1] || 'Untitled',
                    startTime: parts[2],
                    endTime: parts[3],
                    location: parts[4],
                    description: parts[5],
                    attendees: [],
                    source: 'outlook'
                };
            })
            .filter(e => e !== null);

        if (mappedEvents.length > 0) {
            calendarCache = {
                data: mappedEvents,
                timestamp: Date.now(),
                id: cacheKey
            };
        }

        return mappedEvents;

    } catch (error) {
        logger.error('Windows Outlook Calendar Fetch Error:', error.message);
        return [];
    }
}

export async function getCalendarList() {
    try {
        const jsonOutput = await executePowerShell('get_calendars.ps1', []);
        return JSON.parse(jsonOutput);
    } catch (error) {
        logger.error('Windows getCalendarList Error:', error.message);
        return [];
    }
}

// Helpers (Duplicated from local to keep isolated)
function parseSender(senderStr) {
    // Windows script outputs "Name <Email>" already
    const match = senderStr.match(/^(.*?)\s*<(.+)>$/);
    if (match) {
        return { name: match[1], email: match[2] };
    }
    return { name: senderStr, email: '' };
}
