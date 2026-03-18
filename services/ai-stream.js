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

// Windows-only: Bedrock routing for streaming
const IS_WINDOWS_STREAM = process.platform === 'win32';
let _bedrockStream = null;
let _useBedrockStream = false;
if (IS_WINDOWS_STREAM) {
    try {
        _bedrockStream = require('./bedrock-client');
        _useBedrockStream = _bedrockStream.isAvailable();
    } catch (e) { /* Bedrock not available */ }
}

function getAiTemperature() {
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            const temp = parseFloat(settings.aiTemperature);
            if (!isNaN(temp) && temp >= 0 && temp <= 2) return temp;
        }
    } catch (e) { /* ignore */ }
    return 0.25;
}

/**
 * Stream a completion — calls onChunk for each token
 * Windows + Bedrock: routes to Claude streaming via Bedrock
 * Mac: uses Ollama streaming (unchanged)
 */
export async function streamCompletion(systemPrompt, userPrompt, onChunk, options = {}) {
    const configTemp = getAiTemperature();
    const { temperature = configTemp, jsonMode = false } = options;

    // ─── Windows: Route through Bedrock streaming if available ───
    if (_useBedrockStream && _bedrockStream) {
        try {
            logger.info('[Bedrock] Streaming completion via Claude...');
            const fullPrompt = jsonMode
                ? `${userPrompt}\n\nRespond with valid JSON only.`
                : userPrompt;
            return await _bedrockStream.streamGenerate(fullPrompt, onChunk, {
                system: systemPrompt || undefined,
                temperature,
                maxTokens: 4096,
            });
        } catch (error) {
            logger.error('[Bedrock] Streaming failed, falling back to Ollama:', error.message);
            // Fall through to Ollama below
        }
    }

    // ─── Mac / Ollama fallback (unchanged) ───
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
export async function streamDailyBriefing(emails, meetings, onChunk) {
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
 * Stream a page-context-aware chat response — calls onChunk as tokens arrive.
 * Used by Code Metrics, Ticket Health, Team Pulse pages.
 */
export async function streamPageChatResponse(query, pageContext, contextData, history, onChunk) {
    const PAGE_SYSTEM_PROMPTS = {
        'eng-metrics': `You are a **Code Metrics Analyst** for an engineering team's productivity dashboard.
You have access to real-time data about code review (CR) activity, including CRs created, CRs reviewed, review ratios, stale CRs, and per-engineer trends.
Answer questions about engineering velocity, code review health, individual engineer productivity, and team-wide patterns.
Be data-driven and cite specific numbers from the provided data. Use markdown formatting for clarity.`,

        'ticket-health': `You are a **Ticket Health Analyst** for a team's operational dashboard.
You have access to real-time data about open tickets across resolver groups, including ticket ages, SLA status, status distribution, assignments, and baseline compliance.
Answer questions about ticket health, aging tickets, SLA violations, resolver group workload, and individual assignments.
Be specific about ticket IDs, ages, and groups. Use markdown formatting for clarity.`,

        'my-team': `You are a **Goals & Team Health Analyst** for a manager's WBR (Weekly Business Review) dashboard.
You have access to ALL goals for the team including their status (Green/Yellow/Red), ECD (Estimated Completion Date), goal type, theme, quad assignments, and child task counts.
You also have data on missed ECDs, upcoming ECDs, ECD changes (slipped/pulled in), and status distribution.
Answer questions about goal health, at-risk goals, blocked items, ECD compliance, status distribution, and team progress.
When listing goals, include the goal ID, title, status color, and ECD. Be specific and data-driven. Use markdown formatting for clarity.
IMPORTANT: The data contains ALL goals (the allGoals array). Always reference the complete list, not a subset.`,

        'team-pulse': `You are a **Team Pulse Analyst** for a manager's operational dashboard.
You have access to data about team members, their issue ownership, activity levels, SLA violations, and aging issues from the Issues/SIM/Taskei system.
Answer questions about team workload, member activity, issue ownership, SLA health, and areas needing attention.
Be thoughtful about people-related insights. Use markdown formatting for clarity.`,
    };

    const systemPrompt = PAGE_SYSTEM_PROMPTS[pageContext] || "You are a helpful assistant for a productivity dashboard.";

    const historyStr = history.slice(-5).map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}`).join('\n');

    const prompt = `
PAGE CONTEXT DATA (live data from the ${pageContext} dashboard):
${JSON.stringify(contextData, null, 2)}

CONVERSATION HISTORY:
${historyStr}

CURRENT QUESTION:
${query}

INSTRUCTIONS:
1. Answer the question using the provided page context data.
2. Be specific — cite numbers, names, ticket IDs, or engineer aliases when relevant.
3. If the data doesn't contain the answer, say so clearly.
4. Format your response with markdown (headers, bold, lists) for readability.
5. Be concise but thorough.
`;

    // For key pages, use Bedrock Opus if available
    const bedrockPages = ['eng-metrics', 'ticket-health', 'my-team'];
    if (bedrockPages.includes(pageContext)) {
        try {
            const bedrockClient = require('./bedrock-client');
            if (bedrockClient.isAvailable()) {
                const fullPrompt = `${systemPrompt}\n\n${prompt}`;
                return await bedrockClient.streamGenerate(fullPrompt, onChunk, { maxTokens: 4096 });
            }
        } catch (e) {
            logger.warn(`Bedrock failed for ${pageContext} chat, falling back to Ollama:`, e.message);
        }
    }

    return await streamCompletion(systemPrompt, prompt, onChunk, { temperature: 0.4 });
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