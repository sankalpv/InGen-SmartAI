const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const vectorStore = require('./vector-store'); // Added import
const proactiveAgent = require('./proactive-agent'); // Added import
const localStore = require('./local-store'); // Local data cache
const issuesParser = require('./issues-parser'); // Issues folder parser
const issuesStore = require('./issues-store'); // Issues SQLite store
const logger = require('./logger').child('Agent');

// Configuration
const SYNC_INTERVAL_CRON = '0 * * * *'; // Every 60 minutes (was 15 - battery optimization)
const INSIGHT_INTERVAL_CRON = '0 9,13 * * 1-5'; // 9 AM + 1 PM weekdays only (was every 30 min - battery optimization)
const STATE_FILE = path.join(process.cwd(), 'sync_state.json');
const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'fetch_outlook_incremental.js');

// Initialize State
let state = {
    lastSyncTimestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Default to 24h ago
    lastInsightRun: null,
    insightsGenerated: 0
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
let isGeneratingInsights = false;

async function runSync() {
    if (isSyncing) {
        console.log(`[${new Date().toISOString()}] Sync already in progress, skipping...`);
        return;
    }

    isSyncing = true;
    logger.info('Starting Background Sync...');
    logger.info('Last Sync:', state.lastSyncTimestamp);


    // ... (existing code) ...

    const command = `osascript -l JavaScript "${SCRIPT_PATH}" "${state.lastSyncTimestamp}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 10, timeout: SYNC_TIMEOUT }, async (error, stdout, stderr) => { // Added timeout
        try {
            if (error) {
                logger.error('Sync Failed:', error.message);
            }
            if (stderr) {
                logger.warn('Sync Stderr:', stderr);
            }

            if (!error) { // Only process if no exec error
                try {
                    const emails = JSON.parse(stdout);

                    // Load Settings for Filtering
                    let ignoreExternal = false;
                    try {
                        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
                        if (fs.existsSync(settingsPath)) {
                            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                            ignoreExternal = settings.ignoreExternalEmails === true;
                        }
                    } catch (e) { console.error('Settings load error:', e); }

                    // Filter emails strictly newer than lastSyncTimestamp (handling AS "last 24h" broad fetch)
                    const newEmails = emails.filter(e => {
                        if (e.error) return false; // Skip errors
                        if (ignoreExternal && (e.subject || '').includes('[EXTERNAL]')) {
                            console.log(`Skipping external email: ${e.subject}`);
                            return false;
                        }
                        return new Date(e.received) > new Date(state.lastSyncTimestamp);
                    });

                    logger.info(`Fetched ${emails.length} raw items. Found ${newEmails.length} NEW emails.`);

                    if (newEmails.length > 0) {
                        logger.info(`Ingesting ${newEmails.length} emails into Vector Store...`);

                        // Process sequentially to be nice to Ollama
                        for (const email of newEmails) {
                            await vectorStore.ingestEmail(email);
                        }
                    } else {
                        logger.info('No new emails.');
                    }

                    // Always update sync timestamp so the UI shows "Synced X min ago" correctly
                    state.lastSyncTimestamp = new Date().toISOString();
                    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

                } catch (e) {
                    logger.error('Failed to parse Outlook response or ingest:', e.message);
                }
            }
        } finally {
            isSyncing = false;
        }
    });
}

// Insight Generation Function
async function generateInsights() {
    if (isGeneratingInsights) {
        logger.info('Insight generation already in progress, skipping...');
        return;
    }

    isGeneratingInsights = true;
    logger.info('Starting AI Insight Generation...');

    try {
        const result = await proactiveAgent.runProactiveAnalysis();
        
        logger.info(`Insight generation complete. Generated ${result.generated} insights.`);
        
        // Update state
        state.lastInsightRun = new Date().toISOString();
        state.insightsGenerated = (state.insightsGenerated || 0) + result.generated;
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
        
    } catch (error) {
        logger.error('Insight generation failed:', error.message);
        logger.error(error.stack);
    } finally {
        isGeneratingInsights = false;
    }
}

// Start Cron Jobs
logger.info('Starting Local Autonomous Agent Background Service...');
logger.info('Email Sync Schedule:', SYNC_INTERVAL_CRON);
logger.info('Insight Generation Schedule:', INSIGHT_INTERVAL_CRON);

// Email sync cron
cron.schedule(SYNC_INTERVAL_CRON, () => {
    runSync();
});

// Insight generation cron
cron.schedule(INSIGHT_INTERVAL_CRON, () => {
    generateInsights();
});

// Fix 2: Reduce startup storm — serialize initial syncs with delays
// Don't slam Outlook with concurrent fullSync + runSync on startup
logger.info('Running initial local data sync (background agent will follow after 30s)...');
localStore.fullSync().then(async (result) => {
    if (result.success) {
        logger.info(`Initial sync complete: ${result.emails} emails, ${result.calendar} cal events, ${result.issues || 0} issues in ${result.elapsed}s`);
    }
    
    // Issues folder parsing removed — not needed for core functionality
    
    // Delay incremental vector store sync by 30s to let Outlook recover
    logger.info('Waiting 30s before starting incremental vector store sync...');
    setTimeout(() => {
        logger.info('Starting deferred incremental sync for vector store');
        runSync();
    }, 30000);
});
// Don't run generateInsights() on startup — wait for scheduled time to save CPU/battery
logger.info('Insight generation deferred to scheduled time (9 AM, 1 PM weekdays)');

// Schedule local store sync alongside the email cron
cron.schedule(SYNC_INTERVAL_CRON, async () => {
    try {
        await localStore.fullSync();
    } catch (e) {
        logger.error('Scheduled local sync failed:', e.message);
    }
});

    try {
        const watchChannels = getWatchChannels();

        if (messages.length === 0) {
            return;
        }

        let ingested = 0;
        for (const msg of messages) {
            try {
                ingested++;
            } catch (e) {
                // Skip individual failures silently (dedup hits are expected)
            }
        }
    } catch (error) {
    }
}

});

setTimeout(() => {
}, 60000);
