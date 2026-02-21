
import OpenAI from 'openai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const logger = require('./logger').child('AI');
const promptLoader = require('./prompt-loader');
const quipFetcher = require('./quip-fetcher');
// import vectorStore from './vector-store.js'; // Lazy loaded instead

const USE_GEMINI = false; // Use Ollama with qwen3:latest instead

// Configuration - Use Ollama with qwen3:latest
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama'; // 'openai' | 'ollama'
const OLLAMA_MODEL = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'qwen3:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const openai = new OpenAI({
    apiKey: USE_GEMINI ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY,
    baseURL: USE_GEMINI ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : undefined,
});

const AI_MODEL = USE_GEMINI ? 'gemini-2.0-flash' : 'gpt-4o';

// SYSTEM_PROMPT is now loaded from config/prompts.json via prompt-loader (hot-reloadable)
function getSystemPrompt() {
    return promptLoader.get('system') || "You are the AI engine for 'SmartAI', a productivity dashboard. Be helpful, concise, and proactive.";
}

// Helper: Generate Completion (Switchable Provider)
async function generateCompletion(systemPrompt, userPrompt, jsonMode = true, temperature = 0.7) {
    if (AI_PROVIDER === 'ollama') {
        try {
            logger.info(`Using Ollama model: '${OLLAMA_MODEL}' at ${OLLAMA_BASE_URL}`);

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
            logger.error('Ollama generation failed:', error.message);
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
                logger.warn(`Rate limited, retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

export async function analyzeEmails(emails) {
    const systemSuffix = promptLoader.get('emailAnalysis.systemSuffix') || 'Analyze these emails and categorize them in JSON: { "emails": [{ "id", "category", "urgency", "actionRequired", "summary" }] }';
    const system = `${getSystemPrompt()}\n${systemSuffix}`;
    const prompt = `Emails: ${JSON.stringify(emails)}`;

    try {
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true));
        logger.debug('Email Analysis Raw:', resultRaw?.substring(0, 200));

        let result;
        try {
            result = JSON.parse(resultRaw);
        } catch (e) {
            logger.error('JSON Parse Error (Emails):', e.message);
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
        logger.error('AI analysis failed:', error.message);
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
    const systemSuffix = promptLoader.get('meetingBrief.systemSuffix') || 'Prepare a meeting brief in JSON: { "context", "questions" }';
    const system = `${getSystemPrompt()}\n${systemSuffix}`;

    // 1. RAG Context Injection
    let contextDocs = [];
    if (!relatedEmails || relatedEmails.length === 0) {
        // If no emails provided, search vector store using meeting title
        try {
            logger.info(`Searching RAG for meeting: "${meeting.title}"`);
            const query = `${meeting.title} ${meeting.description || ''}`;
            const { default: vectorStore } = await import('./vector-store.js'); // Lazy load
            contextDocs = await vectorStore.search(query, 5);
        } catch (e) {
            logger.error('Vector store search failed for meeting:', e.message);
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
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true, 0.3));
        logger.debug('Meeting Brief Raw:', resultRaw?.substring(0, 200));
        return JSON.parse(resultRaw);
    } catch (error) {
        logger.error('AI meeting brief failed:', error.message);
        return {
            context: meeting.description || 'No context available (AI Error).',
            questions: []
        };
    }
}

export async function summarizeSlack(messages) {
    const systemSuffix = promptLoader.get('slackSummary.systemSuffix') || 'Summarize Slack messages in JSON: { "messages": [{ "id", "summary", "actionItem" }] }';
    const system = `${getSystemPrompt()}\n${systemSuffix}`;
    const prompt = `Messages: ${JSON.stringify(messages)}`;

    try {
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true));
        const result = JSON.parse(resultRaw);
        return result.messages;
    } catch (error) {
        logger.error('Slack summarization failed:', error.message);
        return messages.map(msg => ({ ...msg, summary: msg.text, actionItem: false }));
    }
}

export async function generateDailyBriefing(emails, meetings, slackMessages) {
    const system = getSystemPrompt();

    // Optimize context for local LLM (Modern models have 8k+ context)
    const limitedEmails = emails.slice(0, 5).map(e => ({ from: e.from, subject: e.subject, snippet: (e.snippet || '').substring(0, 2000) }));
    const limitedSlack = slackMessages.slice(0, 5).map(m => ({ user: m.user, text: (m.text || '').substring(0, 200) }));

    // NEW: Quip Document Context for Daily Briefing
    const quipSettings = quipFetcher.getQuipSettings();
    let quipContext = '';
    
    if (quipSettings.enabled) {
        try {
            logger.info('Scanning emails for Quip documents in daily briefing...');
            const quipUrls = quipFetcher.extractQuipUrlsFromEmails(emails);
            
            if (quipUrls.length > 0) {
                logger.info(`Found ${quipUrls.length} Quip URLs across emails, fetching documents...`);
                const quipDocs = await quipFetcher.fetchMultipleQuipDocs(quipUrls);
                
                if (quipDocs.length > 0) {
                    quipContext = quipFetcher.formatQuipContextForAI(quipDocs);
                    logger.info(`Successfully fetched ${quipDocs.length} Quip documents for daily briefing`);
                }
            }
        } catch (error) {
            logger.error('Failed to fetch Quip documents for briefing:', error.message);
        }
    }

    // Load prompt template from prompts.json (hot-reloadable from server)
    const templateFromConfig = promptLoader.get('dailyBriefing.promptTemplate');
    let prompt = templateFromConfig
        ? templateFromConfig
            .replace('{{EMAILS}}', JSON.stringify(limitedEmails))
            .replace('{{MEETINGS}}', JSON.stringify(meetings.map(m => ({ title: m.title, time: m.start?.dateTime || m.date || 'All Day' }))))
        : `You are my executive productivity assistant.

INPUT:
Emails: ${JSON.stringify(limitedEmails)}
Meetings: ${JSON.stringify(meetings.map(m => ({ title: m.title, time: m.start?.dateTime || m.date || 'All Day' })))}

TASK: Analyze the emails and meetings to produce a comprehensive Daily Briefing.

Instructions:
1. Identify high-impact items.
2. Ignore low-signal noise.
3. Be direct, practical, and comprehensive.

OUTPUT FORMAT:
1. A detailed greeting paragraph (3-5 sentences) summarizing the day.
2. Top Priorities (action-oriented, each starting with "- ")

Provide as much detail as necessary.`;

    // Add Quip context if available
    if (quipContext) {
        const quipInstructions = promptLoader.get('dailyBriefing.withQuipContext') || 
            `LINKED DOCUMENTS:
{{quipContext}}

CRITICAL INSTRUCTIONS FOR QUIP DOCUMENTS:
1. Extract and quote specific goals, deadlines, or action items from the document content
2. Reference the document by title when mentioning specific information
3. Include concrete details like "The document states..." or "According to [Document Title]..."
4. If a document mentions goals, deadlines, or key decisions, include those in the priorities
5. Use direct quotes from the document when relevant (e.g., "Goal SIM: Goal 132 and Goal 125")`;
        
        prompt += `\n\n${quipInstructions.replace('{{quipContext}}', quipContext)}`;
    }

    try {
        // Increased timeout to 120s for complex briefings with Quip documents
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AI_TIMEOUT: Briefing generation exceeded 120s. Try reducing email count or disabling Quip.')), 120000)
        );

        // Turn OFF jsonMode, Low Temperature (0.2) for stability
        logger.info('Starting daily briefing generation...');
        const completionPromise = withRetry(() => generateCompletion(system, prompt, false, 0.2));

        const resultRaw = await Promise.race([completionPromise, timeoutPromise]);
        logger.info('Daily briefing generated successfully');
        console.log('[AI] Briefing Raw:', resultRaw);

        // Manual Parsing of Text Output
        let greeting = resultRaw;
        let linkedDocuments = null;
        let topPriorities = [];

        // 1. Try Structured Parsing (## Headers)
        const summaryMatch = resultRaw.match(/##\s*EXECUTIVE SUMMARY([\s\S]*?)(?=##|$)/i);
        const linkedDocsMatch = resultRaw.match(/##\s*LINKED DOCUMENTS([\s\S]*?)(?=##|$)/i);
        const prioritiesMatch = resultRaw.match(/##\s*TOP PRIORITIES([\s\S]*?)(?=##|$)/i);

        if (summaryMatch || prioritiesMatch) {
            if (summaryMatch) greeting = summaryMatch[1].trim();
            else greeting = "Here is your executive summary.";

            // Parse LINKED DOCUMENTS section if present
            if (linkedDocsMatch) {
                linkedDocuments = linkedDocsMatch[1].trim();
            }

            if (prioritiesMatch) {
                const lines = prioritiesMatch[1].split('\n').filter(l => l.trim().length > 0);
                topPriorities = lines.map(line => {
                    // Start with cleanup
                    const cleanLine = line.trim().replace(/^[-*•]\s*/, '');

                    // Parse "[URGENCY: HIGH] Title | Reason"
                    // Regex explanation:
                    // 1. Optional [URGENCY: ...]
                    // 2. Title part (non-greedy until pipe)
                    // 3. Optional Pipe + Reason
                    const complexMatch = cleanLine.match(/^(?:\[URGENCY:\s*(HIGH|MEDIUM|LOW)\])?\s*([^|]+)(?:\|\s*(.+))?$/i);

                    if (complexMatch) {
                        return {
                            type: 'general',
                            urgency: (complexMatch[1] || 'medium').toLowerCase(),
                            title: complexMatch[2].trim(),
                            reason: complexMatch[3] ? complexMatch[3].trim() : 'AI Highlight',
                            deadline: 'today'
                        };
                    }
                    // Fallback
                    return {
                        type: 'general',
                        urgency: 'medium',
                        title: cleanLine,
                        reason: 'AI Suggested',
                        deadline: 'today'
                    };
                }).slice(0, 5);
            }
        } else {
            // 2. Legacy Fallback Parsing
            const lines = resultRaw.split('\n');
            // ... (rest of legacy logic could be here, or simplified)
            const firstBulletIndex = lines.findIndex(l => l.trim().match(/^-\s/) || l.trim().match(/^\*\s/) || l.trim().match(/^\d+\.\s/));

            if (firstBulletIndex !== -1) {
                greeting = lines.slice(0, firstBulletIndex).join('\n').trim();
                // Remove headers if present
                greeting = greeting.replace(/\*\*?Top \d+ Priorities:?\*\*?/i, '').trim();

                const bullets = lines.slice(firstBulletIndex)
                    .filter(l => l.trim().length > 0)
                    .filter(l => !l.toLowerCase().includes('top 3 priorities'))
                    .filter(l => !l.toLowerCase().includes('top 5 priorities'))
                    .filter(l => !l.trim().endsWith(':'));

                topPriorities = bullets.map(b => ({
                    type: 'general',
                    title: b.replace(/^[-*•\d\.]+\s*/, '').replace(/\*\*/g, '').replace(/\*/g, '').trim(),
                    urgency: 'medium',
                    deadline: 'today',
                    reason: 'AI suggested'
                })).slice(0, 5);
            }
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
            linkedDocuments: linkedDocuments || null,
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
    const system = getSystemPrompt();

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
    const system = getSystemPrompt();

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
    const systemSuffix = promptLoader.get('draftReply.systemSuffix') || 'You are an expert email drafter. Your goal is to write a reply that mimics the user\'s style based on past examples.';
    const system = `${getSystemPrompt()}\n${systemSuffix}`;

    // 1. Retrieve Context (RAG)
    const query = `Subject: ${email.subject}\n\n${email.body}`;
    let contextDocs = [];
    try {
        const { default: vectorStore } = await import('./vector-store.js'); // Lazy load
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

    // 2. NEW: Quip Document Context
    const quipSettings = quipFetcher.getQuipSettings();
    let quipContext = '';
    
    if (quipSettings.enabled) {
        try {
            logger.info('Checking for Quip documents in email...');
            const quipUrls = quipFetcher.extractQuipUrls(email.body || email.snippet);
            
            if (quipUrls.length > 0) {
                logger.info(`Found ${quipUrls.length} Quip URLs, fetching documents...`);
                const quipDocs = await quipFetcher.fetchMultipleQuipDocs(quipUrls);
                
                if (quipDocs.length > 0) {
                    quipContext = quipFetcher.formatQuipContextForAI(quipDocs);
                    logger.info(`Successfully fetched ${quipDocs.length} Quip documents for draft context`);
                }
            }
        } catch (error) {
            logger.error('Failed to fetch Quip documents for draft:', error.message);
        }
    }

    // 3. Construct Prompt with optional Quip context
    let prompt = promptLoader.get('draftReply.promptTemplate') || `
I need a draft reply for this email:

INCOMING EMAIL:
From: {{SENDER}}
Subject: {{SUBJECT}}
Body:
{{BODY}}

USER INTENT: {{INTENT}}

CONTEXT (My past similar emails - MIMIC THIS STYLE):
{{CONTEXT}}

DRAFT:
Write a draft reply. Do not include subject line. Just the body.`;

    // Replace template variables
    prompt = prompt
        .replace('{{SENDER}}', email.from.name || email.from)
        .replace('{{SUBJECT}}', email.subject)
        .replace('{{BODY}}', email.body || email.snippet)
        .replace('{{INTENT}}', userIntent || 'Reply positively and professionally.')
        .replace('{{CONTEXT}}', contextStr);

    // Add Quip context if available
    if (quipContext) {
        const quipInstructions = promptLoader.get('draftReply.withQuipContext') || 
            'The incoming email references these documents:\n{{quipContext}}\n\nAcknowledge and reference the documents in your reply.';
        
        prompt += `\n\n${quipInstructions.replace('{{quipContext}}', quipContext)}`;
    }

    try {
        logger.info(`Generating draft for: "${email.subject}" with RAG context${quipContext ? ' and Quip documents' : ''}`);

        // Timeout 90s (increased for slower hardware/complex prompts)
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 90000));

        const completionPromise = withRetry(() => generateCompletion(system, prompt, false, 0.4));

        const result = await Promise.race([completionPromise, timeoutPromise]);
        return result;
    } catch (error) {
        logger.error('generateDraft failed:', error.message);
        throw error; // Re-throw to surface the actual error
    }
}

function getDuration(start, end) {
    const mins = Math.round((new Date(end) - new Date(start)) / 1000 / 60);
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hours > 0) return `${hours}h ${remainingMins}m`;
    return `${mins}m`;
}

// Chat with Data (RAG)
export async function chatWithData(query, history = []) {
    const system = `${getSystemPrompt()}\nYou are a helpful assistant with access to the user's email and calendar data. Answer questions based on the provided context. Cite your sources.`;

    // 1. Retrieve Context
    let contextDocs = [];
    try {
        console.log(`[AI] Chat RAG search for: "${query}"`);
        const { default: vectorStore } = await import('./vector-store.js'); // Lazy load
        contextDocs = await vectorStore.search(query, 5); // Top 5 chunks
    } catch (e) {
        console.error('Chat vector search failed:', e);
    }

    // Format Context
    const contextStr = contextDocs.map((doc, i) => `
[Source ${i + 1}]
Type: ${doc.source || 'Email'}
From: ${doc.sender || doc.from?.name || 'Unknown'}
Date: ${doc.received || doc.date || 'Unknown'}
Subject: ${doc.subject || 'No Subject'}
Content: ${doc.snippet || doc.body || ''}
`).join('\n---\n');

    // Format History (Last 5 messages)
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

    try {
        const responseText = await withRetry(() => generateCompletion(system, prompt, false, 0.5));

        // Return structured response with sources for UI
        return {
            response: responseText,
            sources: contextDocs.map(doc => ({
                id: doc.id,
                subject: doc.subject,
                from: doc.sender || doc.from?.name,
                similarity: doc.similarity
            }))
        };
    } catch (error) {
        console.error('chatWithData failed:', error);
        return {
            response: "I'm sorry, I encountered an error while processing your request.",
            sources: []
        };
    }
}

// Answer specific question about an email
export async function askQuestionAboutEmail(emailBody, question, email = null) {
    const system = `${getSystemPrompt()}\nYou are a helpful assistant. Answer the user's question based on the email content and any linked documents provided.`;
    
    // NEW: Check for Quip documents in the email
    let quipContext = '';
    const quipSettings = quipFetcher.getQuipSettings();
    
    if (quipSettings.enabled && email) {
        try {
            logger.info('Checking for Quip documents for email question...');
            const quipUrls = quipFetcher.extractQuipUrls(emailBody);
            
            if (quipUrls.length > 0) {
                logger.info(`Found ${quipUrls.length} Quip URLs, fetching for Q&A...`);
                const quipDocs = await quipFetcher.fetchMultipleQuipDocs(quipUrls);
                
                if (quipDocs.length > 0) {
                    quipContext = quipFetcher.formatQuipContextForAI(quipDocs);
                    logger.info(`Successfully fetched ${quipDocs.length} Quip documents for Q&A`);
                }
            }
        } catch (error) {
            logger.error('Failed to fetch Quip documents for Q&A:', error.message);
        }
    }
    
    let prompt = `
EMAIL CONTENT:
"${emailBody}"

USER QUESTION:
${question}
`;

    // Add Quip context if available
    if (quipContext) {
        prompt += `

LINKED DOCUMENTS:
${quipContext}

INSTRUCTIONS:
1. Answer the question using information from BOTH the email and the linked documents
2. If the answer is in the Quip document, quote specific sections
3. Reference which source you're using (email or document title)
4. Provide comprehensive answers by combining information from all sources
`;
    }

    prompt += `

ANSWER:
Answer the question directly and concisely based on the email and any linked documents above.`;

    try {
        const response = await withRetry(() => generateCompletion(system, prompt, false, 0.3));
        return response;
    } catch (error) {
        console.error('askQuestionAboutEmail failed:', error);
        return "I'm sorry, I couldn't generate an answer at this time.";
    }
}

// Extract Time Constraints for Scheduling
export async function extractTimeConstraints(emailBody) {
    const system = `${getSystemPrompt()}\nYou are a scheduling assistant. Extract time constraints and preferences from the email.`;
    const prompt = `
EMAIL BODY:
"${emailBody}"

TASK:
Extract the following scheduling constraints in JSON format:
- durationMinutes: (Best guess, default 30)
- preferredDays: (Array of days like ["Monday", "Tuesday"] mentioned or implied)
- preferredTimeOfDay: ("morning", "afternoon", "any")
- dateRange: ("this week", "next week", "tomorrow", or specific dates)

OUTPUT JSON ONLY:
{ "durationMinutes": 30, "preferredDays": [], "preferredTimeOfDay": "any", "dateRange": "next week" }
`;

    try {
        const resultRaw = await withRetry(() => generateCompletion(system, prompt, true, 0.2));
        return JSON.parse(resultRaw);
    } catch (error) {
        console.error('extractTimeConstraints failed:', error);
        return { durationMinutes: 30, preferredDays: [], preferredTimeOfDay: 'any', dateRange: 'next week' };
    }
}
