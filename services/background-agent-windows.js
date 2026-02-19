const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const vectorStore = require('./vector-store');
const logger = require('./logger').child('Agent-Win');

// Configuration
const SYNC_INTERVAL_CRON = '*/15 * * * *'; // Every 15 minutes
const STATE_FILE = path.join(process.cwd(), 'sync_state.json');
// Windows Script Path
const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'windows', 'fetch_emails_incremental.ps1');

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
    logger.info('Starting Background Sync (Windows)...');
    logger.info('Last Sync:', state.lastSyncTimestamp);

    // Windows Command Construction
    // powershell -NoProfile -ExecutionPolicy Bypass -File "path" "timestamp"
    const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${SCRIPT_PATH}" "${state.lastSyncTimestamp}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: SYNC_TIMEOUT }, async (error, stdout, stderr) => {
        try {
            if (error) {
                logger.error('Sync Failed:', error.message);
            }
            if (stderr) {
                // PowerShell stderr often contains non-critical info, but log it
                logger.warn('Sync Stderr:', stderr);
            }

            if (!error) {
                try {
                    // PowerShell Output might have extra whitespace
                    const cleanStdout = stdout.trim();
                    if (!cleanStdout) {
                        logger.info('No output from script.');
                        return;
                    }

                    const emails = JSON.parse(cleanStdout);

                    if (Array.isArray(emails)) {

                        // Load Settings for Filtering
                        let ignoreExternal = false;
                        try {
                            const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
                            if (fs.existsSync(settingsPath)) {
                                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                                ignoreExternal = settings.ignoreExternalEmails === true;
                            }
                        } catch (e) { console.error('Settings load error:', e); }

                        // Filter
                        const newEmails = emails.filter(e => {
                            if (e.error) return false;

                            if (ignoreExternal && (e.subject || '').includes('[EXTERNAL]')) {
                                console.log(`Skipping external email: ${e.subject}`);
                                return false;
                            }

                            // Redundant but safe check vs timestamp
                            return new Date(e.received) > new Date(state.lastSyncTimestamp);
                        });

                        logger.info(`Fetched ${emails.length} items. Found ${newEmails.length} NEW emails.`);

                        if (newEmails.length > 0) {
                            logger.info(`Ingesting ${newEmails.length} emails into Vector Store...`);

                            // Process sequentially
                            for (const email of newEmails) {
                                await vectorStore.ingestEmail(email);
                            }

                            // Update State
                            state.lastSyncTimestamp = new Date().toISOString();
                            fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
                        } else {
                            logger.info('No new emails.');
                        }
                    } else if (emails.error) {
                        logger.error('Script Error:', emails.error);
                    }

                } catch (e) {
                    logger.error('Failed to parse Outlook response or ingest:', e.message);
                }
            }
        } finally {
            isSyncing = false;
        }
    });
}

// Start Cron
logger.info('Starting Local Autonomous Agent Background Service (Windows)...');
logger.info('Schedule:', SYNC_INTERVAL_CRON);
cron.schedule(SYNC_INTERVAL_CRON, () => {
    runSync();
});

// Run once immediately on start for testing
runSync();
