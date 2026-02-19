/**
 * SmartAI Startup Checks
 * 
 * Validates all environment assumptions before the app starts.
 * Run via: node -e "require('./services/startup-checks').runAll().then(r => r.print())"
 * Or integrated into launcher.js.
 */

const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const IS_WINDOWS = os.platform() === 'win32';
const IS_MAC = os.platform() === 'darwin';

// ANSI colors
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function execCmd(cmd) {
    return new Promise((resolve) => {
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            resolve({ ok: !err, stdout: stdout?.trim() || '' });
        });
    });
}

async function checkOllamaReachable() {
    try {
        const res = await fetch('http://127.0.0.1:11434', { signal: AbortSignal.timeout(3000) });
        return { ok: res.ok || res.status < 500 };
    } catch {
        return { ok: false };
    }
}

async function checkOllamaModels(requiredModels) {
    try {
        const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return requiredModels.map(m => ({ model: m, ok: false }));
        const data = await res.json();
        const installed = (data.models || []).map(m => m.name.split(':')[0]);
        return requiredModels.map(m => ({ model: m, ok: installed.includes(m) }));
    } catch {
        return requiredModels.map(m => ({ model: m, ok: false }));
    }
}

async function checkCommand(cmd) {
    const result = await execCmd(IS_WINDOWS ? `where ${cmd}` : `which ${cmd}`);
    return result.ok;
}

async function checkHnswlib() {
    try {
        require('hnswlib-node');
        return true;
    } catch {
        return false;
    }
}

function checkEnvVars(vars) {
    return vars.map(v => ({ name: v, ok: !!process.env[v] }));
}

function checkSettingsJson() {
    const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
    try {
        if (!fs.existsSync(settingsPath)) return { ok: false, reason: 'File not found' };
        JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

function checkPromptsJson() {
    const promptsPath = path.join(process.cwd(), 'config', 'prompts.json');
    try {
        if (!fs.existsSync(promptsPath)) return { ok: false, reason: 'File not found' };
        JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

async function runAll() {
    const results = [];

    // 1. Ollama reachable
    const ollamaReachable = await checkOllamaReachable();
    results.push({
        name: 'Ollama service reachable',
        severity: 'critical',
        ok: ollamaReachable.ok,
        fix: 'Install and start Ollama from https://ollama.com',
    });

    // 2. Ollama models
    const aiProvider = process.env.AI_PROVIDER || 'openai';
    if (aiProvider === 'ollama') {
        const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
        const modelChecks = await checkOllamaModels([ollamaModel, 'nomic-embed-text']);
        for (const mc of modelChecks) {
            results.push({
                name: `Ollama model: ${mc.model}`,
                severity: mc.model === ollamaModel ? 'critical' : 'warning',
                ok: mc.ok,
                fix: `Run: ollama pull ${mc.model}`,
            });
        }
    }

    // 3. osascript (Mac email fetching)
    if (IS_MAC) {
        const hasOsascript = await checkCommand('osascript');
        results.push({
            name: 'osascript available (Mac email/calendar)',
            severity: 'warning',
            ok: hasOsascript,
            fix: 'osascript is built into macOS. This is unexpected — check your PATH.',
        });
    }

    // 4. PowerShell (Windows email fetching)
    if (IS_WINDOWS) {
        const hasPowershell = await checkCommand('powershell');
        results.push({
            name: 'PowerShell available (Windows email/calendar)',
            severity: 'warning',
            ok: hasPowershell,
            fix: 'Install PowerShell from https://aka.ms/powershell',
        });
    }

    // 5. Required env vars
    const envChecks = checkEnvVars(['NEXTAUTH_SECRET', 'AUTH_SECRET']);
    for (const ec of envChecks) {
        results.push({
            name: `Env var: ${ec.name}`,
            severity: 'critical',
            ok: ec.ok,
            fix: `Add ${ec.name}=<value> to your .env.local file. Generate with: openssl rand -base64 32`,
        });
    }

    // 6. hnswlib-node
    const hasHnswlib = await checkHnswlib();
    results.push({
        name: 'hnswlib-node native module',
        severity: 'warning',
        ok: hasHnswlib,
        fix: 'Run: npm install  (may require build tools)',
    });

    // 7. settings.json
    const settingsCheck = checkSettingsJson();
    results.push({
        name: 'config/settings.json valid',
        severity: 'warning',
        ok: settingsCheck.ok,
        fix: settingsCheck.reason || 'Delete config/settings.json and restart to regenerate.',
    });

    // 8. prompts.json
    const promptsCheck = checkPromptsJson();
    results.push({
        name: 'config/prompts.json valid',
        severity: 'warning',
        ok: promptsCheck.ok,
        fix: promptsCheck.reason || 'Restore config/prompts.json from source control.',
    });

    return {
        results,
        hasCriticalFailure: results.some(r => !r.ok && r.severity === 'critical'),
        print() {
            console.log(`\n${BOLD}╔══════════════════════════════════════════╗${RESET}`);
            console.log(`${BOLD}║        SmartAI Startup Checks            ║${RESET}`);
            console.log(`${BOLD}╚══════════════════════════════════════════╝${RESET}\n`);

            for (const r of results) {
                const icon = r.ok ? `${GREEN}✅${RESET}` : (r.severity === 'critical' ? `${RED}❌${RESET}` : `${YELLOW}⚠️ ${RESET}`);
                console.log(`  ${icon}  ${r.name}`);
                if (!r.ok) {
                    console.log(`       ${YELLOW}→ Fix: ${r.fix}${RESET}`);
                }
            }

            const passed = results.filter(r => r.ok).length;
            const total = results.length;
            const color = this.hasCriticalFailure ? RED : (passed === total ? GREEN : YELLOW);
            console.log(`\n  ${color}${BOLD}${passed}/${total} checks passed${RESET}\n`);

            if (this.hasCriticalFailure) {
                console.log(`  ${RED}${BOLD}⚠️  Critical issues detected. Some features may not work.${RESET}\n`);
            }
        }
    };
}

module.exports = { runAll };
