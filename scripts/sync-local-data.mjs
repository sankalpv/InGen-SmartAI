#!/usr/bin/env node
/**
 * Sync local data from Outlook — runs as ESM module
 * Called by local-store.js via child process to avoid ESM/CJS conflicts
 * 
 * Uses batched progressive fetching: 20 emails at a time to avoid timeout
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

function isValidEmailData(emails) {
    // Validate: must be array, must not contain error objects
    if (!Array.isArray(emails) || emails.length === 0) return false;
    if (emails[0]?.id === 'error') return false;
    return true;
}

const result = { emails: 0, calendar: 0, calendarWeek: 0 };

// Fetch emails in batches of 20 (progressive — avoids AppleScript timeout)
const BATCH_SIZE = 20;
const TARGET_EMAILS = 200; // Fetch up to 200 emails total
let allEmails = [];

// Load existing cache if available (we'll append to it)
const emailsFile = path.join(DATA_DIR, 'emails.json');
try {
    if (fs.existsSync(emailsFile)) {
        const existing = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));
        if (existing.data && Array.isArray(existing.data) && existing.data[0]?.id !== 'error') {
            allEmails = existing.data;
        }
    }
} catch (e) { /* ignore */ }

// Fetch first batch (fast, reliable)
try {
    const firstBatch = await fetchOutlookEmails(BATCH_SIZE);
    if (isValidEmailData(firstBatch)) {
        allEmails = firstBatch; // Replace with fresh first batch
        writeStore(emailsFile, allEmails);
        result.emails = allEmails.length;
        console.error(`[Sync] First batch: ${firstBatch.length} emails cached`);
        
        // Fetch additional batches in background (progressive growth)
        for (let offset = BATCH_SIZE; offset < TARGET_EMAILS; offset += BATCH_SIZE) {
            try {
                // The JXA script now supports offset parameter
                const batch = await fetchOutlookEmails(BATCH_SIZE);
                if (isValidEmailData(batch)) {
                    // Deduplicate by ID
                    const existingIds = new Set(allEmails.map(e => e.id));
                    const newEmails = batch.filter(e => !existingIds.has(e.id));
                    
                    if (newEmails.length === 0) {
                        console.error(`[Sync] Batch at offset ${offset}: no new emails, stopping`);
                        break;
                    }
                    
                    allEmails = [...allEmails, ...newEmails];
                    writeStore(emailsFile, allEmails);
                    result.emails = allEmails.length;
                    console.error(`[Sync] Batch at offset ${offset}: +${newEmails.length} emails (total: ${allEmails.length})`);
                } else {
                    console.error(`[Sync] Batch at offset ${offset} returned invalid data, stopping`);
                    break;
                }
            } catch (batchErr) {
                console.error(`[Sync] Batch at offset ${offset} failed: ${batchErr.message}, stopping`);
                break; // Stop fetching more batches but keep what we have
            }
        }
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