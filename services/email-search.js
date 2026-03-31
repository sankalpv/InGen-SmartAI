/**
 * Centralized Email Search Service
 * 
 * Shared hybrid search logic used by both:
 * - Agent tool-registry (email_search tool)
 * - Dive Deep chat assistant (app/api/chat/route.js)
 * 
 * 3-step hybrid: RAG vector search → keyword OR search → dedup + merge
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('EmailSearch');

const EMAILS_PATH = path.join(process.cwd(), 'data', 'emails.json');

// Day-of-week names to strip from search queries
const DAY_NAMES = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'tomorrow', 'today', 'yesterday']);
const STOP_WORDS = new Set(['what', 'about', 'with', 'from', 'that', 'this', 'have', 'been', 'they', 'their', 'does', 'said', 'tell', 'when', 'where', 'which', 'there', 'would', 'could', 'should', 'into', 'some', 'than', 'then', 'very', 'just', 'only', 'also', 'being', 'will', 'each', 'make', 'like', 'many', 'most', 'over', 'such', 'take', 'long', 'come', 'made', 'prepare', 'prep', 'for', 'the', 'and', 'but', 'not']);

/**
 * Load inbox emails from cache file.
 */
function loadEmails() {
    if (!fs.existsSync(EMAILS_PATH)) return [];
    const raw = JSON.parse(fs.readFileSync(EMAILS_PATH, 'utf8'));
    return (raw.data || []).filter(e => !e.isSent && e.folder !== 'Sent Items');
}

/**
 * Clean a search query: strip day names, stop words, return content keywords.
 */
function extractKeywords(query) {
    return (query || '').toLowerCase().trim()
        .split(/\s+/)
        .filter(w => w.length > 2 && !DAY_NAMES.has(w) && !STOP_WORDS.has(w));
}

/**
 * Hybrid email search: RAG (semantic) + keyword (exact) + dedup.
 * Same logic as Dive Deep chat but extracted as a reusable service.
 * 
 * @param {string} query - Search query
 * @param {number} limit - Max results (default: 10)
 * @returns {Promise<Array>} Matched emails with similarity scores
 */
async function hybridSearch(query, limit = 10) {
    const keywords = extractKeywords(query);
    let results = [];

    // Step 1: RAG vector search (semantic similarity)
    try {
        const vectorStore = (await import('./vector-store.js')).default;
        const ragResults = await vectorStore.search(query, Math.min(limit, 5));
        results = ragResults.map(r => ({
            id: r.id,
            subject: r.subject || '(No Subject)',
            from: r.sender || r.from?.name || r.from?.email || 'Unknown',
            date: r.received || r.date || '',
            snippet: (r.snippet || r.body || '').substring(0, 300),
            body: r.body || r.snippet || '',  // full body for agent summarization
            similarity: r.similarity || 0.5,
            source: 'rag',
        }));
        logger.info(`RAG search returned ${results.length} results for "${query}"`);
    } catch (e) {
        logger.warn('RAG vector search failed, falling back to keyword:', e.message);
    }

    // Step 2: Keyword OR search on full email cache
    if (keywords.length > 0) {
        try {
            const emails = loadEmails();
            const keywordHits = emails.filter(e => {
                const text = `${e.subject || ''} ${e.from?.name || ''} ${e.from?.email || ''} ${e.snippet || ''} ${e.body || ''}`.toLowerCase();
                return keywords.some(kw => {
                    // Word boundary for short keywords, substring for longer ones
                    if (kw.length >= 6) return text.includes(kw);
                    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                    return regex.test(text);
                });
            }).map(e => {
                const text = `${e.subject || ''} ${e.from?.name || ''} ${e.snippet || ''}`.toLowerCase();
                const matchCount = keywords.filter(kw => text.includes(kw)).length;
                const matchRatio = matchCount / keywords.length;
                return {
                    id: e.id,
                    subject: e.subject || '(No Subject)',
                    from: e.from?.name || e.from?.email || 'Unknown',
                    date: e.date || e.received || '',
                    snippet: (e.snippet || e.body || '').substring(0, 300),
                    body: e.body || e.snippet || '',  // full body for agent summarization
                    similarity: parseFloat((0.3 + matchRatio * 0.5).toFixed(2)),
                    source: 'keyword',
                };
            }).sort((a, b) => b.similarity - a.similarity).slice(0, limit);

            // Dedup: merge keyword hits that aren't already in RAG results
            const existingSubjects = new Set(results.map(r => (r.subject || '').toLowerCase()));
            const newHits = keywordHits.filter(h => !existingSubjects.has((h.subject || '').toLowerCase()));
            results = [...results, ...newHits];
            if (newHits.length > 0) logger.info(`Keyword search added ${newHits.length} results`);
        } catch (e) {
            logger.warn('Keyword search failed:', e.message);
        }
    }

    // Sort by similarity descending, limit
    results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
    return results.slice(0, limit);
}

/**
 * Search email senders by name. Returns unique senders matching the query.
 * Used by people_lookup tool to find people mentioned in emails.
 * 
 * @param {string} name - Person name to search for
 * @returns {Array} Matched senders with name, email, subject
 */
function searchSenders(name) {
    const emails = loadEmails();
    const queryLower = (name || '').toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length === 0) return [];

    const senderMap = new Map();
    for (const e of emails) {
        const senderName = (e.from?.name || '').toLowerCase();
        const senderEmail = (e.from?.email || '').toLowerCase();
        const matched = keywords.some(kw => senderName.includes(kw) || senderEmail.includes(kw));
        if (matched && !senderMap.has(senderEmail)) {
            senderMap.set(senderEmail, {
                name: e.from?.name || 'Unknown',
                email: e.from?.email || '',
                alias: (e.from?.email || '').split('@')[0],
                lastSubject: e.subject,
                lastDate: e.date || e.received,
                source: 'email-sender',
            });
        }
    }
    return Array.from(senderMap.values()).slice(0, 10);
}

module.exports = { hybridSearch, searchSenders, extractKeywords, loadEmails };
