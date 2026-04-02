const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const vectorStore = require('./vector-store'); // Added import
const emailTagger = require('./email-tagger'); // AI enrichment tags
const proactiveAgent = require('./proactive-agent'); // Added import
const meetingPrep = require('./meeting-prep'); // Meeting prep briefs
const localStore = require('./local-store'); // Local data cache
const ollamaClient = require('./ollama-client'); // Ollama availability check
const issuesParser = require('./issues-parser'); // Issues folder parser
const issuesStore = require('./issues-store'); // Issues SQLite store
const slackAgent = require('./slack-agent'); // Slack DM agent
const slackIndexer = require('./slack-indexer'); // Slack channel ambient indexer
const logger = require('./logger').child('Agent');

// Configuration
const SLACK_POLL_CRON = '* * * * *'; // Every 60 seconds
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
                        // Guard: check if Ollama is reachable before attempting embeddings
                        // This prevents hundreds of "fetch failed" errors on fresh installs
                        const ollamaAvailable = await ollamaClient.ping();
                        if (!ollamaAvailable) {
                            logger.warn(`Ollama not reachable — skipping vector store ingestion for ${newEmails.length} emails (they will be embedded on next successful sync)`);
                        } else {
                            logger.info(`Batch ingesting ${newEmails.length} emails into Vector Store...`);

                            // Batch ingest (3 concurrent embeddings, single save per batch)
                            const ingestResult = await vectorStore.ingestEmailBatch(newEmails);
                            logger.info(`Ingest complete: ${ingestResult.ingested} new, ${ingestResult.skipped} skipped, ${ingestResult.errors} errors`);

                            // AI tagging: tag newly ingested emails asynchronously (non-blocking)
                            // Don't await — runs in background so sync doesn't block on LLM calls
                            if (ingestResult.ingested > 0) {
                                setImmediate(async () => {
                                    try {
                                        logger.info(`Tagging ${ingestResult.ingested} newly ingested emails...`);
                                        const emailTaggerModule = require('./email-tagger');
                                        await emailTaggerModule.backfillAll({ batchSize: 5, delayMs: 200 });
                                    } catch (e) {
                                        logger.warn('Background tagging failed:', e.message);
                                    }
                                });
                            }
                        }
                    } else {
                        logger.info('No new emails to ingest.');
                    }

                    // Update high-water mark: track newest email received date
                    // so next sync only fetches emails strictly newer than this
                    const newestEmail = newEmails.length > 0
                        ? newEmails.reduce((newest, e) =>
                            new Date(e.received || e.date) > new Date(newest.received || newest.date) ? e : newest
                          )
                        : null;
                    if (newestEmail) {
                        state.lastSyncTimestamp = new Date(newestEmail.received || newestEmail.date).toISOString();
                        logger.info(`High-water mark updated to: ${state.lastSyncTimestamp}`);
                    } else {
                        state.lastSyncTimestamp = new Date().toISOString();
                    }
                    const existingState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
                    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...existingState, ...state }, null, 2));

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
        
        // Update state (read-merge-write to preserve slackLastProcessedTs)
        state.lastInsightRun = new Date().toISOString();
        state.insightsGenerated = (state.insightsGenerated || 0) + result.generated;
        const existingInsightState = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
        fs.writeFileSync(STATE_FILE, JSON.stringify({ ...existingInsightState, ...state }, null, 2));
        
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

// Check if Outlook integration is enabled
let outlookIntegrationEnabled = true;
try {
    const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    outlookIntegrationEnabled = settings.outlookIntegration !== false;
} catch (e) { /* default to enabled */ }

if (outlookIntegrationEnabled) {
    // Fix 2: Reduce startup storm — serialize initial syncs with delays
    // Don't slam Outlook with concurrent fullSync + runSync on startup
    logger.info('Running initial local data sync (background agent will follow after 30s)...');
    localStore.fullSync().then(async (result) => {
        if (result.success) {
            logger.info(`Initial sync complete: ${result.emails} emails, ${result.calendar} cal events, ${result.issues || 0} issues in ${result.elapsed}s`);
        }
        
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
} else {
    logger.info('Outlook integration DISABLED — skipping email/calendar sync, vector store, and insight generation');
}

// Meeting prep — fires every minute, sends Slack brief for meetings starting in 13-17 min
cron.schedule(SLACK_POLL_CRON, () => {
    meetingPrep.checkAndSend().catch(e => logger.warn('MeetingPrep tick failed:', e.message));
});

// Slack DM agent — polls self-DM every 60s for new messages
if (slackAgent.isEnabled()) {
    logger.info('Slack DM agent enabled — polling every 60s');
    cron.schedule(SLACK_POLL_CRON, () => {
        slackAgent.poll();
    });
    // Initial poll after 45s (let other services settle first)
    setTimeout(() => {
        logger.info('Starting initial Slack DM agent poll...');
        slackAgent.poll();
    }, 45000);
} else {
    logger.info('Slack DM agent disabled (no slack-mcp or phonetoolAlias configured)');
}

// Slack channel ambient indexer — indexes configured channels into vector store every 15 min
// Requires slackIndexer.enabled=true and slackIndexer.channels[] in config/settings.json
const SLACK_INDEX_CRON = '*/15 * * * *'; // Every 15 minutes
let slackIndexerRunning = false;
const indexerConfig = slackIndexer.getConfig();
if (indexerConfig.enabled && indexerConfig.channels.length > 0) {
    logger.info(`Slack channel indexer enabled — ${indexerConfig.channels.length} channel(s), every 15 min`);
    cron.schedule(SLACK_INDEX_CRON, async () => {
        if (slackIndexerRunning) {
            logger.info('Slack indexer still running from previous tick — skipping');
            return;
        }
        slackIndexerRunning = true;
        try {
            const result = await slackIndexer.run();
            if (result.totalChunks > 0) {
                logger.info(`Slack indexer: ${result.totalChunks} new chunks indexed`);
            }
        } catch (e) {
            logger.warn('Slack indexer tick failed:', e.message);
        } finally {
            slackIndexerRunning = false;
        }
    });
    // Initial indexer run after 90s (let Slack MCP and other services settle)
    setTimeout(async () => {
        if (slackIndexerRunning) return;
        slackIndexerRunning = true;
        try {
            logger.info('Starting initial Slack channel indexer run...');
            await slackIndexer.run();
        } catch (e) {
            logger.warn('Initial Slack indexer run failed:', e.message);
        } finally {
            slackIndexerRunning = false;
        }
    }, 90000);
} else {
    logger.info('Slack channel indexer disabled (set slackIndexer.enabled=true in settings.json)');
}

// Background agent ready
logger.info('Background agent initialized');
