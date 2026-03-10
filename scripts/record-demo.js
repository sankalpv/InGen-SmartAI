#!/usr/bin/env node

/**
 * 🎬 InGen Demo Recorder
 * 
 * Automated demo recording with ElevenLabs voiceover + Playwright browser automation.
 * 
 * Usage:
 *   node scripts/record-demo.js                # Full pipeline: audio + record + merge
 *   node scripts/record-demo.js --audio-only   # Generate voiceover audio only
 *   node scripts/record-demo.js --record       # Record screen only (uses existing audio)
 *   node scripts/record-demo.js --merge        # Merge existing video + audio only
 * 
 * Prerequisites:
 *   - npm run dev (app running at localhost:3000)
 *   - ELEVENLABS_API_KEY in .env.local
 *   - npx playwright install chromium (one-time)
 *   - ffmpeg installed (brew install ffmpeg)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const AUDIO_DIR = path.join(__dirname, 'demo-audio');
const OUTPUT_DIR = path.join(__dirname, 'demo-output');

// Load .env.local
function loadEnv() {
    const envPath = path.join(ROOT, '.env.local');
    if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim();
                    if (!process.env[key]) process.env[key] = val;
                }
            }
        }
    }
}
loadEnv();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// ElevenLabs voice IDs — "Josh" is professional male, good for keynote
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — clear, professional
const MODEL_ID = 'eleven_multilingual_v2';

const APP_URL = 'http://localhost:3000';

// ═══════════════════════════════════════════════════════════════
// DEMO SCRIPT — Voiceover text + browser actions per Act
// ═══════════════════════════════════════════════════════════════

const DEMO_ACTS = [
    {
        id: 'act1',
        title: 'The Hook',
        targetDuration: 35,
        voiceover: `You open your laptop on Monday morning. 87 emails. 11 meetings. 3 escalations buried somewhere in there. A WBR doc someone updated over the weekend. And a 1 on 1 with your skip in 45 minutes that you haven't prepped for. Sound familiar? Every manager at Amazon has the same 8 hours. The question is — what if you had an AI chief of staff that read everything before you even opened your laptop? This is InGen.`,
        actions: async (page, duration) => {
            // Dashboard should already be loaded — hover over stat cards
            await page.waitForSelector('.stats-bar', { timeout: 30000 });
            await smoothPause(duration * 0.3);
            // Hover stat cards
            const statCards = await page.$$('.stat-card');
            for (const card of statCards) {
                await card.hover();
                await smoothPause(1500);
            }
            await smoothPause(duration * 0.3);
        }
    },
    {
        id: 'act2',
        title: 'AI Daily Briefing',
        targetDuration: 55,
        voiceover: `The moment you land on InGen, three numbers tell you your day: emails received, urgent items, and meetings. But the real power is up here. This is your AI Daily Briefing. Every morning, InGen's local AI engine — running entirely on your MacBook — analyzes your emails, your calendar, and even the Quip documents linked inside those emails. It pulls out what matters. The escalation that needs your attention by noon. The doc review your PM is waiting on. The 1 on 1 where your direct report flagged a blocker last Thursday. These aren't generic summaries. These are prioritized, context-aware action items — generated from YOUR data. And notice the linked documents section — InGen automatically fetched and summarized Quip docs that were referenced in your emails. And here's what makes this different: this briefing streams in word by word — like ChatGPT — the first time. After that, it's cached. Instant. Under three seconds.`,
        actions: async (page, duration) => {
            // Point to briefing section
            const briefing = await page.$('.ai-briefing');
            if (briefing) {
                await briefing.hover();
                await smoothPause(duration * 0.2);
                await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
                await smoothPause(duration * 0.3);
            }
            // Hover priority badges if visible
            const priorities = await page.$$('.priority-item');
            for (const p of priorities.slice(0, 3)) {
                await p.hover();
                await smoothPause(1500);
            }
            await smoothPause(duration * 0.2);
        }
    },
    {
        id: 'act3',
        title: 'Email Triage + AI Draft',
        targetDuration: 45,
        voiceover: `Now let's look at email. InGen doesn't just show you a list — it triages for you. Three lanes. Red — respond now, these are urgent. Yellow — respond today. And green — FYI, collapsed by default, because you don't need the noise. You can filter by time range — today, three days, seven days, fourteen, thirty — and it paginates automatically. Let me expand one of these. Now watch this — One click. InGen generates a draft reply using Retrieval Augmented Generation. It searched through two hundred of my past sent emails to match my writing style, pulled context from the thread, and wrote a response I can send — or tweak — in seconds. That's not a template. That's AI that knows how I write.`,
        actions: async (page, duration) => {
            // Scroll to email section
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
            await smoothPause(2000);
            
            // Click Email Triage tab if not active
            const emailTab = await page.$('.section-tab');
            if (emailTab) await emailTab.click();
            await smoothPause(2000);

            // Hover over priority lanes
            await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
            await smoothPause(duration * 0.2);

            // Try to click first email card to expand it
            const emailCards = await page.$$('.email-card');
            if (emailCards.length > 0) {
                await emailCards[0].click();
                await smoothPause(3000);
                
                // Try to click Draft Reply button
                const draftBtn = await page.$('button:has-text("Draft"), button:has-text("draft"), button:has-text("Reply")');
                if (draftBtn) {
                    await draftBtn.click();
                    await smoothPause(5000);
                }
            }
            await smoothPause(duration * 0.2);
        }
    },
    {
        id: 'act4',
        title: 'Dive Deep Chat',
        targetDuration: 30,
        voiceover: `But what if you don't want a summary — you want a specific answer? InGen has a conversational AI chat — backed by vector search over all your emails and calendar data. Ask it anything. Look at that — it found the relevant email threads, cross-referenced my calendar, and gave me a sourced answer. This is like having a personal Kendra — except it's private, local, and it's searching YOUR data, not a shared index.`,
        actions: async (page, duration) => {
            // Scroll to chat section
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
            await smoothPause(2000);
            
            // Type in chat input
            const chatInput = await page.$('input[placeholder*="Ask"], textarea[placeholder*="Ask"], input[type="text"]');
            if (chatInput) {
                await chatInput.click();
                await smoothPause(500);
                await page.keyboard.type('What did I discuss with the team about the launch timeline last week?', { delay: 40 });
                await smoothPause(1000);
                await page.keyboard.press('Enter');
                await smoothPause(duration * 0.5);
            } else {
                await smoothPause(duration * 0.6);
            }
        }
    },
    {
        id: 'act5',
        title: 'Week Ahead',
        targetDuration: 30,
        voiceover: `Let's zoom out from today to the whole week. Week Ahead gives you a day-by-day breakdown of your next seven days. Each day shows your meeting count, your meeting load level — light, balanced, moderate, heavy — and it automatically identifies deep work slots. See this? InGen found a ninety-minute gap on Wednesday — that's your protected deep work window. And it flagged your 1 on 1s so you can prep for those specifically. And down here — the AI Weekly Coach. This is a personalized coaching brief generated by AI that references your actual meeting names. This is the brief I wish someone handed me every Sunday night.`,
        actions: async (page, duration) => {
            // Navigate to Week Ahead
            const weekLink = await page.$('a[href="/week-ahead"], nav a:has-text("Week"), [data-page="week-ahead"]');
            if (weekLink) {
                await weekLink.click();
            } else {
                await page.goto(`${APP_URL}/week-ahead`, { waitUntil: 'networkidle' });
            }
            await smoothPause(3000);
            await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
            await smoothPause(duration * 0.3);
            await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
            await smoothPause(duration * 0.3);
        }
    },
    {
        id: 'act6',
        title: 'Leadership Analytics',
        targetDuration: 35,
        voiceover: `Now — Leadership Analytics. This is where InGen becomes an operating system for managers. Time Audit — how many hours in meetings versus deep work? What's the breakdown by meeting type — 1 on 1s, small groups, large meetings, all-hands? InGen gives you the balance assessment with full transparency. Relationship Health — every key contact scored from zero to one hundred based on communication patterns. Green means healthy. Red means neglected. It pulls your direct reports from Phonetool automatically. This one's flagged At Risk — I haven't had meaningful communication in twelve days. That's the kind of signal that prevents surprises in Forte.`,
        actions: async (page, duration) => {
            // Navigate to Leadership
            const leaderLink = await page.$('a[href="/leadership"], nav a:has-text("Leader"), [data-page="leadership"]');
            if (leaderLink) {
                await leaderLink.click();
            } else {
                await page.goto(`${APP_URL}/leadership`, { waitUntil: 'networkidle' });
            }
            await smoothPause(3000);
            // Scroll through Time Audit
            await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
            await smoothPause(duration * 0.25);
            // Scroll to Relationship Health
            await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
            await smoothPause(duration * 0.25);
            // Scroll past action items
            await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
            await smoothPause(duration * 0.2);
        }
    },
    {
        id: 'act7',
        title: 'Team Health & Engineering Metrics',
        targetDuration: 45,
        voiceover: `Team Health — your WBR goals, always up to date. InGen pulls goals directly from Taskei, parses the status, and gives you this at-a-glance board. Green, yellow, red — with an AI-generated health summary at the top. But here's the powerful part — ECD tracking. InGen snapshots your estimated completion dates weekly and detects drift. It knows when a date slipped, by how many days, and flags upcoming ECDs within a three-day window. No more spreadsheet archaeology. Code Metrics — this is the engineering velocity dashboard. Per-engineer code review activity pulled from code dot amazon dot com. CRs created, CRs reviewed, review ratios. These mini sparklines show eight-week trends at a glance. And Ticket Health — your resolver groups at a glance. Open tickets, aging breakdown, SLA status. The operational hygiene dashboard every SDM needs.`,
        actions: async (page, duration) => {
            // Navigate to Team Health / My Team
            const teamLink = await page.$('a[href="/my-team"], nav a:has-text("Team"), [data-page="my-team"]');
            if (teamLink) {
                await teamLink.click();
            } else {
                await page.goto(`${APP_URL}/my-team`, { waitUntil: 'networkidle' });
            }
            await smoothPause(3000);
            await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
            await smoothPause(duration * 0.15);

            // Navigate to Code Metrics
            const codeLink = await page.$('a[href="/eng-metrics"], nav a:has-text("Code"), nav a:has-text("Eng"), [data-page="eng-metrics"]');
            if (codeLink) {
                await codeLink.click();
            } else {
                await page.goto(`${APP_URL}/eng-metrics`, { waitUntil: 'networkidle' });
            }
            await smoothPause(3000);
            await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
            await smoothPause(duration * 0.15);

            // Navigate to Ticket Health
            const ticketLink = await page.$('a[href="/ticket-health"], nav a:has-text("Ticket"), [data-page="ticket-health"]');
            if (ticketLink) {
                await ticketLink.click();
            } else {
                await page.goto(`${APP_URL}/ticket-health`, { waitUntil: 'networkidle' });
            }
            await smoothPause(3000);
            await smoothPause(duration * 0.1);
        }
    },
    {
        id: 'act8',
        title: 'The Close',
        targetDuration: 25,
        voiceover: `Oh — and it looks good doing it. Dark mode, light mode, liquid glass UI. Collapsible sidebar for when you need the real estate. But let me leave you with the most important thing. InGen runs one hundred percent on your MacBook. No cloud APIs. No data exfiltration. No accounts. No subscriptions. Your emails, your calendar, your AI — they never leave your machine. Installation is one command. Takes about ten minutes. And from that point on, you have an AI chief of staff that reads everything, triages your inbox, preps your meetings, tracks your goals, and monitors your team's engineering health — all before your first sip of coffee. This is InGen. Built by managers, for managers. Try it this week.`,
        actions: async (page, duration) => {
            // Go back to dashboard
            await page.goto(APP_URL, { waitUntil: 'networkidle' });
            await smoothPause(2000);

            // Toggle theme if there's a theme button
            const themeBtn = await page.$('button:has-text("theme"), button[aria-label*="theme"], .theme-toggle, [data-theme-toggle]');
            if (themeBtn) {
                await themeBtn.click();
                await smoothPause(2000);
                await themeBtn.click();
                await smoothPause(2000);
            }

            // Collapse sidebar
            const collapseBtn = await page.$('button:has-text("collapse"), .sidebar-toggle, [data-sidebar-toggle]');
            if (collapseBtn) {
                await collapseBtn.click();
                await smoothPause(2000);
                await collapseBtn.click();
                await smoothPause(2000);
            }

            // Final hero shot
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
            await smoothPause(duration * 0.3);
        }
    }
];

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function smoothPause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(emoji, msg) {
    console.log(`${emoji}  ${msg}`);
}

// ═══════════════════════════════════════════════════════════════
// PHASE 1: ElevenLabs Audio Generation
// ═══════════════════════════════════════════════════════════════

async function generateAudio() {
    if (!ELEVENLABS_API_KEY) {
        log('❌', 'ELEVENLABS_API_KEY not found in .env.local');
        process.exit(1);
    }

    fs.mkdirSync(AUDIO_DIR, { recursive: true });

    log('🎙️', 'Generating voiceover audio via ElevenLabs...');
    const durations = {};

    for (const act of DEMO_ACTS) {
        const outFile = path.join(AUDIO_DIR, `${act.id}.mp3`);
        
        // Skip if already generated (use --force to regenerate)
        if (fs.existsSync(outFile) && !process.argv.includes('--force')) {
            log('⏭️', `${act.id} audio exists, skipping (use --force to regenerate)`);
            durations[act.id] = getAudioDuration(outFile);
            continue;
        }

        log('🔊', `Generating ${act.id}: "${act.title}" (${act.voiceover.length} chars)...`);

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: act.voiceover,
                model_id: MODEL_ID,
                voice_settings: {
                    stability: 0.6,
                    similarity_boost: 0.8,
                    style: 0.3,
                    use_speaker_boost: true,
                }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            log('❌', `ElevenLabs API error for ${act.id}: ${response.status} — ${errText}`);
            process.exit(1);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(outFile, buffer);
        
        durations[act.id] = getAudioDuration(outFile);
        log('✅', `${act.id}.mp3 generated (${durations[act.id].toFixed(1)}s)`);
        
        // Rate limit: small delay between API calls
        await smoothPause(500);
    }

    // Concatenate all audio files
    log('🔗', 'Concatenating audio files...');
    const listFile = path.join(AUDIO_DIR, 'concat-list.txt');
    const listContent = DEMO_ACTS.map(a => `file '${a.id}.mp3'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const fullAudio = path.join(AUDIO_DIR, 'full-voiceover.mp3');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${fullAudio}"`, { stdio: 'pipe' });
    
    const totalDuration = getAudioDuration(fullAudio);
    log('✅', `Full voiceover: ${totalDuration.toFixed(1)}s — ${fullAudio}`);

    return durations;
}

function getAudioDuration(filePath) {
    try {
        const result = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
            { encoding: 'utf-8' }
        ).trim();
        return parseFloat(result);
    } catch {
        return 30; // fallback
    }
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2: Playwright Browser Automation + Screen Recording
// ═══════════════════════════════════════════════════════════════

async function recordDemo(durations) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // If no durations provided, try to read from existing audio
    if (!durations) {
        durations = {};
        for (const act of DEMO_ACTS) {
            const audioFile = path.join(AUDIO_DIR, `${act.id}.mp3`);
            if (fs.existsSync(audioFile)) {
                durations[act.id] = getAudioDuration(audioFile);
            } else {
                durations[act.id] = act.targetDuration;
            }
        }
    }

    log('🎬', 'Launching browser...');

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--start-maximized',
            '--disable-infobars',
            '--hide-scrollbars',
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        recordVideo: {
            dir: OUTPUT_DIR,
            size: { width: 1920, height: 1080 }
        },
        colorScheme: 'dark',
    });

    const page = await context.newPage();

    // Navigate to the app
    log('🌐', `Navigating to ${APP_URL}...`);
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Wait for dashboard to load
    await page.waitForSelector('.stats-bar, .loading-spinner', { timeout: 30000 });
    // If still loading, wait for it to finish
    try {
        await page.waitForSelector('.stats-bar', { timeout: 30000 });
    } catch {
        log('⚠️', 'Dashboard may not have fully loaded, continuing anyway...');
    }
    
    await smoothPause(2000); // Let animations settle

    // Also play audio if available
    const fullAudio = path.join(AUDIO_DIR, 'full-voiceover.mp3');
    let audioProcess = null;
    if (fs.existsSync(fullAudio)) {
        log('🔊', 'Playing voiceover audio...');
        audioProcess = spawn('afplay', [fullAudio], { stdio: 'ignore' });
    }

    // Execute each act
    for (const act of DEMO_ACTS) {
        const actDuration = (durations[act.id] || act.targetDuration) * 1000; // convert to ms
        log('🎬', `Act: ${act.title} (${(actDuration / 1000).toFixed(1)}s)...`);
        
        const startTime = Date.now();
        
        try {
            await act.actions(page, actDuration);
        } catch (err) {
            log('⚠️', `Action error in ${act.id}: ${err.message} — continuing...`);
        }
        
        // Ensure we fill the full duration for this act
        const elapsed = Date.now() - startTime;
        const remaining = actDuration - elapsed;
        if (remaining > 0) {
            await smoothPause(remaining);
        }
    }

    log('✅', 'All acts completed!');
    
    // Stop audio if still playing
    if (audioProcess) {
        audioProcess.kill();
    }

    // Close and save video
    await page.close();
    await context.close();
    await browser.close();

    // Find the recorded video file
    const videoFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm'));
    if (videoFiles.length === 0) {
        log('❌', 'No video file found!');
        return null;
    }

    // Use the most recent webm file
    const latestVideo = videoFiles
        .map(f => ({ name: f, time: fs.statSync(path.join(OUTPUT_DIR, f)).mtime }))
        .sort((a, b) => b.time - a.time)[0].name;

    const videoPath = path.join(OUTPUT_DIR, latestVideo);
    log('✅', `Screen recording saved: ${videoPath}`);
    return videoPath;
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3: Merge Video + Audio with ffmpeg
// ═══════════════════════════════════════════════════════════════

async function mergeVideoAudio(videoPath) {
    const audioPath = path.join(AUDIO_DIR, 'full-voiceover.mp3');
    const outputPath = path.join(OUTPUT_DIR, 'demo-final.mp4');

    if (!videoPath) {
        // Find latest webm
        const videoFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webm'));
        if (videoFiles.length === 0) {
            log('❌', 'No video file found to merge!');
            return;
        }
        videoPath = path.join(OUTPUT_DIR, videoFiles.sort().pop());
    }

    if (!fs.existsSync(audioPath)) {
        log('⚠️', 'No audio file found — saving video without voiceover');
        execSync(`ffmpeg -y -i "${videoPath}" -c:v libx264 -preset fast -crf 22 "${outputPath}"`, { stdio: 'pipe' });
    } else {
        log('🔗', 'Merging video + audio...');
        execSync(
            `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k -shortest "${outputPath}"`,
            { stdio: 'pipe' }
        );
    }

    const sizeBytes = fs.statSync(outputPath).size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);
    log('🎉', `Final demo video: ${outputPath} (${sizeMB} MB)`);
    return outputPath;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
    const args = process.argv.slice(2);
    const audioOnly = args.includes('--audio-only');
    const recordOnly = args.includes('--record');
    const mergeOnly = args.includes('--merge');

    console.log('');
    console.log('  🎬  InGen Demo Recorder');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Check prerequisites
    try {
        execSync('which ffmpeg', { stdio: 'pipe' });
    } catch {
        log('❌', 'ffmpeg not found! Install with: brew install ffmpeg');
        process.exit(1);
    }

    if (!mergeOnly) {
        try {
            // Check if playwright chromium is available
            const testBrowser = await chromium.launch({ headless: true });
            await testBrowser.close();
        } catch (err) {
            log('❌', `Playwright chromium not installed. Run: npx playwright install chromium`);
            log('', `  Error: ${err.message}`);
            process.exit(1);
        }
    }

    let durations = null;

    // PHASE 1: Generate audio
    if (!recordOnly && !mergeOnly) {
        durations = await generateAudio();
    }

    if (audioOnly) {
        log('🎉', 'Audio generation complete!');
        return;
    }

    // PHASE 2: Record screen
    let videoPath = null;
    if (!mergeOnly) {
        videoPath = await recordDemo(durations);
    }

    // PHASE 3: Merge
    if (!recordOnly || mergeOnly) {
        await mergeVideoAudio(videoPath);
    }

    console.log('');
    console.log('  ✅  Demo recording complete!');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  📁  Output: scripts/demo-output/demo-final.mp4`);
    console.log(`  🎙️  Audio:  scripts/demo-audio/`);
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
