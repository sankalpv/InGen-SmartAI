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
        return { ok: true };
    } catch (e) {
        const errorMsg = e.message || '';
        
        // Determine if it's a missing native addon vs missing package entirely
        const isBindingError = errorMsg.includes('Could not locate the bindings file') || 
                               errorMsg.includes('addon.node') ||
                               errorMsg.includes('MODULE_NOT_FOUND') && errorMsg.includes('bindings');
        const isNotInstalled = errorMsg.includes("Cannot find module 'hnswlib-node'");
        
        if (isBindingError) {
            // Package exists but native addon not compiled — try auto-rebuild
            console.log('  ⏳ hnswlib-node native addon missing, attempting rebuild...');
            const rebuildResult = await attemptHnswlibRebuild();
            if (rebuildResult.ok) {
                // Verify it actually works now
                try {
                    // Clear require cache and retry
                    delete require.cache[require.resolve('hnswlib-node')];
                    require('hnswlib-node');
                    return { ok: true, rebuilt: true };
                } catch {
                    return { ok: false, reason: 'rebuild-failed', detail: 'Rebuild completed but module still fails to load' };
                }
            }
            return { ok: false, reason: 'rebuild-failed', detail: rebuildResult.detail };
        }
        
        if (isNotInstalled) {
            return { ok: false, reason: 'not-installed', detail: 'Package not in node_modules' };
        }
        
        return { ok: false, reason: 'unknown', detail: errorMsg };
    }
}

async function attemptHnswlibRebuild() {
    return new Promise((resolve) => {
        exec('npm rebuild hnswlib-node', { 
            timeout: 120000, // 2 minutes
            cwd: process.cwd(),
            maxBuffer: 5 * 1024 * 1024
        }, (err, stdout, stderr) => {
            if (err) {
                const combined = (stderr || '') + (stdout || '');
                // Detect common failure reasons
                if (combined.includes('gyp ERR!') && (combined.includes('not find') || combined.includes('cl.exe'))) {
                    resolve({ ok: false, detail: 'C++ build tools not found (Visual Studio Build Tools required)' });
                } else if (combined.includes('gyp ERR!')) {
                    resolve({ ok: false, detail: `node-gyp build error: ${err.message}` });
                } else {
                    resolve({ ok: false, detail: err.message });
                }
            } else {
                resolve({ ok: true });
            }
        });
    });
}

function checkEnvVars(vars) {
    return vars.map(v => ({ name: v, ok: !!process.env[v] }));
}

function checkSettingsJson() {
    const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
    try {
        if (!fs.existsSync(settingsPath)) return { ok: false, reason: 'File not found' };
        let content = fs.readFileSync(settingsPath, 'utf8');
        // Strip UTF-8 BOM if present (common on Windows editors)
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
            // Auto-fix: rewrite without BOM so future reads are clean
            try { fs.writeFileSync(settingsPath, content, 'utf8'); } catch { /* ignore write errors */ }
        }
        JSON.parse(content);
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

    // 1. Ollama reachable (always required on Mac)
    const ollamaReachable = await checkOllamaReachable();
    results.push({
        name: 'Ollama service reachable',
        severity: 'critical',
        ok: ollamaReachable.ok,
        fix: 'Install and start Ollama from https://ollama.com',
    });

    // 2. Ollama models
    const llmModel = (process.env.LLM_MODEL || 'llama3').split(':')[0];
    const embeddingModel = (process.env.EMBEDDING_MODEL || 'qwen3-embedding').split(':')[0];
    const modelChecks = await checkOllamaModels([llmModel, embeddingModel]);
    for (const mc of modelChecks) {
        results.push({
            name: `Ollama model: ${mc.model}`,
            severity: mc.model === embeddingModel ? 'warning' : 'critical',
            ok: mc.ok,
            fix: `Run: ollama pull ${mc.model}`,
        });
    }

    // 3. osascript (Mac email fetching)
    const hasOsascript = await checkCommand('osascript');
    results.push({
        name: 'osascript available (email/calendar)',
        severity: 'warning',
        ok: hasOsascript,
        fix: 'osascript is built into macOS. This is unexpected — check your PATH.',
    });

    // 5. Required env vars
    const envChecks = checkEnvVars([]); // AUTH_SECRET/NEXTAUTH_SECRET removed — not needed for local-only mode
    for (const ec of envChecks) {
        results.push({
            name: `Env var: ${ec.name}`,
            severity: 'critical',
            ok: ec.ok,
            fix: `Add ${ec.name}=<value> to your .env.local file. Generate with: openssl rand -base64 32`,
        });
    }

    // 6. hnswlib-node (with auto-rebuild attempt)
    const hnswlibCheck = await checkHnswlib();
    const hnswlibFix = hnswlibCheck.ok
        ? ''
        : hnswlibCheck.reason === 'rebuild-failed'
            ? IS_WINDOWS
                ? `Native addon build failed: ${hnswlibCheck.detail || 'unknown error'}. Install Visual Studio Build Tools 2022 with "Desktop development with C++" workload, then run: npm rebuild hnswlib-node`
                : `Native addon build failed: ${hnswlibCheck.detail || 'unknown error'}. Install Xcode Command Line Tools (xcode-select --install), then run: npm rebuild hnswlib-node`
            : hnswlibCheck.reason === 'not-installed'
                ? 'Run: npm install'
                : `Run: npm rebuild hnswlib-node (Error: ${hnswlibCheck.detail || 'unknown'})`;
    const hnswlibName = hnswlibCheck.rebuilt
        ? 'hnswlib-node native module (auto-rebuilt ✨)'
        : 'hnswlib-node native module';
    results.push({
        name: hnswlibName,
        severity: 'warning',
        ok: hnswlibCheck.ok,
        fix: hnswlibFix,
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

    // 9. MCP server binary paths
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const mcpServers = settings.mcpServers || {};
            for (const [name, config] of Object.entries(mcpServers)) {
                if (config.command) {
                    const exists = fs.existsSync(config.command);
                    results.push({
                        name: `MCP server: ${name}`,
                        severity: 'warning',
                        ok: exists,
                        fix: `Binary not found at ${config.command}. Install via Amazon Toolbox or update path in Settings.`,
                    });
                }
            }
        }
    } catch (e) { /* ignore MCP check errors */ }

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
