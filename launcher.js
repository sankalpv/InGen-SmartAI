const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Load .env.local (Next.js loads it for the app, but launcher.js runs standalone)
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envContent = fs.readFileSync(envLocalPath, 'utf8');
    for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            const value = trimmed.substring(eqIdx + 1).trim();
            if (!process.env[key]) { // Don't override existing env vars
                process.env[key] = value;
            }
        }
    }
}

const { runAll: runStartupChecks } = require('./services/startup-checks');

// Initialize usage tracking (auto-starts on require, sends SessionStart + DailyActiveUser)
let usageTracker = null;
try {
    usageTracker = require('./services/usage-tracker');
} catch (e) {
    console.log('[Launcher] Usage tracking not available:', e.message);
}

// Configuration
const IS_WINDOWS = os.platform() === 'win32';
const NEXT_APP_CMD = IS_WINDOWS ? 'npm.cmd' : 'npm';
// Determine Run Mode: 'start' (prod) or 'dev' (default)
const RUN_MODE = process.argv.includes('--production') ? 'start' : 'dev';

const BACKGROUND_AGENT_SCRIPT = IS_WINDOWS
    ? path.join(__dirname, 'services', 'background-agent-windows.js')
    : path.join(__dirname, 'services', 'background-agent.js');

// Data files for first-run detection
const DATA_DIR = path.join(__dirname, 'data');
const EMAILS_FILE = path.join(DATA_DIR, 'emails.json');
const CALENDAR_FILE = path.join(DATA_DIR, 'calendar.json');
const SYNC_SCRIPT = path.join(__dirname, 'scripts', 'sync-local-data.mjs');

// Logging Setup
const LOG_FILE = path.join(__dirname, 'smartai.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(prefix, data) {
    const timestamp = new Date().toISOString();
    const message = data.toString().trim();
    if (!message) return;

    // Console (Colorized if possible, simple here)
    console.log(`[${prefix}] ${message}`);

    // File (Strip ANSI codes if we wanted to be fancy, but raw is fine for now)
    logStream.write(`[${timestamp}] [${prefix}] ${message}\n`);
}

console.log(`[Launcher] Detected Platform: ${os.platform()}`);
console.log(`[Launcher] Starting InGen SmartAI in ${RUN_MODE} mode...`);
console.log(`[Launcher] Logging to: ${LOG_FILE}`);

// ─── First-Run Detection ───

function isFirstRun() {
    // On Windows, the installer already extracts Outlook data into outlook-cache.db
    // via the Python extractor. Skip first-run sync if that DB exists.
    if (IS_WINDOWS) {
        const outlookCacheDb = path.join(DATA_DIR, 'outlook-cache.db');
        if (fs.existsSync(outlookCacheDb)) {
            console.log('[Launcher] Windows: outlook-cache.db found (installer already extracted data) — skipping first-run sync');
            return false;
        }
    }

    // First run if data directory or either core data file is missing
    if (!fs.existsSync(DATA_DIR)) return true;
    if (!fs.existsSync(EMAILS_FILE)) return true;
    if (!fs.existsSync(CALENDAR_FILE)) return true;

    // Also treat as first run if files exist but are empty/invalid
    try {
        const emails = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf8'));
        const calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
        if (!emails.data || !Array.isArray(emails.data) || emails.data.length === 0) return true;
        if (!calendar.data || !Array.isArray(calendar.data) || calendar.data.length === 0) return true;
    } catch (e) {
        return true; // Corrupted files — treat as first run
    }

    return false;
}

function runFirstRunSync() {
    console.log('');
    console.log('[Launcher] 🆕 First run detected — caching your Outlook data before launch...');
    console.log('[Launcher] This may take 30-60 seconds. Please ensure Microsoft Outlook is open.');
    console.log('');

    try {
        execSync(`node "${SYNC_SCRIPT}"`, {
            cwd: __dirname,
            timeout: 300000, // 5 minute timeout
            maxBuffer: 10 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'inherit'] // stderr shows progress, stdout captured for result
        });

        // Read back the cached data to report counts
        let emailCount = 0;
        let calendarCount = 0;
        try {
            if (fs.existsSync(EMAILS_FILE)) {
                const emails = JSON.parse(fs.readFileSync(EMAILS_FILE, 'utf8'));
                emailCount = emails.count || 0;
            }
            if (fs.existsSync(CALENDAR_FILE)) {
                const calendar = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8'));
                calendarCount = calendar.count || 0;
            }
        } catch (e) { /* ignore read errors */ }

        console.log('');
        console.log(`[Launcher] ✅ Initial data cached: ${emailCount} emails, ${calendarCount} calendar events`);
        console.log('[Launcher] 🚀 Launching dashboard — open http://localhost:3000');
        console.log('');

        return true;
    } catch (error) {
        console.error('');
        console.error(`[Launcher] ⚠️  First-run data sync encountered an issue: ${error.message}`);
        console.error('[Launcher] Launching anyway — data will sync in the background.');
        console.error('');
        return false;
    }
}

// Run startup checks before launching
console.log('[Launcher] Running startup checks...');
runStartupChecks().then((report) => {
    report.print();

    if (report.hasCriticalFailure) {
        console.log('[Launcher] ⚠️  Critical issues detected above. Starting anyway — some features may not work.\n');
    }

    // Check if hnswlib-node specifically failed — provide targeted guidance
    const hnswlibResult = report.results.find(r => r.name.includes('hnswlib-node'));
    if (hnswlibResult && !hnswlibResult.ok) {
        console.log('[Launcher] 📋 Vector search (email RAG) is disabled due to missing hnswlib-node native addon.');
        if (IS_WINDOWS) {
            console.log('[Launcher]    To enable it:');
            console.log('[Launcher]    1. Install Visual Studio Build Tools 2022: https://visualstudio.microsoft.com/visual-cpp-build-tools/');
            console.log('[Launcher]       (Select "Desktop development with C++" workload)');
            console.log('[Launcher]    2. Then run: npm rebuild hnswlib-node');
            console.log('[Launcher]    3. Restart the app');
        } else {
            console.log('[Launcher]    To enable it: npm rebuild hnswlib-node');
        }
        console.log('[Launcher]    The app will work without it — AI features just won\'t search past emails.\n');
    } else if (hnswlibResult && hnswlibResult.ok && hnswlibResult.name.includes('auto-rebuilt')) {
        console.log('[Launcher] ✨ hnswlib-node was auto-rebuilt successfully! Vector search is now enabled.\n');
    }

    // First-run: cache data before starting the app so dashboard has data immediately
    if (isFirstRun()) {
        runFirstRunSync();
    }

    // 1. Start Next.js App
    console.log(`[Launcher] Spawning App: ${NEXT_APP_CMD} run ${RUN_MODE}`);
    const appProcess = spawn(NEXT_APP_CMD, ['run', RUN_MODE], {
        cwd: __dirname,
        stdio: 'pipe', // Capture output
        shell: true,
        env: { ...process.env, TURBOPACK: '0' } // Force Webpack to avoid Windows junction errors with ollama
    });

    appProcess.stdout.on('data', (data) => log('App', data));
    appProcess.stderr.on('data', (data) => log('App Error', data));

    appProcess.on('error', (err) => {
        console.error('[Launcher] Failed to start Next.js app:', err);
        logStream.write(`[Launcher Error] Failed to start app: ${err.message}\n`);
    });

    // 2. Start Background Agent
    console.log(`[Launcher] Starting Background Agent: ${BACKGROUND_AGENT_SCRIPT}`);
    const agentProcess = spawn('node', [BACKGROUND_AGENT_SCRIPT], {
        cwd: __dirname,
        stdio: 'pipe' // Capture output
    });

    agentProcess.stdout.on('data', (data) => log('Agent', data));
    agentProcess.stderr.on('data', (data) => log('Agent Error', data));

    agentProcess.on('error', (err) => {
        console.error('[Launcher] Failed to start Background Agent:', err);
        logStream.write(`[Launcher Error] Failed to start agent: ${err.message}\n`);
    });

    // 3. Handle Exit
    const cleanup = () => {
        console.log('\n[Launcher] Shutting down...');
        logStream.write(`[Launcher] Shutting down at ${new Date().toISOString()}\n`);

        // Flush usage metrics before exit
        if (usageTracker) {
            try { usageTracker.stop(); } catch (e) { /* silent */ }
        }

        logStream.end();

        if (appProcess) {
            appProcess.kill();
        }
        if (agentProcess) {
            agentProcess.kill();
        }

        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', () => {
        // catch all
        if (appProcess && !appProcess.killed) appProcess.kill();
        if (agentProcess && !agentProcess.killed) agentProcess.kill();
    });
}).catch(err => {
    console.error('[Launcher] Startup checks failed unexpectedly:', err);
    process.exit(1);
});
