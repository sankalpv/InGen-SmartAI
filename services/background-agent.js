const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const vectorStore = require('./vector-store'); // Added import

// Configuration
const SYNC_INTERVAL_CRON = '*/15 * * * *'; // Every 15 minutes
const STATE_FILE = path.join(process.cwd(), 'sync_state.json');
const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'fetch_outlook_incremental.js');

// Initialize State
let state = {
    lastSyncTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Default to 24h ago
};

if (fs.existsSync(STATE_FILE)) {
    try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {
        console.error('Failed to parse sync_state.json, using default');
    }
} else {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const SYNC_TIMEOUT = 1000 * 60 * 5; // 5 minutes timeout

let isSyncing = false;

async function runSync() {
    if (isSyncing) {
        console.log(`[${new Date().toISOString()}] Sync already in progress, skipping...`);
        return;
    }

    isSyncing = true;
    console.log(`[${new Date().toISOString()}] Starting Background Sync...`);
    console.log(`Last Sync: ${state.lastSyncTimestamp}`);


    // ... (existing code) ...

    const command = `osascript -l JavaScript "${SCRIPT_PATH}" "${state.lastSyncTimestamp}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: SYNC_TIMEOUT }, async (error, stdout, stderr) => { // Added timeout
        try {
            if (error) {
                console.error(`[${new Date().toISOString()}] Sync Failed: ${error.message}`);
                // Don't return, ensure we allow retry next time by clearing flag in finally
            }
            if (stderr) {
                console.error(`[${new Date().toISOString()}] Sync Stderr: ${stderr}`);
            }

            if (!error) { // Only process if no exec error
                try {
                    const emails = JSON.parse(stdout);

                    // Filter emails strictly newer than lastSyncTimestamp (handling AS "last 24h" broad fetch)
                    const newEmails = emails.filter(e => {
                        if (e.error) return false; // Skip errors
                        return new Date(e.received) > new Date(state.lastSyncTimestamp);
                    });

                    console.log(`[${new Date().toISOString()}] Fetched ${emails.length} raw items. Found ${newEmails.length} NEW emails.`);

                    if (newEmails.length > 0) {
                        console.log(`[${new Date().toISOString()}] Ingesting ${newEmails.length} emails into Vector Store...`);

                        // Process sequentially to be nice to Ollama
                        for (const email of newEmails) {
                            await vectorStore.ingestEmail(email);
                        }

                        // Update State
                        state.lastSyncTimestamp = new Date().toISOString();
                        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
                    } else {
                        console.log(`[${new Date().toISOString()}] No new emails.`);
                    }

                } catch (e) {
                    console.error(`[${new Date().toISOString()}] Failed to parse Outlook response or ingest: ${e.message}`);
                    console.error(`Output start: ${stdout ? stdout.substring(0, 100) : 'null'}...`);
                }
            }
        } finally {
            isSyncing = false;
        }
    });
}

// Start Cron
console.log('Starting Local Autonomous Agent Background Service...');
console.log(`Schedule: ${SYNC_INTERVAL_CRON}`);

cron.schedule(SYNC_INTERVAL_CRON, () => {
    runSync();
});

// Run once immediately on start for testing
runSync();
