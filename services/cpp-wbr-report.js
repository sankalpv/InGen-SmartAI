/**
 * CPP Weekly Business Review Report Service
 * 
 * Generates a structured WBR report using the existing wbr-report.js service
 * which fetches CPP 2026 goals via TaskeiListTasks + TaskeiGetTask.
 * 
 * This service adds:
 * - 11 fixed section ordering per spec (Status Missing → Cut)
 * - Goal type sorting within sections
 * - AI-generated Executive Summary (Wins/Misses/Insights/Discussion)
 * - State file for resume capability
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('CppWbr');
const wbrReport = require('./wbr-report');

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'cpp-wbr-state.json');
const REPORT_FILE = path.join(DATA_DIR, 'cpp-wbr-report.json');

// ─── Section definitions (fixed order per spec) ───
const SECTIONS = [
    { key: 'status_missing', name: 'Status Missing', emoji: '⚠️', order: 1 },
    { key: 'blocked', name: 'Blocked', emoji: '🚫', order: 2 },
    { key: 'in_planning', name: 'In Planning', emoji: '📋', order: 3 },
    { key: 'started', name: 'Started', emoji: '🟢', order: 4 },
    { key: 'paused', name: 'Paused', emoji: '⏸️', order: 5 },
    { key: 'not_started', name: 'Not Started', emoji: '⬜', order: 6 },
    { key: 'dnm', name: 'DNM', emoji: '❌', order: 7 },
    { key: 'completed_late', name: 'Completed Late', emoji: '🕐', order: 8 },
    { key: 'completed', name: 'Completed', emoji: '✅', order: 9 },
    { key: 'cancelled', name: 'Cancelled', emoji: '🚫', order: 10 },
    { key: 'cut', name: 'Cut', emoji: '✂️', order: 11 },
];

// Map wbr-report.js status names to our section keys
const STATUS_TO_SECTION = {
    'Blocked': 'blocked',
    'In Planning': 'in_planning',
    'Started': 'started',
    'Open': 'status_missing',
    'Paused': 'paused',
    'Not Started': 'not_started',
    'DNM': 'dnm',
    'Completed Late': 'completed_late',
    'Completed': 'completed',
    'Cancelled': 'cancelled',
    'Cut': 'cut',
};

// Goal type sort order
const GOAL_TYPE_SORT = {
    '00-STeam': 1, '00-Steam': 1, '02-eLT': 2, '04-VP': 3, '06-Director': 4, '08-2PT': 5,
};

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function todayStr() {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

// ─── State + Report File Management ───

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) { logger.warn('Failed to load state:', e.message); }
    return null;
}

function saveState(state) {
    ensureDataDir();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadReport() {
    try {
        if (fs.existsSync(REPORT_FILE)) return JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
    } catch (e) { logger.warn('Failed to load report:', e.message); }
    return null;
}

function saveReport(report) {
    ensureDataDir();
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
}

// ─── Transform wbr-report goals into CPP WBR format ───

function transformGoal(g) {
    return {
        goalId: g.id,
        title: g.title || 'Untitled',
        ecd: g.ecd || 'Missing',
        color: g.statusColor || 'Missing',
        goalType: g.goalType || 'Missing',
        section: STATUS_TO_SECTION[g.status] || 'status_missing',
        description: g.description || 'Missing',
        pm: g.quad?.pm || 'Missing',
        pmt: g.quad?.pmt || 'Missing',
        tech: g.quad?.tech || 'Missing',
        sdm: g.quad?.sdm || 'Missing',
        pathToGreen: g.pathToGreen || null,
        announcement: g.announcement ? {
            text: g.announcement.text || 'Missing',
            date: g.announcement.date || '',
            author: g.announcement.author || '',
        } : { text: 'Missing', date: '', author: '' },
        hasAnn: !!(g.announcement?.text && g.announcement.text !== 'Missing'),
        subtaskCount: g.subtasks?.length || 0,
    };
}

function buildCppReport(wbrData) {
    const allGoals = [];

    // Collect all goals from wbr-report sections
    for (const section of (wbrData.sections || [])) {
        for (const g of (section.goals || [])) {
            allGoals.push(transformGoal(g));
        }
    }

    // Organize into fixed 11 sections
    const sectionMap = {};
    for (const sec of SECTIONS) sectionMap[sec.key] = [];
    for (const g of allGoals) {
        if (sectionMap[g.section]) sectionMap[g.section].push(g);
        else sectionMap['status_missing'].push(g);
    }

    // Sort within each section by goal type
    for (const key of Object.keys(sectionMap)) {
        sectionMap[key].sort((a, b) => {
            const aSort = GOAL_TYPE_SORT[a.goalType] || 6;
            const bSort = GOAL_TYPE_SORT[b.goalType] || 6;
            return aSort - bSort;
        });
    }

    // Count stats
    const colorCounts = { Green: 0, Yellow: 0, Red: 0, Missing: 0 };
    allGoals.forEach(g => { colorCounts[g.color] = (colorCounts[g.color] || 0) + 1; });

    return {
        title: wbrData.title || 'CPP 2026 Goals and Projects Status',
        subtitle: wbrData.subtitle || '',
        reportDate: todayStr(),
        weekNumber: wbrData.weekNumber,
        generatedAt: new Date().toISOString(),
        executiveSummary: null,
        totalGoals: allGoals.length,
        colorCounts,
        sections: SECTIONS.map(sec => ({
            key: sec.key,
            name: sec.name,
            emoji: sec.emoji,
            goals: sectionMap[sec.key] || [],
        })),
    };
}

// ─── Phase 3.5: Executive Summary ───

async function generateExecSummary(report, onEvent) {
    onEvent({ type: 'phase', phase: 'phase35', message: 'Generating Executive Summary...' });

    const allGoals = [];
    for (const section of report.sections) {
        for (const goal of (section.goals || [])) {
            allGoals.push({
                goalId: goal.goalId,
                title: goal.title,
                color: goal.color,
                section: section.name,
                announcement: goal.announcement?.text || 'Missing',
                pathToGreen: goal.pathToGreen || null,
            });
        }
    }

    const goalContext = allGoals.map(g =>
        `[${g.goalId}] Section: ${g.section} | Status: ${g.color} | Title: ${g.title} | Announcement: ${(g.announcement || 'Missing').substring(0, 300)}${g.pathToGreen ? ` | Path to Green: ${g.pathToGreen.substring(0, 200)}` : ''}`
    ).join('\n');

    const prompt = `You are generating an Executive Summary for a CPP Weekly Business Review report.

Analyze ALL the following goals and their announcements. Generate FOUR sections:

1. 🏆 Key Wins — ONE narrative paragraph (no bullets). Reference goals as [CPP2026Goal-XX](https://issues.amazon.com/issues/CPP2026Goal-XX). Call out goals whose announcements contain progress signals: completed, finalized, closed, launched, shipped, delivered.

2. ⚠️ Misses & Risks — ONE narrative paragraph. Call out: Red status goals, Blocked goals, Status Missing goals, or announcements containing: pending, working towards, identified issues, awaiting, delayed.

3. 💡 Insights — ONE narrative paragraph. Surface cross-announcement patterns: recurring themes, shared milestones, org-wide signals. Use ONLY announcement text.

4. 🗣️ Discussion Topics — ONE narrative paragraph. Flag items needing leadership decision: Red goals needing ECD commitment, blocked goals with external dependencies, open-decision language in announcements.

If a block has no qualifying goals, write: "No [wins/misses/insights/discussion topics] to report this week."

GOAL DATA:
${goalContext}

Generate the Executive Summary in markdown format:`;

    try {
        const bedrockClient = require('./bedrock-client');
        let summary = '';
        if (bedrockClient.isAvailable()) {
            summary = await bedrockClient.generate(prompt, { maxTokens: 4096, temperature: 0.3 });
        } else {
            const ollamaClient = require('./ollama-client');
            summary = await ollamaClient.generate(prompt, { maxTokens: 2000 });
        }
        report.executiveSummary = summary;
    } catch (e) {
        logger.error('Executive summary generation failed:', e.message);
        report.executiveSummary = '## 📌 Executive Summary\n\n*Executive summary generation failed. Please review goals manually.*';
    }

    saveReport(report);
    onEvent({ type: 'exec-summary', summary: report.executiveSummary });
    onEvent({ type: 'phase', phase: 'phase35-done', message: 'Executive Summary generated' });
    return report;
}

// ─── Main Orchestrator ───

async function generateCppWbr(action = 'generate', reportMode = 'standard', onEvent = () => {}) {
    try {
        if (action === 'resume') {
            const existing = loadReport();
            if (existing) {
                onEvent({ type: 'init', weekNumber: existing.weekNumber, reportDate: existing.reportDate, totalGoals: existing.totalGoals, reportMode });
                onEvent({ type: 'phase', phase: 'resume', message: 'Loaded existing report — regenerating Executive Summary' });
                // Re-emit goals for the UI
                for (const sec of existing.sections) {
                    for (const g of (sec.goals || [])) {
                        onEvent({ type: 'goal', goal: g, index: 0, total: existing.totalGoals, section: sec.name });
                    }
                }
                const updated = await generateExecSummary(existing, onEvent);
                onEvent({ type: 'done', totalGoals: updated.totalGoals, generatedAt: updated.generatedAt });
                return updated;
            }
            // No existing report — fall through to generate
        }

        if (action === 'generate' || action === 'regenerate') {
            if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
            if (fs.existsSync(REPORT_FILE)) fs.unlinkSync(REPORT_FILE);
        }

        // Use existing wbr-report.js streaming to fetch all goals
        onEvent({ type: 'phase', phase: 'phase0', message: 'Fetching goals via Taskei...' });

        const forceRefresh = action === 'generate' || action === 'regenerate';
        let wbrData = null;
        let goalCount = 0;

        // Use streaming version so we can emit progress
        await wbrReport.generateWbrReportStreaming((evt) => {
            if (evt.type === 'init') {
                onEvent({ type: 'init', weekNumber: evt.weekNumber, reportDate: todayStr(), totalGoals: evt.totalExpected, reportMode });
            }
            if (evt.type === 'phase') {
                onEvent({ type: 'phase', phase: evt.phase, message: evt.message });
            }
            if (evt.type === 'progress') {
                onEvent({ type: 'progress', message: evt.message, loaded: evt.loaded || evt.goalsFound || 0, total: evt.total });
            }
            if (evt.type === 'goal') {
                goalCount++;
                const transformed = transformGoal(evt.goal);
                onEvent({ type: 'goal', goal: transformed, index: goalCount, total: evt.total, section: STATUS_TO_SECTION[evt.goal.status] || 'status_missing' });
            }
            if (evt.type === 'summary') {
                wbrData = { sections: evt.sections, totalGoals: evt.totalGoals, generatedAt: evt.generatedAt, title: '', subtitle: '', weekNumber: 0 };
            }
            if (evt.type === 'error') {
                onEvent({ type: 'error', message: evt.message });
            }
        }, forceRefresh);

        // If streaming didn't produce summary (e.g., from cache), fetch non-streaming
        if (!wbrData) {
            onEvent({ type: 'phase', phase: 'fetching', message: 'Fetching goals (non-streaming)...' });
            const report = await wbrReport.generateWbrReport(forceRefresh);
            wbrData = report;
        }

        // Build CPP WBR report from wbr-report data
        onEvent({ type: 'phase', phase: 'building', message: 'Organizing into 11 sections...' });
        let report = buildCppReport(wbrData);
        saveReport(report);

        // Save state
        const state = {
            reportWeek: report.weekNumber,
            reportDate: report.reportDate,
            state: 'IN_PROGRESS',
            reportMode,
            totalGoals: report.totalGoals,
        };
        saveState(state);

        // Emit section completions
        for (const sec of report.sections) {
            onEvent({ type: 'section-done', section: sec.name, emoji: sec.emoji, count: sec.goals.length });
        }

        // Generate Executive Summary
        report = await generateExecSummary(report, onEvent);

        // Finalize
        state.state = 'COMPLETE';
        saveState(state);

        onEvent({ type: 'done', totalGoals: report.totalGoals, generatedAt: report.generatedAt });
        return report;

    } catch (err) {
        logger.error('CPP WBR generation failed:', err.message);
        onEvent({ type: 'error', message: err.message });
        throw err;
    }
}

// ─── Read cached report ───

function getCachedReport() {
    const report = loadReport();
    const state = loadState();
    return { report, state };
}

module.exports = {
    generateCppWbr,
    getCachedReport,
    loadState,
    loadReport,
    SECTIONS,
};
