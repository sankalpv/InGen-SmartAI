/**
 * Adaptive Engine — Rule-based personalization from feedback signals
 * 
 * Step 2 of the adaptive learning pipeline.
 * Reads from feedback-store.js (accumulated signals) and produces
 * user preference adjustments stored in data/user-preferences.json.
 * 
 * Runs nightly via background-agent.js during the cleanup phase.
 * No ML, no fine-tuning — just SQL aggregates + simple rules.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('AdaptiveEngine');

const PREFS_PATH = path.join(process.cwd(), 'data', 'user-preferences.json');

/**
 * Load current user preferences (or defaults).
 */
function loadPreferences() {
    try {
        if (fs.existsSync(PREFS_PATH)) {
            return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
        }
    } catch (e) { /* use defaults */ }

    return {
        version: 1,
        lastUpdated: null,
        // Alert suppression: types with <10% act rate after 20+ fires get suppressed
        suppressedAlertTypes: [],
        // Sender importance: computed from response patterns
        senderWeights: {},
        // Draft style preferences (per relationship type)
        draftStyleNotes: {},
        // Retrieval quality: queries that consistently get no clicks
        lowQualityPatterns: [],
    };
}

/**
 * Save user preferences to disk.
 */
function savePreferences(prefs) {
    prefs.lastUpdated = new Date().toISOString();
    const dir = path.dirname(PREFS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
    logger.info('User preferences updated');
}

/**
 * Main adaptation run. Called nightly by background-agent.js.
 * Reads feedback signals, computes preference adjustments, writes to disk.
 */
async function runAdaptation() {
    logger.info('Starting adaptive engine run...');

    try {
        const feedbackStore = require('./feedback-store');
        const prefs = loadPreferences();
        let changes = 0;

        // ── 1. Alert Suppression ──────────────────────────────────────────────
        // Suppress alert types the user consistently ignores/dismisses
        try {
            const effectiveness = await feedbackStore.getAlertEffectiveness();
            const newSuppressed = [];

            for (const row of effectiveness) {
                const totalActions = row.total_fired;
                const actRate = row.act_rate || 0;

                // Rule: suppress if fired 20+ times with <10% act rate
                if (totalActions >= 20 && actRate < 10) {
                    newSuppressed.push(row.type);
                    logger.info(`Suppressing alert type "${row.type}": ${actRate}% act rate over ${totalActions} fires`);
                }
            }

            if (JSON.stringify(newSuppressed.sort()) !== JSON.stringify((prefs.suppressedAlertTypes || []).sort())) {
                prefs.suppressedAlertTypes = newSuppressed;
                changes++;
            }
        } catch (e) {
            logger.warn('Alert suppression analysis failed:', e.message);
        }

        // ── 2. Draft Style Notes ──────────────────────────────────────────────
        // Summarize editing patterns per relationship type
        try {
            const draftSummary = await feedbackStore.getDraftStyleSummary();

            for (const row of draftSummary) {
                if (!row.relationship || row.total_drafts < 5) continue;

                const note = {
                    totalDrafts: row.total_drafts,
                    acceptanceRate: row.acceptance_rate,
                    avgEditPercent: row.avg_edit_percent,
                    lastUpdated: new Date().toISOString(),
                };

                // Derive style guidance
                if (row.acceptance_rate >= 80) {
                    note.guidance = 'Current style works well — minimal edits needed';
                } else if (row.avg_edit_percent > 50) {
                    note.guidance = 'User heavily edits drafts — consider using few-shot examples from accepted drafts';
                } else if (row.avg_edit_percent > 20) {
                    note.guidance = 'User makes moderate edits — style is close but needs refinement';
                }

                prefs.draftStyleNotes[row.relationship] = note;
                changes++;
            }
        } catch (e) {
            logger.warn('Draft style analysis failed:', e.message);
        }

        // ── 3. Retrieval Quality Patterns ─────────────────────────────────────
        // Find queries that consistently produce no useful results
        try {
            const quality = await feedbackStore.getRetrievalQuality();
            const lowQuality = [];

            for (const session of quality) {
                if (session.results_shown >= 3 && session.results_clicked === 0) {
                    // User was shown results but clicked none — query may be poor
                    lowQuality.push({
                        query: session.queryText,
                        shownCount: session.results_shown,
                        lastSeen: session.last_activity,
                    });
                }
            }

            // Keep only the 20 most recent low-quality patterns
            prefs.lowQualityPatterns = lowQuality.slice(0, 20);
            if (lowQuality.length > 0) changes++;
        } catch (e) {
            logger.warn('Retrieval quality analysis failed:', e.message);
        }

        // ── Save ──────────────────────────────────────────────────────────────
        if (changes > 0) {
            savePreferences(prefs);
            logger.info(`Adaptive engine: ${changes} preference adjustments saved`);
        } else {
            logger.info('Adaptive engine: no changes needed');
        }

        return { changes, prefs };

    } catch (e) {
        logger.error('Adaptive engine failed:', e.message);
        return { changes: 0, error: e.message };
    }
}

/**
 * Check if an alert type should be suppressed based on learned preferences.
 * Called by proactive-agent.js before creating an insight.
 */
function shouldSuppressAlert(alertType) {
    const prefs = loadPreferences();
    return (prefs.suppressedAlertTypes || []).includes(alertType);
}

/**
 * Get draft style guidance for a relationship type.
 * Called by the drafting flow to add style hints to the prompt.
 */
function getDraftGuidance(relationship) {
    const prefs = loadPreferences();
    return prefs.draftStyleNotes?.[relationship] || null;
}

/**
 * Get accepted drafts for few-shot injection (Step 3).
 * Returns the N most recent accepted drafts for a relationship type.
 */
async function getFewShotExamples(relationship, limit = 5) {
    try {
        const feedbackStore = require('./feedback-store');
        return await feedbackStore.getAcceptedDrafts(relationship, limit);
    } catch (e) {
        logger.warn('Failed to get few-shot examples:', e.message);
        return [];
    }
}

/**
 * Build a style injection prompt section from accepted drafts.
 * Used by ai-stream.js / agent-executor.js when generating draft replies.
 */
async function buildStylePrompt(recipientEmail) {
    try {
        const feedbackStore = require('./feedback-store');
        const relationship = await feedbackStore.classifyRelationship(recipientEmail);
        const guidance = getDraftGuidance(relationship);
        const examples = await getFewShotExamples(relationship, 3);

        if (!examples.length && !guidance) return '';

        let prompt = `\n\n--- WRITING STYLE ADAPTATION ---\n`;
        prompt += `Relationship: ${relationship}\n`;

        if (guidance) {
            prompt += `Style note: ${guidance.guidance} (acceptance rate: ${guidance.acceptanceRate}%, avg edits: ${guidance.avgEditPercent}%)\n`;
        }

        if (examples.length > 0) {
            prompt += `\nHere are ${examples.length} examples of drafts this user accepted (sent with minimal edits). Match this writing style:\n`;
            for (const ex of examples) {
                prompt += `\n[ACCEPTED DRAFT]\nContext: ${(ex.emailContext || '').substring(0, 200)}\nDraft sent: ${(ex.userSent || ex.aiDraft || '').substring(0, 500)}\n`;
            }
        }

        prompt += `--- END STYLE ADAPTATION ---\n`;
        return prompt;
    } catch (e) {
        return '';
    }
}

module.exports = {
    runAdaptation,
    shouldSuppressAlert,
    getDraftGuidance,
    getFewShotExamples,
    buildStylePrompt,
    loadPreferences,
};
