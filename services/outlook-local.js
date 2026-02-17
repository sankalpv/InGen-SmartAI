
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function fetchOutlookEmails(count = 20) {
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
            console.error('Outlook Script Error:', stderr);
        }

        const cleanJson = stdout.trim();
        if (cleanJson.startsWith('{ "error":')) {
            throw new Error(JSON.parse(cleanJson).error);
        }

        const emails = JSON.parse(cleanJson);

        // Normalize to match Gmail format for the UI
        return emails.map(e => ({
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

export async function fetchOutlookCalendar() {
    // Check Cache
    const now = Date.now();
    if (calendarCache.data.length > 0 && (now - calendarCache.timestamp < CACHE_TTL)) {
        console.log('Returning cached Outlook calendar data');
        return calendarCache.data;
    }

    try {
        // Use absolute path to ensure script is found regardless of CWD
        // process.cwd() in Next.js api routes is usually the project root, but let's be explicit
        const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_calendar_local.scpt');
        // AppleScript doesn't need -l JavaScript
        const { stdout, stderr } = await execAsync(`osascript "${scriptPath}"`, { timeout: 60000 });

        if (stderr) {
            console.error('Outlook Calendar Script Error:', stderr);
        }

        console.log('Outlook Calendar Raw Output:', stdout); // Debug log

        const events = JSON.parse(stdout.trim());
        if (events.error) {
            throw new Error(events.error);
        }

        // Ensure attendees array exists to prevent frontend crash
        // AND Map to the schema expected by the frontend (MeetingCard.js)
        const mappedEvents = events.map(evt => ({
            id: evt.id,
            title: evt.summary || 'Untitled',
            startTime: evt.start?.dateTime || new Date().toISOString(),
            endTime: evt.end?.dateTime || new Date().toISOString(),
            location: (evt.location && evt.location !== 'missing value') ? evt.location : '',
            description: (evt.description && evt.description !== 'missing value') ? evt.description : '',
            attendees: evt.attendees || [],
            source: 'outlook'
        }));

        // Update Cache ONLY if we found events
        // This prevents caching temporary failures or empty results if that's wrong
        if (mappedEvents.length > 0) {
            calendarCache = {
                data: mappedEvents,
                timestamp: Date.now()
            };
        }

        return mappedEvents;
    } catch (error) {
        console.error('Failed to fetch Outlook calendar:', error);
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
