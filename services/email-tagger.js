/**
 * Email Tagger — AI enrichment for ingested emails
 *
 * Tags each email with structured metadata using Claude (via Bedrock) or local LLM.
 * Called after ingestEmail() to populate the enrichment fields in vectors.db.
 *
 * Tags extracted per email:
 *   hasActionItem  — email asks me to do something
 *   actionItems[]  — list of extracted action items
 *   hasDecision    — a decision was made/announced
 *   hasBlocker     — something is blocked waiting on someone
 *   requiresReply  — I need to respond to this
 *   sentiment      — positive | neutral | negative | urgent
 *   urgency        — low | normal | high | urgent
 *   topics[]       — up to 5 topic tags (e.g. "Q2 planning", "oncall", "security")
 *   fromManager    — sender is in the user's management chain
 *
 * Usage:
 *   const tagger = require('./email-tagger');
 *   const tags = await tagger.tagEmail(email);
 *   vectorStore.updateEnrichment(email.id, tags);
 *
 *   // Backfill all untagged emails in the DB:
 *   await tagger.backfillAll();
 */

const logger = require('./logger').child('EmailTagger');

// Lazy-load AI to avoid circular deps
let _aiClient = null;
async function getAI() {
    if (_aiClient) return _aiClient;
    try {
        // Try Bedrock first (prod), fall back to Ollama (local dev)
        const bedrockClient = require('./bedrock-client');
        _aiClient = bedrockClient;
        return _aiClient;
    } catch {
        const ollamaClient = require('./ollama-client');
        _aiClient = ollamaClient;
        return _aiClient;
    }
}

// ─── Core tagging ─────────────────────────────────────────────────────────────

/**
 * Tag a single email with AI-extracted metadata.
 *
 * @param {Object} email - Normalized email object (subject, from, body/snippet)
 * @param {Object} opts
 * @param {string[]} opts.managerEmails - List of manager email addresses for fromManager detection
 * @returns {Promise<Object>} Tags object
 */
async function tagEmail(email, opts = {}) {
    const { managerEmails = [] } = opts;

    const subject = email.subject || '';
    const sender = email.from?.name || email.sender || '';
    const senderEmail = email.from?.email || email.fromAddr || '';
    const body = (email.body || email.snippet || email.fullBody || '').substring(0, 2000);

    if (!subject && !body) {
        return defaultTags();
    }

    // fromManager is a cheap check — no AI needed
    const fromManager = managerEmails.some(m =>
        m && senderEmail && senderEmail.toLowerCase().includes(m.toLowerCase())
    );

    const prompt = `You are an email classifier. Analyze this email and return ONLY a valid JSON object with these exact fields.

Email:
Subject: ${subject}
From: ${sender}
Body: ${body}

Return JSON:
{
  "hasActionItem": boolean,
  "actionItems": string[],
  "hasDecision": boolean,
  "hasBlocker": boolean,
  "requiresReply": boolean,
  "sentiment": "positive"|"neutral"|"negative"|"urgent",
  "urgency": "low"|"normal"|"high"|"urgent",
  "topics": string[]
}

Rules:
- hasActionItem: true if email asks the recipient to DO something
- actionItems: list of specific tasks mentioned (max 3, be concise)
- hasDecision: true if a decision was announced or made
- hasBlocker: true if something is stuck/blocked waiting on someone
- requiresReply: true if a response is expected or needed
- sentiment: overall tone of the email
- urgency: how time-sensitive the email is
- topics: 1-5 short topic tags relevant to the email content (e.g. "Q2 planning", "security review", "oncall", "hiring")

Return ONLY the JSON object, no explanation.`;

    try {
        const ai = await getAI();
        let responseText = '';

        // Try Bedrock invoke pattern
        if (ai.invokeModel) {
            const response = await ai.invokeModel({
                modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
                prompt,
                maxTokens: 300,
                temperature: 0,
            });
            responseText = response?.content?.[0]?.text || response?.completion || '';
        } else if (ai.generate) {
            // Ollama fallback
            responseText = await ai.generate(prompt, { temperature: 0, maxTokens: 300 });
        } else if (ai.chat) {
            const result = await ai.chat([{ role: 'user', content: prompt }], { temperature: 0 });
            responseText = result?.content || result || '';
        }

        const tags = parseTagResponse(responseText);
        tags.fromManager = fromManager;
        return tags;

    } catch (e) {
        logger.warn(`Tag failed for "${subject}": ${e.message}`);
        return { ...defaultTags(), fromManager };
    }
}

/**
 * Backfill all untagged emails in vectors.db.
 * Run once after rebuilding the index to populate enrichment fields.
 *
 * @param {Object} opts
 * @param {number} opts.batchSize   - How many to tag per batch (default 10)
 * @param {number} opts.delayMs     - Delay between batches in ms (default 500)
 * @param {string[]} opts.managerEmails - Manager emails for fromManager detection
 */
async function backfillAll(opts = {}) {
    const { batchSize = 10, delayMs = 500, managerEmails = [] } = opts;
    const vectorStore = require('./vector-store');
    if (!vectorStore.loaded) await vectorStore.init();

    // Find all untagged documents (sentiment IS NULL = never tagged)
    const untagged = vectorStore.db.prepare(`
        SELECT id, outlookId, subject, sender, fromAddr, snippet, fullBody
        FROM documents
        WHERE sentiment IS NULL
        ORDER BY received DESC
    `).all();

    logger.info(`Backfill: ${untagged.length} untagged documents`);

    let tagged = 0;
    let errors = 0;

    for (let i = 0; i < untagged.length; i += batchSize) {
        const batch = untagged.slice(i, i + batchSize);

        await Promise.all(batch.map(async (row) => {
            try {
                const email = {
                    subject:   row.subject,
                    from:      { name: row.sender, email: row.fromAddr },
                    body:      row.fullBody || row.snippet,
                };
                const tags = await tagEmail(email, { managerEmails });
                vectorStore.updateEnrichment(row.outlookId, tags);
                tagged++;
                if (tagged % 50 === 0) {
                    logger.info(`Backfill progress: ${tagged}/${untagged.length}`);
                }
            } catch (e) {
                errors++;
                logger.warn(`Backfill failed for row ${row.id}: ${e.message}`);
            }
        }));

        // Delay between batches to avoid overwhelming the LLM
        if (i + batchSize < untagged.length && delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
        }
    }

    logger.info(`Backfill complete: ${tagged} tagged, ${errors} errors`);
    return { tagged, errors, total: untagged.length };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultTags() {
    return {
        hasActionItem: false,
        actionItems:   [],
        hasDecision:   false,
        hasBlocker:    false,
        requiresReply: false,
        sentiment:     'neutral',
        urgency:       'normal',
        topics:        [],
        fromManager:   false,
    };
}

function parseTagResponse(text) {
    if (!text) return defaultTags();

    try {
        // Extract JSON from response (model may add preamble/postamble)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return defaultTags();

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            hasActionItem: Boolean(parsed.hasActionItem),
            actionItems:   Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 3) : [],
            hasDecision:   Boolean(parsed.hasDecision),
            hasBlocker:    Boolean(parsed.hasBlocker),
            requiresReply: Boolean(parsed.requiresReply),
            sentiment:     ['positive', 'neutral', 'negative', 'urgent'].includes(parsed.sentiment)
                ? parsed.sentiment : 'neutral',
            urgency:       ['low', 'normal', 'high', 'urgent'].includes(parsed.urgency)
                ? parsed.urgency : 'normal',
            topics:        Array.isArray(parsed.topics) ? parsed.topics.slice(0, 5) : [],
        };
    } catch (e) {
        logger.warn('Failed to parse tag response:', e.message);
        return defaultTags();
    }
}

module.exports = { tagEmail, backfillAll, defaultTags };
