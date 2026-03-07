/**
 * AI Streaming Service — ChatGPT-style token-by-token generation
 * Uses Ollama's stream:true to send tokens as they're generated
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const logger = require('./logger').child('AI-Stream');
const promptLoader = require('./prompt-loader');
const quipFetcher = require('./quip-fetcher');
const issuesStore = require('./issues-store');

// Helper: read emails from local store (single source of truth)
function getLocalEmails() {
    try {
        const emailsFile = path.join(process.cwd(), 'data', 'emails.json');
        if (fs.existsSync(emailsFile)) {
            const cached = JSON.parse(fs.readFileSync(emailsFile, 'utf8'));
            if (cached.data && Array.isArray(cached.data) && cached.data.length > 0 && cached.data[0]?.id !== 'error') {
                return cached.data;
            }
        }
    } catch (e) { }
    return null;
}

// ─── Filter to Today Only (safety filter) ───
function filterToToday(items, dateField) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return items.filter(item => {
        const dateValue = item[dateField];
        if (!dateValue) return false;
        const d = new Date(dateValue);
        return !isNaN(d.getTime()) && d >= startOfDay && d < endOfDay;
    });
}

function filterMeetingsToToday(meetings) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return meetings.filter(m => {
        const dateValue = m.start?.dateTime || m.startTime || m.date;
        if (!dateValue) return false;
        const d = new Date(dateValue);
        return !isNaN(d.getTime()) && d >= startOfDay && d < endOfDay;
    });
}

const OLLAMA_MODEL = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'qwen3:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

/**
 * Stream a completion from Ollama — calls onChunk for each token
 */
export async function streamCompletion(systemPrompt, userPrompt, onChunk, options = {}) {
    const { temperature = 0.3, jsonMode = false } = options;

    const body = {
        model: OLLAMA_MODEL.trim(),
        system: systemPrompt,
        prompt: userPrompt,
        stream: true,
        format: jsonMode ? 'json' : undefined,
        think: false,
        keep_alive: '2m',
        options: { temperature }
    };

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Ollama streaming error: ${response.status} - ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Ollama streams NDJSON — one JSON object per line
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.response) {
                    fullText += parsed.response;
                    onChunk(parsed.response);
                }
                if (parsed.done) {
                    return fullText;
                }
            } catch (e) {
                // Skip malformed lines
            }
        }
    }

    return fullText;
}

/**
 * Stream a daily briefing — calls onChunk as tokens arrive
 */
export async function streamDailyBriefing(emails, meetings, slackMessages, onChunk) {
    const system = promptLoader.get('system') || "You are the AI engine for 'SmartAI', a productivity dashboard. Be helpful, concise, and proactive.";

    // Safety filter: only use today's emails and meetings for the daily briefing
    const todayEmails = filterToToday(emails, 'received');
    const todayMeetings = filterMeetingsToToday(meetings);

    const limitedEmails = todayEmails.slice(0, 5).map(e => ({
        from: e.from,
        subject: e.subject,
        snippet: (e.snippet || '').substring(0, 2000)
    }));

    // Quip context
    const quipSettings = quipFetcher.getQuipSettings();
    let quipContext = '';

    if (quipSettings.enabled) {
        try {
            const quipUrls = quipFetcher.extractQuipUrlsFromEmails(emails);
            if (quipUrls.length > 0) {
                const quipDocs = await quipFetcher.fetchMultipleQuipDocs(quipUrls);
                if (quipDocs.length > 0) {
                    quipContext = quipFetcher.formatQuipContextForAI(quipDocs);
                }
            }
        } catch (e) {
            logger.error('Quip fetch failed during streaming:', e.message);
        }
    }

    // Fetch Issues summary from SQLite (offline — no Outlook calls)
    let issuesContext = '';
    try {
        await issuesStore.init();
        const openIssues = await issuesStore.getOpenIssues();
        const slaViolations = await issuesStore.getSlaViolations(7);
        const agingIssues = await issuesStore.getAgingIssues(7);

        if (openIssues.length > 0 || slaViolations.length > 0) {
            const issuesSummary = openIssues.slice(0, 8).map(i => 
                `- [Impact ${i.impact || '?'}] "${i.title}" (${i.status || 'Open'}, ${i.ageDays || 0}d old, assignee: ${i.assigneeAlias || 'unassigned'})`
            ).join('\n');
            
            const slaSummary = slaViolations.length > 0 
                ? `\nSLA VIOLATIONS (last 7 days): ${slaViolations.map(s => `${s.resolverGroup} on "${s.title}"`).join(', ')}`
                : '';
            
            const agingSummary = agingIssues.length > 0
                ? `\nAGING TICKETS (>7 days): ${agingIssues.length} tickets`
                : '';

            issuesContext = `\nOPEN ISSUES/TICKETS (${openIssues.length} total):\n${issuesSummary}${slaSummary}${agingSummary}`;
        }
    } catch (e) {
        logger.warn('Failed to fetch issues for briefing:', e.message);
    }

    let prompt = `You are my executive productivity assistant.

INPUT:
Emails: ${JSON.stringify(limitedEmails)}
Meetings: ${JSON.stringify(todayMeetings.map(m => ({ title: m.title, time: m.start?.dateTime || m.date || 'All Day' })))}${issuesContext}

TASK: Analyze the emails, meetings, and open issues/tickets to produce a comprehensive Daily Briefing.

OUTPUT FORMAT:
## EXECUTIVE SUMMARY
(3-5 sentences summarizing the day, including any critical open tickets or SLA issues)

## TOP PRIORITIES
- [URGENCY: HIGH] Title | Reason
- [URGENCY: MEDIUM] Title | Reason

## OPS HEALTH
(Brief summary of open tickets, SLA status, aging issues — only if there are noteworthy issues)`;

    if (quipContext) {
        prompt += `\n\n## LINKED DOCUMENTS\n${quipContext}`;
    }

    logger.info('Starting streaming daily briefing...');
    const fullText = await streamCompletion(system, prompt, onChunk, { temperature: 0.2 });
    logger.info('Streaming briefing complete');
    return fullText;
}

/**
 * Stream a chat response — calls onChunk as tokens arrive
 */
export async function streamChatResponse(query, contextDocs, history, onChunk) {
    const system = `${promptLoader.get('system') || "You are the AI engine for 'SmartAI', a productivity dashboard."}\nYou are a helpful assistant with access to the user's email and calendar data. Answer questions based on the provided context. Cite your sources.`;

    const contextStr = contextDocs.map((doc, i) => `
[Source ${i + 1}]
Type: ${doc.source || 'Email'}
From: ${doc.sender || doc.from?.name || 'Unknown'}
Date: ${doc.received || doc.date || 'Unknown'}
Subject: ${doc.subject || 'No Subject'}
Content: ${doc.snippet || doc.body || ''}
`).join('\n---\n');

    const historyStr = history.slice(-5).map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');

    const prompt = `
CONTEXT (Data retrieved from user's local database):
${contextStr || 'No relevant data found.'}

CONVERSATION HISTORY:
${historyStr}

CURRENT QUESTION:
${query}

INSTRUCTIONS:
1. Answer the question using ONLY the provided context.
2. If the answer is not in the context, say "I couldn't find that information in your emails or calendar."
3. Cite sources by referring to "[Source X]" or the sender/date.
4. Be concise and conversational.
`;

    return await streamCompletion(system, prompt, onChunk, { temperature: 0.5 });
}

/**
 * Stream a draft reply — calls onChunk as tokens arrive
 */
export async function streamDraftReply(email, contextStr, quipContext, userIntent, onChunk) {
    const system = `${promptLoader.get('system') || "You are the AI engine for 'SmartAI'."}\n${promptLoader.get('draftReply.systemSuffix') || 'You are an expert email drafter.'}`;

    let prompt = `
I need a draft reply for this email:

INCOMING EMAIL:
From: ${email.from?.name || email.from}
Subject: ${email.subject}
Body:
${email.body || email.snippet}

USER INTENT: ${userIntent || 'Reply positively and professionally.'}

CONTEXT (My past similar emails - MIMIC THIS STYLE):
${contextStr}

DRAFT:
Write a draft reply. Do not include subject line. Just the body.`;

    if (quipContext) {
        prompt += `\n\nThe incoming email references these documents:\n${quipContext}\n\nAcknowledge and reference the documents in your reply.`;
    }

    return await streamCompletion(system, prompt, onChunk, { temperature: 0.4 });
}