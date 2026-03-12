/**
 * Person Insights Service
 * Generates AI-powered summaries of what a person is working on,
 * based on emails, calendar events, and issues data.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('PersonInsights');
const localStore = require('./local-store');
const issuesStore = require('./issues-store');
const ollamaClient = require('./ollama-client');

const CACHE_DIR = path.join(process.cwd(), 'brain');
const SUMMARIES_PATH = path.join(CACHE_DIR, 'person-summaries.json');
const SUMMARY_TTL = 4 * 60 * 60 * 1000; // 4 hours

// In-memory cache
let summaryCache = {};

// Load from disk on startup
try {
    if (fs.existsSync(SUMMARIES_PATH)) {
        const cached = JSON.parse(fs.readFileSync(SUMMARIES_PATH, 'utf8'));
        if (cached && cached.summaries) {
            summaryCache = cached.summaries;
        }
    }
} catch (e) { /* ignore */ }

/**
 * Get emails involving a specific person (from or to).
 * @param {string} alias - The person's alias
 * @param {number} days - Look back period
 * @returns {Array} Filtered emails
 */
function getEmailsForPerson(alias, days = 14) {
    const emailData = localStore.getEmails();
    if (!emailData.exists || !emailData.data) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const aliasLower = alias.toLowerCase();
    const emailPattern = `${aliasLower}@`;

    return emailData.data.filter(email => {
        try {
            // Check date
            const emailDate = new Date(email.date || email.receivedAt).getTime();
            if (emailDate < cutoff) return false;

            // Normalize from — can be object {name, email} or string
            const fromRaw = email.from || email.sender || '';
            const from = (typeof fromRaw === 'object' ? (fromRaw.email || fromRaw.name || JSON.stringify(fromRaw)) : String(fromRaw)).toLowerCase();
            if (from.includes(aliasLower)) return true;

            // Normalize to/cc — can be array of objects, string, or undefined
            const toRaw = email.to || '';
            const to = (typeof toRaw === 'object' ? JSON.stringify(toRaw) : String(toRaw)).toLowerCase();
            const ccRaw = email.cc || '';
            const cc = (typeof ccRaw === 'object' ? JSON.stringify(ccRaw) : String(ccRaw)).toLowerCase();
            if (to.includes(aliasLower) || cc.includes(aliasLower)) return true;

            // Check subject for alias mention
            const subject = String(email.subject || '').toLowerCase();
            if (subject.includes(aliasLower)) return true;

            return false;
        } catch (e) {
            return false;
        }
    }).slice(0, 30); // Max 30 emails for context
}

/**
 * Get calendar events involving a specific person.
 * @param {string} alias - The person's alias
 * @param {number} days - Look back/forward period
 * @returns {Array} Filtered events
 */
function getMeetingsForPerson(alias, days = 14) {
    const calData = localStore.getCalendar();
    if (!calData.exists || !calData.data) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const aliasLower = alias.toLowerCase();

    return calData.data.filter(event => {
        try {
            const eventDate = new Date(event.start || event.startDate).getTime();
            if (eventDate < cutoff) return false;

            // Normalize attendees — can be array, object, or string
            const attendeesRaw = event.attendees || event.organizer || '';
            const attendees = (typeof attendeesRaw === 'object' ? JSON.stringify(attendeesRaw) : String(attendeesRaw)).toLowerCase();
            if (attendees.includes(aliasLower)) return true;

            // Check title for alias
            const title = String(event.subject || event.title || '').toLowerCase();
            if (title.includes(aliasLower)) return true;

            return false;
        } catch (e) {
            return false;
        }
    }).slice(0, 20);
}

/**
 * Get issues activities for a person from SQLite.
 */
async function getIssuesForPerson(alias, days = 14) {
    try {
        await issuesStore.init();
        const activities = await issuesStore.getPersonActivities(alias, days);
        return activities || [];
    } catch (e) {
        logger.warn(`Failed to get issues for ${alias}: ${e.message}`);
        return [];
    }
}

/**
 * Generate an AI summary of what a person is working on.
 * @param {string} alias - The person's alias
 * @param {string} name - The person's full name
 * @param {number} days - Look back period
 * @returns {Promise<Object>} { summary, emails, meetings, issues, generatedAt }
 */
async function generatePersonInsight(alias, name, days = 14) {
    // Check cache
    const cacheKey = `${alias}_${days}`;
    if (summaryCache[cacheKey] && (Date.now() - summaryCache[cacheKey].timestamp < SUMMARY_TTL)) {
        return summaryCache[cacheKey].data;
    }

    logger.info(`Generating insights for ${alias} (${name})...`);

    const emails = getEmailsForPerson(alias, days);
    const meetings = getMeetingsForPerson(alias, days);
    const issues = await getIssuesForPerson(alias, days);

    // Build context for AI
    const emailContext = emails.slice(0, 15).map(e => {
        const fromRaw = e.from || e.sender || 'unknown';
        const from = typeof fromRaw === 'object' ? (fromRaw.email || fromRaw.name || 'unknown') : String(fromRaw);
        const subject = e.subject || 'no subject';
        const date = e.date || e.receivedAt || '';
        const snippet = (e.body || e.preview || '').substring(0, 200);
        return `[Email] From: ${from} | Subject: ${subject} | Date: ${date}\n${snippet}`;
    }).join('\n\n');

    const meetingContext = meetings.slice(0, 10).map(m => {
        const title = m.subject || m.title || 'Untitled';
        const date = m.start || m.startDate || '';
        return `[Meeting] ${title} | ${date}`;
    }).join('\n');

    const issueContext = issues.slice(0, 15).map(i => {
        return `[Issue] ${i.action} on "${i.title}" (${i.type || 'unknown'}) | ${i.timestamp || ''}${i.content ? '\n  ' + i.content.substring(0, 150) : ''}`;
    }).join('\n');

    let aiSummary = null;

    if (emails.length > 0 || issues.length > 0 || meetings.length > 0) {
        const prompt = `You are analyzing work activity for ${name} (alias: ${alias}).

Based on the following data from the last ${days} days, provide a concise summary of:
1. **Current Focus Areas** — What projects or initiatives are they working on?
2. **Key Activities** — What have they been doing recently? (code reviews, meetings, issues, etc.)
3. **Collaborations** — Who are they working closely with?
4. **Status** — Any blockers, urgent items, or notable achievements?

Data:
${emailContext ? `\n--- EMAILS ---\n${emailContext}` : ''}
${meetingContext ? `\n--- MEETINGS ---\n${meetingContext}` : ''}
${issueContext ? `\n--- ISSUES/TASKS ---\n${issueContext}` : ''}

Provide a structured, actionable summary in 150-250 words. Use bullet points. Do not make up information not present in the data.`;

        try {
            const client = new ollamaClient();
            const result = await client.generate(prompt, { temperature: 0.3 });
            aiSummary = result;
        } catch (e) {
            logger.error(`AI generation failed for ${alias}: ${e.message}`);
            aiSummary = null;
        }
    }

    const insight = {
        alias,
        name,
        summary: aiSummary,
        emailCount: emails.length,
        meetingCount: meetings.length,
        issueCount: issues.length,
        recentEmails: emails.slice(0, 5).map(e => ({
            subject: e.subject,
            from: e.from || e.sender,
            date: e.date || e.receivedAt,
        })),
        recentMeetings: meetings.slice(0, 5).map(m => ({
            title: m.subject || m.title,
            date: m.start || m.startDate,
        })),
        recentIssues: issues.slice(0, 5).map(i => ({
            title: i.title,
            action: i.action,
            type: i.type,
            timestamp: i.timestamp,
        })),
        generatedAt: new Date().toISOString(),
    };

    // Cache
    summaryCache[cacheKey] = { data: insight, timestamp: Date.now() };

    // Persist
    try {
        if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(SUMMARIES_PATH, JSON.stringify({
            summaries: summaryCache,
            updatedAt: new Date().toISOString()
        }, null, 2));
    } catch (e) { /* ignore */ }

    return insight;
}

module.exports = {
    getEmailsForPerson,
    getMeetingsForPerson,
    getIssuesForPerson,
    generatePersonInsight,
};