#!/usr/bin/env node
/**
 * Sync local data from Outlook — runs as ESM module
 * Called by local-store.js via child process to avoid ESM/CJS conflicts
 * 
 * Uses batched progressive fetching: 20 emails at a time to avoid timeout
 */

import { fetchOutlookEmailsHydrated, fetchOutlookCalendar } from '../services/outlook-mcp.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const IS_WINDOWS = os.platform() === 'win32';

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

// Fetch emails via MCP in one call (aws-outlook-mcp handles pagination internally)
const TARGET_EMAILS = 100; // MCP call — no batch loop needed
let allEmails = [];

const emailsFile = path.join(DATA_DIR, 'emails.json');

// Load existing cache so we can merge (never shrink)
try {
    if (fs.existsSync(emailsFile)) {
        const existing = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));
        if (existing.data && Array.isArray(existing.data) && existing.data[0]?.id !== 'error') {
            allEmails = existing.data;
        }
    }
} catch (e) { /* ignore */ }

try {
    const fresh = await fetchOutlookEmailsHydrated(TARGET_EMAILS);
    if (isValidEmailData(fresh)) {
        // Merge: update existing + prepend new
        const existingIds = new Set(allEmails.map(e => e.id));
        const newEmails = fresh.filter(e => !existingIds.has(e.id));
        allEmails = [...newEmails, ...allEmails.map(e => {
            const f = fresh.find(x => x.id === e.id);
            return f || e;
        })].slice(0, TARGET_EMAILS * 5); // keep up to 500 total
        writeStore(emailsFile, allEmails);
        result.emails = allEmails.length;
        console.error(`[Sync] Emails: ${fresh.length} fetched, ${newEmails.length} new, total: ${allEmails.length}`);
    } else {
        console.error('[Sync] Email fetch returned no valid data');
    }
} catch (e) {
    console.error('Email sync failed:', e.message);
}

// Windows: Run Python extractor to refresh outlook-cache.db before calendar fetch
// New Outlook (M365) stores calendar in IndexedDB, not accessible via COM
if (IS_WINDOWS) {
    try {
        const extractorPath = path.join(__dirname, '..', 'scripts', 'windows', 'outlook_extractor.py');
        if (fs.existsSync(extractorPath)) {
            console.error('[Sync] Running Outlook IndexedDB extractor (New Outlook calendar + contacts)...');
            const { execSync: execSyncExtractor } = await import('child_process');
            try {
                execSyncExtractor(`python "${extractorPath}"`, {
                    timeout: 120000,
                    maxBuffer: 10 * 1024 * 1024,
                    cwd: path.join(__dirname, '..'),
                    stdio: ['pipe', 'pipe', 'pipe'] // Suppress output
                });
                console.error('[Sync] IndexedDB extractor completed');
            } catch (extractErr) {
                console.error(`[Sync] IndexedDB extractor failed (non-critical): ${extractErr.message}`);
            }
        }
    } catch (e) {
        console.error(`[Sync] Extractor setup failed: ${e.message}`);
    }
}

// Single wide calendar fetch (30 days back, 14 days forward) — single source of truth
// All pages filter from this one dataset
// On Windows with New Outlook, this now reads from outlook-cache.db (populated by extractor above)
try {
    const events = await fetchOutlookCalendar(null, 30, 14);
    if (events && events.length > 0) {
        writeStore(path.join(DATA_DIR, 'calendar.json'), events);
        result.calendar = events.length;
        console.error(`[Sync] Calendar: ${events.length} events`);
    } else {
        console.error('[Sync] Calendar: 0 events returned');
    }
} catch (e) {
    console.error('Calendar sync failed:', e.message);
}

// Issues folder fetch removed — not needed for core functionality
result.issues = 0;

// Output result as JSON for parent process
console.log(JSON.stringify(result));
