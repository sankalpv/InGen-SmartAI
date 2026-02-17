

import OpenAI from 'openai';
import vectorStore from './vector-store.js'; // Import local vector store

const USE_GEMINI = true; // Toggle this to switch between OpenAI and Gemini

// Configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'; // 'openai' | 'ollama'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'; // Force IPv4

const openai = new OpenAI({
    apiKey: USE_GEMINI ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY,
    baseURL: USE_GEMINI ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : undefined,
});

const AI_MODEL = USE_GEMINI ? 'gemini-2.0-flash' : 'gpt-4o';

const SYSTEM_PROMPT = `
You are the AI engine for 'SmartAI', a productivity dashboard.
Your goal is to be helpful, concise, and proactive.
Identify urgent items, categorize emails, and prepare meeting briefs.
Sound professional but friendly.
`;

// Helper: Generate Completion (Switchable Provider)
async function generateCompletion(systemPrompt, userPrompt, jsonMode = true, temperature = 0.7) {
    if (AI_PROVIDER === 'ollama') {
        try {
            console.log(`[AI] Using Ollama model: '${OLLAMA_MODEL}' at ${OLLAMA_BASE_URL}`);

            const body = {
                model: OLLAMA_MODEL.trim(), // Ensure no whitespace
                system: systemPrompt,
                prompt: userPrompt,
                stream: false,
                format: jsonMode ? 'json' : undefined,
                options: { temperature: temperature } // Ollama uses 'options' for params
            };

            // console.log('[AI] Ollama Request:', JSON.stringify(body));

            const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Ollama API error: ${response.status} - ${text}`);
            }

            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Ollama generation failed:', error);
            throw error;
        }
    } else {
        // Default to OpenAI/Gemini
        if (!openai) throw new Error('OpenAI/Gemini not configured');

        const response = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: jsonMode ? { type: 'json_object' } : undefined,
            temperature: 0.3,
        });
        return response.choices[0].message.content;
    }
}

// Retry wrapper for rate-limited API calls
async function withRetry(fn, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (error.status === 429 && attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.warn(`Rate limited, retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

export async function analyzeEmails(emails) {
    const system = `${SYSTEM_PROMPT}\nAnalyze these emails and categorize them in JSON: { "emails": [{ "id", "category", "urgency", "actionRequired", "summary" }] }`;
    const prompt = `Emails: ${JSON.stringify(emails)}`;

    try {
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true));
        console.log('[AI] Email Analysis Raw:', resultRaw);

        let result;
        try {
            result = JSON.parse(resultRaw);
        } catch (e) {
            console.error('JSON Parse Error (Emails):', e);
            result = { emails: [] };
        }

        // Merge AI analysis with original email data
        return emails.map(email => {
            const analysis = result.emails?.find(e => e.id === email.id) || {};
            return {
                ...email,
                category: analysis.category || 'uncategorized',
                urgency: analysis.urgency || 'low',
                actionRequired: analysis.actionRequired || false,
                summary: analysis.summary || email.snippet
            };
        });
    } catch (error) {
        console.error('AI analysis failed:', error);
        return emails.map(e => ({
            ...e,
            category: 'uncategorized',
            urgency: 'low',
            actionRequired: false,
            summary: e.snippet
        }));
    }
}

export async function prepareMeetingBrief(meeting, relatedEmails) {
    const system = `${SYSTEM_PROMPT}\nPrepare a meeting brief in JSON: { "context", "questions" }`;

    // 1. RAG Context Injection
    let contextDocs = [];
    if (!relatedEmails || relatedEmails.length === 0) {
        // If no emails provided, search vector store using meeting title
        try {
            console.log(`[AI] Searching RAG for meeting: "${meeting.title}"`);
            const query = `${meeting.title} ${meeting.description || ''}`;
            contextDocs = await vectorStore.search(query, 5); // Fetch top 5 related emails
        } catch (e) {
            console.error('Vector store search failed for meeting:', e);
        }
    } else {
        contextDocs = relatedEmails;
    }

    // Format context for prompt
    let contextStr = "No relevant email history found.";
    if (contextDocs.length > 0) {
        contextStr = contextDocs.map((doc, i) => `
Email ${i + 1}:
From: ${doc.sender || doc.from?.name || 'Unknown'}
Subject: ${doc.subject}
Date: ${doc.received || doc.date || 'Unknown'}
Body: ${doc.snippet || doc.body || doc.fullBody || ''}
---`).join('\n');
    }

    const prompt = `
MEETING DETAILS:
Title: ${meeting.title}
Date: ${meeting.start?.dateTime || meeting.startTime || 'Unknown'}
Description: ${meeting.description || 'No description'}
Attendees: ${(meeting.attendees || []).map(a => a.emailAddress?.address || a.emailAddress?.name || a.email || a.name || 'Unknown').join(', ')}

RELATED EMAIL HISTORY (Context):
${contextStr}

TASK:
Prepare a "Pre-Meeting Brief" to help the user prepare.
1. Synthesize the context from the emails. What is the status? What happened last?
2. Identify 3-5 sharp questions or action items to raise.

OUTPUT JSON:
{
    "context": "2-3 sentences summarizing the situation based on the emails.",
    "questions": ["Question 1", "Question 2", "Action Item 1"]
}
`;

    try {
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true, 0.3)); // Low temp for factual accuracy
        console.log('[AI] Meeting Brief Raw:', resultRaw);
        return JSON.parse(resultRaw);
    } catch (error) {
        console.error('AI meeting brief failed:', error);
        return {
            context: meeting.description || 'No context available (AI Error).',
            questions: []
        };
    }
}

export async function summarizeSlack(messages) {
    const system = `${SYSTEM_PROMPT}\nSummarize Slack messages in JSON: { "messages": [{ "id", "summary", "actionItem" }] }`;
    const prompt = `Messages: ${JSON.stringify(messages)}`;

    try {
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true));
        const result = JSON.parse(resultRaw);
        return result.messages;
    } catch (error) {
        return messages.map(msg => ({ ...msg, summary: msg.text, actionItem: false }));
    }
}

export async function generateDailyBriefing(emails, meetings, slackMessages) {
    const system = SYSTEM_PROMPT;

    // Optimize context for local LLM (TinyLlama has small context window)
    const limitedEmails = emails.slice(0, 3).map(e => ({ from: e.from, subject: e.subject, snippet: (e.snippet || '').substring(0, 50) })); // Aggressive truncation
    const limitedSlack = slackMessages.slice(0, 3).map(m => ({ user: m.user, text: (m.text || '').substring(0, 50) }));

    // Executive Assistant Prompt (Simplified for TinyLlama)
    const prompt = `You are my executive productivity assistant.

INPUT:
Emails: ${JSON.stringify(limitedEmails)}
Meetings: ${JSON.stringify(meetings.map(m => ({ title: m.title, time: m.start?.dateTime || m.date || 'All Day' })))}

TASK:
Analyze the emails and meetings to produce a concise Daily Briefing.

Instructions:
1. Identify high-impact items.
2. Ignore low-signal noise.
3. Be direct and practical.

OUTPUT FORMAT:

1. One short greeting paragraph (2–3 sentences) summarizing the workload.

2. “Top 5 Priorities”
   - Each line must begin with "- "
   - Action-oriented phrasing (Start, Decide, Follow up)

Keep the entire response under 200 words.`;

    try {
        // Strict timeout (60s)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI_TIMEOUT')), 60000)
        );

        // Turn OFF jsonMode, Low Temperature (0.2) for stability
        const completionPromise = withRetry(() => generateCompletion(system, prompt, false, 0.2));

        const resultRaw = await Promise.race([completionPromise, timeoutPromise]);
        console.log('[AI] Briefing Raw:', resultRaw);

        // Manual Parsing of Text Output
        let greeting = resultRaw;
        let topPriorities = [];

        // Try to split greeting and bullets
        const lines = resultRaw.split('\n');
        // Look for defined bullets: "-", "* ", or "1. " (Avoids "**Bold**" headers)
        const firstBulletIndex = lines.findIndex(l => l.trim().match(/^-\s/) || l.trim().match(/^\*\s/) || l.trim().match(/^\d+\.\s/));

        if (firstBulletIndex !== -1) {
            greeting = lines.slice(0, firstBulletIndex).join('\n').trim();
            // Remove "Top X Priorities" header from greeting if present
            greeting = greeting.replace(/\*\*?Top \d+ Priorities:?\*\*?/i, '').trim();

            const bullets = lines.slice(firstBulletIndex)
                .filter(l => l.trim().length > 0)
                .filter(l => !l.toLowerCase().includes('top 3 priorities')) // Ignore header if mistakenly captured
                .filter(l => !l.toLowerCase().includes('top 5 priorities'))
                .filter(l => !l.trim().endsWith(':')); // Ignore "Priorities:" lines

            topPriorities = bullets.map(b => ({
                type: 'general',
                title: b.replace(/^[-*•\d\.]+\s*/, '').replace(/\*\*/g, '').replace(/\*/g, '').trim(), // Clean markdown
                urgency: 'medium',
                deadline: 'today',
                reason: 'AI suggested'
            })).slice(0, 5);
        }

        // Construct robust result
        const result = {
            summary: {
                totalEmails: emails.length,
                needResponse: 0,
                urgentCount: 0,
                meetingsToday: meetings.length,
                slackActionItems: slackMessages.length,
                generatedAt: new Date().toISOString()
            },
            greeting: greeting || "Here is your daily briefing.",
            topPriorities: topPriorities
        };

        return result;

    } catch (error) {
        console.error('AI daily briefing failed:', error);
        return {
            summary: {
                totalEmails: emails.length,
                needResponse: 0,
                urgentCount: 0,
                meetingsToday: meetings.length,
                slackActionItems: slackMessages.length,
                generatedAt: new Date().toISOString()
            },
            greeting: `Unable to generate AI summary (${AI_PROVIDER} error).`,
            topPriorities: []
        };
    }
}

// Generate Meeting Brief based on title and email context
export async function generateMeetingBrief(meetingTitle, emails) {
    const system = SYSTEM_PROMPT;

    // Safety check for empty emails
    if (!emails || emails.length === 0) {
        return "No relevant emails found for this meeting.";
    }

    // Truncate email bodies to avoid context limit (Gemma 2B context window)
    const context = emails.slice(0, 5).map(e => `From: ${e.from.name}\nDate: ${e.date}\nSubject: ${e.subject}\nBody: ${(e.body || '').substring(0, 400)}`).join('\n---\n');

    const prompt = `I have a meeting coming up titled: "${meetingTitle}".

Here is the email history context related to this topic/attendees:
${context}

Task: Generate a "Pre-Meeting Brief" to help me prepare.
Output Format (Markdown):
**Context:** (2-3 sentences summarizing the thread)
**Key Points:** (Bullet points of what was discussed)
**Action Items / Open Questions:** (What needs to be resolved?)

If the emails are not relevant to the meeting title, just say "No relevant context found in recent emails."`;

    try {
        console.log(`[AI] Generating brief for: "${meetingTitle}" with ${emails.length} emails`);

        // Timeout 45s
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 45000));

        // Use lower temp for factual summary
        const completionPromise = withRetry(() => generateCompletion(system, prompt, false, 0.2));

        const resultRaw = await Promise.race([completionPromise, timeoutPromise]);
        return resultRaw;
    } catch (error) {
        console.error('generateMeetingBrief failed:', error);
        return "Failed to generate brief (AI Error).";
    }
}

// Generate Weekly Retrospective
export async function generateWeeklyRetro(stats, events, emails) {
    const system = SYSTEM_PROMPT;

    // Create a data summary for the AI
    const dataSummary = `
    Weekly Stats:
    - Total Meetings: ${stats.meetingCount}
    - Total Meeting Duration: ${stats.meetingHours.toFixed(1)} hours
    - Emails Sent: ${stats.emailSentCount}
    - Emails Received: ${stats.emailReceivedCount}
    
    Top Meeting Topics:
    ${events.slice(0, 10).map(e => `- ${e.title} (${getDuration(e.startTime, e.endTime)})`).join('\n')}
    
    Recent Email Subjects:
    ${emails.slice(0, 10).map(e => `- ${e.subject}`).join('\n')}
    `;

    const prompt = `I need a "Weekly Retrospective" for my productivity based on this data:
${dataSummary}

Task:
1. Analyze how I spent my time (Heavy on meetings? Deep work?).
2. Highlight key themes from the meeting topics and email subjects.
3. Give 1 specific recommendation for next week to improve balance.

Output Format (Markdown):
**Weekly Vibe:** (1 sentence summary, e.g., "Meeting Heavy", "Focused Execution")
**Time Analysis:** (2-3 sentences on where time went)
**Key Themes:** (Bullet points of projects/topics)
**Recommendation:** (One actionable tip)

Keep it encouraging but analytical.`;

    try {
        // Use lower temp for stability, but enough for "Vibe"
        const completionPromise = withRetry(() => generateCompletion(system, prompt, false, 0.4));
        const result = await completionPromise;
        return result;
    } catch (error) {
        console.error('generateWeeklyRetro failed:', error);
        return "Unable to generate retrospective.";
    }
}


// Generate Draft Reply with RAG
export async function generateDraft(email, userIntent = '') {
    // vectorStore is imported at top level (see next tool call)

    const system = `${SYSTEM_PROMPT}\nYou are an expert email drafter. Your goal is to write a reply that mimics the user's style based on past examples.`;

    // 1. Retrieve Context (RAG)
    const query = `Subject: ${email.subject}\n\n${email.body}`;
    let contextDocs = [];
    try {
        contextDocs = await vectorStore.search(query, 3); // Top 3 similar emails
    } catch (e) {
        console.error('Vector store search failed:', e);
    }

    // Format context
    let contextStr = "No past examples found.";
    if (contextDocs.length > 0) {
        contextStr = contextDocs.map((doc, i) => `
Example ${i + 1}:
From: ${doc.sender}
Subject: ${doc.subject}
Body:
${doc.snippet || doc.fullBody || ''}
---`).join('\n');
    }

    // 2. Construct Prompt
    const prompt = `
I need a draft reply for this email:

INCOMING EMAIL:
From: ${email.from.name || email.from}
Subject: ${email.subject}
Body:
${email.body || email.snippet}

USER INTENT: ${userIntent || 'Reply positively and professionally.'}

CONTEXT (My past similar emails - MIMIC THIS STYLE):
${contextStr}

DRAFT:
Write a draft reply. Do not include subject line. Just the body.`;

    try {
        console.log(`[AI] Generating draft for: "${email.subject}" with RAG context.`);

        // Timeout 30s
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 30000));

        const completionPromise = withRetry(() => generateCompletion(system, prompt, false, 0.4));

        const result = await Promise.race([completionPromise, timeoutPromise]);
        return result;
    } catch (error) {
        console.error('generateDraft failed:', error);
        return "Failed to generate draft (AI Error).";
    }
}

function getDuration(start, end) {
    const mins = Math.round((new Date(end) - new Date(start)) / 1000 / 60);
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours > 0) return `${hours}h ${remainingMins}m`;
    return `${mins}m`;
}
