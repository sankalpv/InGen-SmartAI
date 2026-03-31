/**
 * InGen Agent Executor — Phase 1
 * 
 * ReAct (Reason + Act) loop that:
 * 1. Takes a user task
 * 2. Asks the LLM to plan which tools to call
 * 3. Executes tools from the registry
 * 4. Feeds results back to the LLM for synthesis
 * 5. Streams progress events to the client
 * 
 * Supports: planning, tool execution, chain-of-thought, final synthesis
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const logger = require('./logger').child('AgentExecutor');
const toolRegistry = require('./tool-registry');
const subAgents = require('./sub-agents');
const agentMemory = require('./agent-memory');

const OLLAMA_MODEL = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || 'qwen3:latest';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const MAX_REACT_STEPS = 8;

/**
 * Generate a human-readable current date/time context string for LLM prompts.
 * This ensures the LLM always knows what "today" means.
 */
function getCurrentDateContext() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `CURRENT DATE/TIME: ${dateStr}, ${timeStr} (${tz})`;
}

/**
 * Generate a completion from the LLM (non-streaming).
 * Tries Bedrock Claude first, falls back to Ollama (unless llmProvider is "bedrock").
 */
async function llmComplete(system, prompt, jsonMode = true) {
    const bedrockClient = require('./bedrock-client');
    const provider = bedrockClient.getLlmProvider();

    // Try Bedrock first
    try {
        if (bedrockClient.isAvailable()) {
            logger.info('llmComplete: Using Bedrock Claude');
            const fullPrompt = jsonMode
                ? `${prompt}\n\nRespond with valid JSON only.`
                : prompt;
            const result = await bedrockClient.generate(fullPrompt, {
                system,
                maxTokens: 4096,
                temperature: 0.2,
            });
            return result;
        }
    } catch (e) {
        if (provider === 'bedrock') {
            throw new Error(`Bedrock-only mode: LLM call failed — ${e.message}. Check your AWS_BEARER_TOKEN_BEDROCK.`);
        }
        logger.warn('Bedrock llmComplete failed, falling back to Ollama:', e.message);
    }

    // Skip Ollama when provider is explicitly "bedrock"
    if (provider === 'bedrock') {
        throw new Error('Bedrock-only mode: Bedrock API key not configured. Set AWS_BEARER_TOKEN_BEDROCK in .env.local');
    }

    // Fallback: Ollama
    const body = {
        model: OLLAMA_MODEL.trim(),
        system,
        prompt,
        stream: false,
        format: jsonMode ? 'json' : undefined,
        think: false,
        keep_alive: '2m',
        options: { temperature: 0.2 },
    };

    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama error ${res.status}: ${text.substring(0, 200)}`);
    }

    const data = await res.json();
    return data.response;
}

/**
 * Stream a completion from the LLM, calling onChunk for each token.
 * Tries Bedrock Claude first, falls back to Ollama.
 */
async function llmStream(system, prompt, onChunk) {
    const bedrockClient = require('./bedrock-client');
    const provider = bedrockClient.getLlmProvider();

    // Try Bedrock first
    try {
        if (bedrockClient.isAvailable()) {
            logger.info('llmStream: Using Bedrock Claude');
            return await bedrockClient.streamGenerate(
                `${system}\n\n${prompt}`,
                onChunk,
                { maxTokens: 8192 }
            );
        }
    } catch (e) {
        if (provider === 'bedrock') {
            throw new Error(`Bedrock-only mode: streaming failed — ${e.message}`);
        }
        logger.warn('Bedrock llmStream failed, falling back to Ollama:', e.message);
    }

    if (provider === 'bedrock') {
        throw new Error('Bedrock-only mode: Bedrock API key not configured.');
    }

    // Fallback: Ollama
    const body = {
        model: OLLAMA_MODEL.trim(),
        system,
        prompt,
        stream: true,
        think: false,
        keep_alive: '2m',
        options: { temperature: 0.3 },
    };

    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Ollama streaming error ${res.status}: ${text.substring(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n').filter(l => l.trim())) {
            try {
                const obj = JSON.parse(line);
                if (obj.response) {
                    fullText += obj.response;
                    onChunk(obj.response);
                }
            } catch (e) { /* skip malformed */ }
        }
    }

    return fullText;
}

/**
 * Build the tool description string for the planning prompt.
 */
function buildToolManifest() {
    const tools = toolRegistry.listAll();
    return tools.map(t =>
        `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}`
    ).join('\n');
}

/**
 * Step 1: PLAN — Ask the LLM which tools to call and in what order.
 * Returns a structured plan: { steps: [{ tool, params, reason }], clarifyingQuestions? }
 */
async function planTask(task, preferences = {}) {
    const toolManifest = buildToolManifest();

    const dateContext = getCurrentDateContext();

    const system = `You are an AI agent planner for InGen, a productivity assistant. Given a user's task, determine which tools to use and in what order.

${dateContext}

AVAILABLE TOOLS:
${toolManifest}

RULES:
1. Choose 1-6 tools that are relevant to the task.
2. For each tool, specify the parameters to pass.
3. The final step should always be "synthesize" (no tool — just a marker for the synthesis phase).
4. Think step-by-step about what information is needed.
5. Rate your confidence (0.0-1.0) in understanding what the user wants.

TOOL SELECTION GUIDANCE (use these combinations for common tasks):
- Summarize/explain/analyze an email → read_inbox_emails (PRIMARY, use this first — fetches full body) + synthesize
- Meeting/Interview prep → calendar_search + email_search + people_lookup + synthesize (ALWAYS search emails for context!)
- Weekly summary → email_search + calendar_search + goal_status + synthesize
- Investigate topic → read_inbox_emails + email_search + knowledge_search + people_lookup + synthesize
- Draft reply → read_inbox_emails + people_lookup + synthesize
- Goal deep-dive → goal_status + email_search + synthesize
- Team check-in → people_lookup + email_search + ticket_search + synthesize

IMPORTANT: For ANY prep or investigation task, ALWAYS include email_search — emails contain critical context, discussion threads, and decisions.

CLARIFYING QUESTIONS — IMPORTANT:
You SHOULD include 1-3 clarifyingQuestions when the task involves:
- Meeting or interview prep (ask: role in meeting, primary concern, output format)
- Writing drafts (ask: tone, audience, key points to include)
- Investigating a topic (ask: depth level, specific angle)
- Multi-stakeholder situations (ask: who is the primary audience)
- Vague or broad requests (ask: scope, timeframe, priority)

Example clarifying questions:
- "What is your role in this meeting?" with options ["Meeting owner", "Key stakeholder", "Observer"]
- "What is your primary concern?" with options ["Timeline risk", "Technical gaps", "Resource allocation", "All of the above"]
- "Output format?" with options ["Bullet points", "Formal doc", "Email summary"]

OUTPUT FORMAT (JSON):
{
  "confidence": 0.7,
  "plan": [
    { "tool": "tool_name", "params": { "key": "value" }, "reason": "Why this tool is needed" },
    { "tool": "synthesize", "params": {}, "reason": "Combine all tool results into final answer" }
  ],
  "clarifyingQuestions": [
    { "question": "What is your role?", "options": ["Owner", "Stakeholder", "Observer"] }
  ]
}

If confidence >= 0.9 AND the task is very specific, you may set clarifyingQuestions to [].
Otherwise, ALWAYS include at least 1-2 clarifying questions.`;

    const prefsStr = Object.keys(preferences).length > 0
        ? `\nUser preferences: ${JSON.stringify(preferences)}`
        : '';

    const prompt = `TASK: ${task}${prefsStr}\n\nPlan the execution steps (JSON):`;

    try {
        const raw = await llmComplete(system, prompt, true);
        logger.info('Plan generated:', raw.substring(0, 800));
        // Log each tool name for debugging
        try {
            const parsed = JSON.parse(raw);
            if (parsed.plan) {
                logger.info('Plan tools:', parsed.plan.map(s => s.tool).join(' → '));
            }
        } catch (e) { /* already logging raw */ }
        const plan = JSON.parse(raw);
        // Ensure plan has the right structure
        if (!plan.plan || !Array.isArray(plan.plan)) {
            return { plan: [{ tool: 'synthesize', params: {}, reason: 'Direct answer' }], clarifyingQuestions: [] };
        }
        // Validate plan: filter out tools that don't exist in registry (even after alias/fuzzy matching)
        const TOOL_ALIASES = {
            'calendar': 'calendar_search', 'cal_search': 'calendar_search', 'search_calendar': 'calendar_search',
            'email': 'email_search', 'emails': 'email_search', 'search_email': 'email_search', 'search_emails': 'email_search', 'mail_search': 'email_search',
            'people': 'people_lookup', 'person_lookup': 'people_lookup', 'lookup_people': 'people_lookup', 'people_search': 'people_lookup', 'person_search': 'people_lookup', 'contact_lookup': 'people_lookup',
            'goals': 'goal_status', 'goal_search': 'goal_status', 'search_goals': 'goal_status', 'goal_lookup': 'goal_status',
            'tickets': 'ticket_search', 'ticket': 'ticket_search', 'search_tickets': 'ticket_search', 'issue_search': 'ticket_search',
            'knowledge': 'knowledge_search', 'knowledge_base': 'knowledge_search', 'rag_search': 'knowledge_search', 'search_knowledge': 'knowledge_search', 'semantic_search': 'knowledge_search',
        };
        const allToolNames = new Set(toolRegistry.listAll().map(t => t.name));
        plan.plan = plan.plan.filter(step => {
            if (!step.tool) return false;
            if (step.tool === 'synthesize') return true;
            if (allToolNames.has(step.tool)) return true;
            // Try alias
            const alias = TOOL_ALIASES[step.tool.toLowerCase()];
            if (alias && allToolNames.has(alias)) {
                step.tool = alias; // Fix the tool name in-place
                return true;
            }
            // Try fuzzy
            const fuzzy = toolRegistry.listAll().find(t => {
                const tN = t.name.replace(/[_\-]/g, '');
                const sN = step.tool.toLowerCase().replace(/[_\-]/g, '');
                return tN.includes(sN) || sN.includes(tN);
            });
            if (fuzzy) {
                step.tool = fuzzy.name;
                return true;
            }
            logger.warn(`Dropping unknown tool from plan: "${step.tool}"`);
            return false;
        });
        // Ensure synthesize is the last step
        if (!plan.plan.find(s => s.tool === 'synthesize')) {
            plan.plan.push({ tool: 'synthesize', params: {}, reason: 'Combine results' });
        }
        return plan;
    } catch (err) {
        logger.error('Planning failed:', err.message);
        // Fallback: generic plan
        return {
            plan: [
                { tool: 'email_search', params: { query: task.substring(0, 50) }, reason: 'Search emails for context' },
                { tool: 'calendar_search', params: { query: task.substring(0, 50) }, reason: 'Check calendar' },
                { tool: 'synthesize', params: {}, reason: 'Combine results' },
            ],
            clarifyingQuestions: [],
        };
    }
}

/**
 * Step 2: EXECUTE — Run each tool in the plan and collect evidence.
 * Emits progress events via the onEvent callback.
 * 
 * @param {Array} plan - Array of { tool, params, reason }
 * @param {Function} onEvent - Callback: (event) => void
 * @returns {Array} evidence - Array of { tool, result, elapsed }
 */
async function executeTools(plan, onEvent) {
    const evidence = [];

    // Separate data-gathering tools from synthesize
    const dataSteps = [];
    let synthStep = null;
    let synthIndex = -1;

    for (let i = 0; i < plan.length; i++) {
        if ((plan[i].tool || 'unknown') === 'synthesize') {
            synthStep = plan[i];
            synthIndex = i;
        } else {
            dataSteps.push({ ...plan[i], originalIndex: i });
        }
    }

    // Fan out ALL data-gathering tools in parallel
    if (dataSteps.length > 0) {
        // Emit "running" for all tools at once
        for (const step of dataSteps) {
            const toolDef = resolveToolDef(step.tool);
            const icon = toolDef?.def?.icon || '🔧';
            const label = (toolDef?.name || step.tool).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            onEvent({ type: 'step', index: step.originalIndex, total: plan.length, tool: toolDef?.name || step.tool, status: 'running', icon, label, reason: step.reason });
        }

        // Execute all in parallel
        const results = await Promise.allSettled(
            dataSteps.map(async (step) => {
                const toolDef = resolveToolDef(step.tool);
                if (!toolDef) return { step, result: null, error: `Unknown tool: ${step.tool}` };
                const result = await toolRegistry.execute(toolDef.name, step.params || {});
                return { step, toolDef, result };
            })
        );

        // Process results and emit events
        for (const settled of results) {
            if (settled.status === 'fulfilled' && settled.value.result) {
                const { step, toolDef, result } = settled.value;
                const icon = toolDef?.def?.icon || '🔧';
                const label = (toolDef?.name || step.tool).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                onEvent({ type: 'step', index: step.originalIndex, total: plan.length, tool: toolDef?.name || step.tool, status: result._error ? 'error' : 'done', icon, label, elapsed: result._elapsed, summary: result.summary, count: result.count, data: result.data });
                evidence.push({ tool: toolDef?.name || step.tool, icon, label, params: step.params, reason: step.reason, result });
            } else {
                const step = settled.value?.step || settled.reason?.step;
                const errMsg = settled.status === 'rejected' ? settled.reason?.message : settled.value?.error;
                if (step) {
                    onEvent({ type: 'step', index: step.originalIndex, total: plan.length, tool: step.tool, status: 'error', icon: '❓', label: step.tool, summary: errMsg || 'Failed' });
                }
            }
        }
    }

    // Emit synthesize running
    if (synthStep) {
        onEvent({ type: 'step', index: synthIndex, total: plan.length, tool: 'synthesize', status: 'running', icon: '📋', label: 'Synthesize', reason: synthStep.reason });
    }

    return evidence;
}

/**
 * Resolve a tool name (with alias/fuzzy matching) and return { name, def }.
 */
function resolveToolDef(toolName) {
    let def = toolRegistry.get(toolName);
    let resolvedName = toolName;
    if (!def) {
        const TOOL_ALIASES = {
            'calendar': 'calendar_search', 'email': 'email_search', 'emails': 'email_search',
            'people': 'people_lookup', 'goals': 'goal_status', 'tickets': 'ticket_search',
        };
        const alias = TOOL_ALIASES[toolName.toLowerCase()];
        if (alias) { resolvedName = alias; def = toolRegistry.get(alias); }
    }
    if (!def) {
        const fuzzy = toolRegistry.listAll().find(t => {
            const tN = t.name.replace(/[_\-]/g, '');
            const sN = toolName.toLowerCase().replace(/[_\-]/g, '');
            return tN.includes(sN) || sN.includes(tN);
        });
        if (fuzzy) { resolvedName = fuzzy.name; def = toolRegistry.get(fuzzy.name); }
    }
    return def ? { name: resolvedName, def } : null;
}

// Legacy sequential executeTools (kept for reference, no longer used)
async function executeToolsSequential(plan, onEvent) {
    const evidence = [];
    for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        const toolName = step.tool || 'unknown';
        if (toolName === 'synthesize') {
            onEvent({ type: 'step', index: i, total: plan.length, tool: 'synthesize', status: 'running', icon: '📋', label: 'Synthesize', reason: step.reason });
            break;
        }

        // Resolve tool names: LLM sometimes generates variations or hallucinated names
        let resolvedToolName = toolName;
        let toolDef = toolRegistry.get(toolName);
        if (!toolDef) {
            // Hard-coded alias map for common LLM hallucinations
            const TOOL_ALIASES = {
                'calendar': 'calendar_search', 'cal_search': 'calendar_search', 'search_calendar': 'calendar_search',
                'email': 'email_search', 'emails': 'email_search', 'search_email': 'email_search', 'search_emails': 'email_search', 'mail_search': 'email_search',
                'people': 'people_lookup', 'person_lookup': 'people_lookup', 'lookup_people': 'people_lookup', 'people_search': 'people_lookup', 'person_search': 'people_lookup', 'contact_lookup': 'people_lookup',
                'goals': 'goal_status', 'goal_search': 'goal_status', 'search_goals': 'goal_status', 'goal_lookup': 'goal_status',
                'tickets': 'ticket_search', 'ticket': 'ticket_search', 'search_tickets': 'ticket_search', 'issue_search': 'ticket_search',
                'knowledge': 'knowledge_search', 'knowledge_base': 'knowledge_search', 'rag_search': 'knowledge_search', 'search_knowledge': 'knowledge_search', 'semantic_search': 'knowledge_search',
                'interview_prep': 'calendar_search', 'meeting_prep': 'calendar_search',
            };
            const aliasResolved = TOOL_ALIASES[toolName.toLowerCase()];
            if (aliasResolved) {
                resolvedToolName = aliasResolved;
                toolDef = toolRegistry.get(resolvedToolName);
                logger.info(`Alias matched tool "${toolName}" → "${resolvedToolName}"`);
            }
            // Fuzzy match as fallback
            if (!toolDef) {
                const allTools = toolRegistry.listAll();
                const fuzzyMatch = allTools.find(t => {
                    const tNorm = t.name.toLowerCase().replace(/[_\-\s]/g, '');
                    const qNorm = toolName.toLowerCase().replace(/[_\-\s]/g, '');
                    return tNorm === qNorm || tNorm.includes(qNorm) || qNorm.includes(tNorm);
                });
                if (fuzzyMatch) {
                    resolvedToolName = fuzzyMatch.name;
                    toolDef = toolRegistry.get(resolvedToolName);
                    logger.info(`Fuzzy matched tool "${toolName}" → "${resolvedToolName}"`);
                }
            }
        }
        if (!toolDef) {
            // Skip truly unknown tools gracefully
            onEvent({
                type: 'step',
                index: i,
                total: plan.length,
                tool: toolName,
                status: 'error',
                icon: '❓',
                label: toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                summary: `Unknown tool: ${toolName}`,
            });
            continue;
        }
        const icon = toolDef.icon || '🔧';
        const label = resolvedToolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        // Emit: tool starting
        onEvent({
            type: 'step',
            index: i,
            total: plan.length,
            tool: resolvedToolName,
            status: 'running',
            icon,
            label,
            reason: step.reason,
        });

        // Execute the tool (use resolved name, not original)
        const result = await toolRegistry.execute(resolvedToolName, step.params || {});

        // Emit: tool completed
        onEvent({
            type: 'step',
            index: i,
            total: plan.length,
            tool: resolvedToolName,
            status: result._error ? 'error' : 'done',
            icon,
            label,
            elapsed: result._elapsed,
            summary: result.summary,
            count: result.count,
            data: result.data,
        });

        evidence.push({
            tool: resolvedToolName,
            icon,
            label,
            params: step.params,
            reason: step.reason,
            result,
        });
    }

    return evidence;
}

/**
 * Step 3: SYNTHESIZE — Feed all evidence to the LLM and generate the final answer.
 * Streams the response token-by-token via onChunk.
 */
async function synthesize(task, evidence, preferences, followUpCtx, onChunk) {
    const evidenceStr = evidence.map((e, i) => {
        const dataStr = e.result.data
            ? JSON.stringify(e.result.data, null, 1).substring(0, 2000)
            : 'No data';
        return `[Tool ${i + 1}: ${e.tool}]
Reason: ${e.reason}
Summary: ${e.result.summary}
Data:
${dataStr}`;
    }).join('\n\n---\n\n');

    const prefsStr = Object.keys(preferences).length > 0
        ? `\nUser preferences: ${JSON.stringify(preferences)}`
        : '';

    const dateContext = getCurrentDateContext();

    const system = `You are InGen's AI assistant. Synthesize the tool results into a comprehensive, actionable response for the user.

${dateContext}

GUIDELINES:
1. Use Markdown formatting (headers, bullets, bold).
2. Be specific — cite data from the tools (names, dates, numbers).
3. If the task is about meeting prep, include: Context, Key Discussion Points, Talking Points, and Risk Assessment.
4. For each talking point, add a brief "Why?" explanation citing the evidence source.
5. Keep it concise but thorough — aim for executive-quality output.
6. If data is missing or tools returned no results, acknowledge it honestly.
7. If PREVIOUS CONTEXT is provided, this is a follow-up task. Use the previous result as primary context and build upon it.`;

    const contextSection = followUpCtx ? `${followUpCtx}\n\n` : '';

    const prompt = `ORIGINAL TASK: ${task}${prefsStr}
${contextSection}
TOOL EVIDENCE:
${evidenceStr}

SYNTHESIZED RESPONSE (Markdown):`;

    const fullText = await llmStream(system, prompt, onChunk);
    return fullText;
}

/**
 * Main entry point: Execute a full agent task.
 * 
 * @param {string} task - The user's task description
 * @param {Object} preferences - User preferences from clarifying questions
 * @param {Function} onEvent - SSE event emitter: (event) => void
 * @returns {Object} - { plan, evidence, result }
 */
export async function executeAgent(task, preferences = {}, onEvent = () => {}) {
    const totalStart = Date.now();

    try {
        logger.info(`Agent task: "${task.substring(0, 100)}"`);

        // ─── Memory: Follow-up detection + context loading ───
        const isFollowUp = agentMemory.isFollowUp(task);
        const recentContext = agentMemory.getRecentContext(3);
        let followUpContext = '';
        if (isFollowUp) {
            const lastResult = agentMemory.getLastResult();
            if (lastResult) {
                followUpContext = `\n\nPREVIOUS TASK RESULT (user is following up on this):\nTask: "${lastResult.task}"\nResult:\n${lastResult.resultFull?.substring(0, 1500) || lastResult.resultSummary}`;
                logger.info(`Follow-up detected. Injecting previous result: "${lastResult.task?.substring(0, 50)}"`);
                onEvent({ type: 'memory', isFollowUp: true, previousTask: lastResult.task });
            }
        }

        // ─── Phase 0: SUB-AGENT DETECTION ───
        // Check if a specialized sub-agent should handle this task
        const detectedAgent = subAgents.detect(task);
        let plan, clarifyingQuestions, customSynthesisPrompt;

        if (detectedAgent) {
            // Sub-agent detected! Use hardcoded optimal chain (skip LLM planning)
            logger.info(`Sub-agent activated: ${detectedAgent.name} (${detectedAgent.icon})`);
            onEvent({
                type: 'phase', phase: 'planning',
                message: `${detectedAgent.icon} ${detectedAgent.description}`,
                subAgent: { name: detectedAgent.name, icon: detectedAgent.icon, description: detectedAgent.description },
            });

            plan = subAgents.buildPlan(detectedAgent, task);
            clarifyingQuestions = [];
            customSynthesisPrompt = detectedAgent.synthesisPrompt;

            // Emit sub-agent identity event
            onEvent({
                type: 'subagent',
                name: detectedAgent.name,
                icon: detectedAgent.icon,
                description: detectedAgent.description,
            });

        } else {
            // No sub-agent match — use LLM planning as usual
            onEvent({ type: 'phase', phase: 'planning', message: 'Analyzing task and planning tools...' });

            const planResult = await planTask(task, preferences);
            plan = planResult.plan;
            clarifyingQuestions = planResult.clarifyingQuestions;
            customSynthesisPrompt = null;
        }

        // If there are clarifying questions, no preferences given, AND skipClarify is not set, return them
        // Voice Assistant sets skipClarify=true to bypass this and execute immediately
        if (clarifyingQuestions && clarifyingQuestions.length > 0 && Object.keys(preferences).length === 0 && !preferences.skipClarify) {
            onEvent({ type: 'clarify', questions: clarifyingQuestions, plan });
            return { plan, clarifyingQuestions, evidence: [], result: null };
        }

        onEvent({ type: 'plan', plan, totalSteps: plan.length });

        // ─── Phase 2: EXECUTE TOOLS ───
        onEvent({ type: 'phase', phase: 'executing', message: 'Running tools...' });
        const evidence = await executeTools(plan, onEvent);

        // ─── Phase 3: SYNTHESIZE ───
        onEvent({ type: 'phase', phase: 'synthesizing', message: 'Generating response...' });

        const synthIndex = plan.findIndex(s => s.tool === 'synthesize');
        if (synthIndex >= 0) {
            onEvent({
                type: 'step', index: synthIndex, total: plan.length,
                tool: 'synthesize', status: 'running', icon: '📋', label: 'Synthesize',
            });
        }

        let resultText = '';
        // Use custom synthesis prompt if sub-agent provided one
        if (customSynthesisPrompt) {
            await synthesizeWithPrompt(task, evidence, preferences, customSynthesisPrompt, followUpContext, (chunk) => {
                resultText += chunk;
                onEvent({ type: 'chunk', text: chunk });
            });
        } else {
            await synthesize(task, evidence, preferences, followUpContext, (chunk) => {
                resultText += chunk;
                onEvent({ type: 'chunk', text: chunk });
            });
        }

        if (synthIndex >= 0) {
            onEvent({
                type: 'step', index: synthIndex, total: plan.length,
                tool: 'synthesize', status: 'done', icon: '📋', label: 'Synthesize',
                elapsed: ((Date.now() - totalStart) / 1000).toFixed(1),
            });
        }

        const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
        onEvent({
            type: 'done', totalElapsed, toolCount: evidence.length,
            subAgent: detectedAgent ? detectedAgent.name : null,
        });

        logger.info(`Agent task completed in ${totalElapsed}s with ${evidence.length} tools${detectedAgent ? ` [${detectedAgent.name}]` : ''}`);

        // ─── Memory: Save completed task ───
        try {
            agentMemory.saveTask({
                task, subAgent: detectedAgent?.name, evidence, result: resultText, totalElapsed,
            });
        } catch (e) { logger.warn('Failed to save task to memory:', e.message); }

        return { plan, evidence, result: resultText, totalElapsed, subAgent: detectedAgent?.name };

    } catch (err) {
        logger.error('Agent execution failed:', err.message);
        onEvent({ type: 'error', message: err.message });
        throw err;
    }
}

/**
 * Synthesize with a custom prompt (used by sub-agents).
 */
async function synthesizeWithPrompt(task, evidence, preferences, customSystemPrompt, followUpCtx, onChunk) {
    const evidenceStr = evidence.map((e, i) => {
        const dataStr = e.result.data
            ? JSON.stringify(e.result.data, null, 1).substring(0, 3000)
            : 'No data';
        return `[Tool ${i + 1}: ${e.tool}]
Reason: ${e.reason}
Summary: ${e.result.summary}
Data:
${dataStr}`;
    }).join('\n\n---\n\n');

    const prefsStr = Object.keys(preferences).length > 0
        ? `\nUser preferences: ${JSON.stringify(preferences)}`
        : '';

    const contextSection = followUpCtx ? `${followUpCtx}\n\n` : '';
    const dateContext = getCurrentDateContext();

    const fullPrompt = `${customSystemPrompt}\n\n${dateContext}\n\nORIGINAL TASK: ${task}${prefsStr}\n${contextSection}\nTOOL EVIDENCE:\n${evidenceStr}\n\nRESPONSE (Markdown):`;

    // Try Bedrock Claude first for higher quality synthesis
    try {
        const bedrockClient = require('./bedrock-client');
        if (bedrockClient.isAvailable()) {
            logger.info('Using Bedrock Claude for synthesis');
            return await bedrockClient.streamGenerate(fullPrompt, onChunk, { maxTokens: 8192 });
        }
    } catch (e) {
        logger.warn('Bedrock not available, falling back to Ollama:', e.message);
    }

    // Fallback to Ollama
    const prompt = `ORIGINAL TASK: ${task}${prefsStr}\n${contextSection}\nTOOL EVIDENCE:\n${evidenceStr}\n\nRESPONSE (Markdown):`;
    return await llmStream(customSystemPrompt, prompt, onChunk);
}

export default { executeAgent };
