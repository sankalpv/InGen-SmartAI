#!/usr/bin/env node
/**
 * Sync local data from Outlook — runs as ESM module
 * Called by local-store.js via child process to avoid ESM/CJS conflicts
 */

import { fetchOutlookEmails, fetchOutlookCalendar } from '../services/outlook-local.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function writeStore(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify({
        updatedAt: new Date().toISOString(),
        count: Array.isArray(data) ? data.length : 0,
        data
    }, null, 2));
}

const result = { emails: 0, calendar: 0, calendarWeek: 0 };

// Fetch emails
try {
    const emails = await fetchOutlookEmails(100);
    if (emails && emails.length > 0) {
        writeStore(path.join(DATA_DIR, 'emails.json'), emails);
        result.emails = emails.length;
    }
} catch (e) {
    console.error('Email sync failed:', e.message);
}

// Fetch calendar (dashboard: 7 days back, 3 forward)
try {
    const events = await fetchOutlookCalendar(null, 7, 3);
    if (events && events.length > 0) {
        writeStore(path.join(DATA_DIR, 'calendar.json'), events);
        result.calendar = events.length;
    }
} catch (e) {
    console.error('Calendar sync failed:', e.message);
}

// Fetch week-ahead calendar (0 back, 8 forward)
try {
    const weekEvents = await fetchOutlookCalendar(null, 0, 8);
    if (weekEvents && weekEvents.length > 0) {
        writeStore(path.join(DATA_DIR, 'calendar-week.json'), weekEvents);
        result.calendarWeek = weekEvents.length;
    }
} catch (e) {
    console.error('Week calendar sync failed:', e.message);
}

// Output result as JSON for parent process
console.log(JSON.stringify(result));