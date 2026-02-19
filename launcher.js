const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { runAll: runStartupChecks } = require('./services/startup-checks');

// Configuration
const IS_WINDOWS = os.platform() === 'win32';
const NEXT_APP_CMD = IS_WINDOWS ? 'npm.cmd' : 'npm';
// Determine Run Mode: 'start' (prod) or 'dev' (default)
const RUN_MODE = process.argv.includes('--production') ? 'start' : 'dev';

const BACKGROUND_AGENT_SCRIPT = IS_WINDOWS
    ? path.join(__dirname, 'services', 'background-agent-windows.js')
    : path.join(__dirname, 'services', 'background-agent.js');

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

// Run startup checks before launching
console.log('[Launcher] Running startup checks...');
runStartupChecks().then((report) => {
    report.print();

    if (report.hasCriticalFailure) {
        console.log('[Launcher] ⚠️  Critical issues detected above. Starting anyway — some features may not work.\n');
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
