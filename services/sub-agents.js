/**
 * InGen Sub-Agent Registry — Phase 4
 * 
 * Specialized sub-agents with hardcoded optimal tool chains.
 * Each sub-agent has:
 *   - name, icon, description
 *   - triggerPatterns: regex patterns to auto-detect from user task
 *   - toolChain: fixed array of { tool, paramsFromTask } (no LLM planning needed)
 *   - synthesisPrompt: custom prompt tuned for the output type
 */

const logger = require('./logger').child('SubAgents');

const subAgents = new Map();

function register(agent) {
    subAgents.set(agent.name, agent);
    logger.debug(`Registered sub-agent: ${agent.name}`);
}

function listAll() {
    return Array.from(subAgents.values()).map(a => ({
        name: a.name, icon: a.icon, description: a.description,
    }));
}

/**
 * Detect which sub-agent (if any) should handle the task.
 * Returns the sub-agent object or null.
 */
function detect(task) {
    const taskLower = (task || '').toLowerCase();
    for (const agent of subAgents.values()) {
        for (const pattern of agent.triggerPatterns) {
            if (pattern.test(taskLower)) {
                logger.info(`Sub-agent "${agent.name}" matched task: "${task.substring(0, 60)}"`);
                return agent;
            }
        }
    }
    return null;
}

/**
 * Build the tool execution plan for a sub-agent.
 * Extracts search keywords from the task for tool params.
 */
function buildPlan(agent, task) {
    // Extract keywords: remove common words, keep nouns/topics
    const STOP = new Set(['prepare', 'prep', 'me', 'for', 'the', 'my', 'a', 'an', 'this', 'that', 'next',
        'upcoming', 'what', 'is', 'are', 'give', 'tell', 'about', 'do', 'how', 'can', 'you',
        'help', 'with', 'please', 'i', 'need', 'want', 'to', 'get', 'show', 'find',
        'summarize', 'summary', 'recap', 'review', 'check', 'status', 'of', 'on', 'in',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'tomorrow', 'today', 'yesterday', 'morning', 'afternoon', 'evening', 'week', 'month']);
    const keywords = task.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
    const query = keywords.join(' ') || task.substring(0, 50);

    return agent.toolChain.map(step => ({
        tool: step.tool,
        params: typeof step.params === 'function' ? step.params(query, task) : { ...step.params, query },
        reason: step.reason,
    }));
}

// ─── Sub-Agent Definitions ───

// 1. Meeting Prep Agent
register({
    name: 'meeting_prep',
    icon: '🎯',
    description: 'Specialized agent for meeting and interview preparation. Finds the meeting, gathers email context, looks up attendees, and generates a comprehensive prep brief.',
    triggerPatterns: [
        /\b(prep(are)?|brief|ready)\b.*(meeting|interview|discussion|1[:\-]1|review|sync)/i,
        /\b(meeting|interview|discussion)\b.*(prep|brief|ready)/i,
        /\bprepare me for\b/i,
    ],
    toolChain: [
        { tool: 'calendar_search', params: (q) => ({ query: q, days: 7 }), reason: 'Find the meeting details, time, location, and attendees' },
        { tool: 'email_search', params: (q) => ({ query: q, limit: 10 }), reason: 'Gather email context and discussion threads related to the meeting' },
        { tool: 'people_lookup', params: (q) => ({ query: q }), reason: 'Look up attendees and their roles from org data, emails, and calendar' },
        { tool: 'synthesize', params: {}, reason: 'Generate a comprehensive meeting prep brief' },
    ],
    synthesisPrompt: `You are InGen's Meeting Prep specialist. Create a polished, executive-quality meeting prep brief.

FORMAT (use these exact sections):
## 📅 Meeting Details
Date, time, location, attendees list

## 📋 Context
2-3 paragraphs synthesizing what the meeting is about, based on email threads and calendar description

## 🎯 Key Discussion Points
Bullet points of the main topics to be discussed

## 💬 Your Talking Points
For each, include **bold question/statement** and a brief "Why?" citing the evidence source

## ⚠️ Risk Assessment
Table with columns: Risk | Impact | Likelihood | Mitigation

## 📌 Action Items to Confirm
Numbered list of things to verify before the meeting

Be specific — cite names, dates, email subjects, and data from the tools.`,
});

// 2. Weekly Recap Agent
register({
    name: 'weekly_recap',
    icon: '📊',
    description: 'Summarizes the full week across email, calendar, goals, and tickets. Produces a WBR-style executive summary.',
    triggerPatterns: [
        /\b(week(ly)?|this week|past week|last week)\b.*(summary|recap|review)\b(?!.*report)/i,
        /\b(summarize|recap)\b.*(week|my week)/i,
    ],
    toolChain: [
        { tool: 'email_search', params: (q) => ({ query: q || 'this week important', limit: 15 }), reason: 'Find key email threads from this week' },
        { tool: 'calendar_search', params: () => ({ query: '', days: 7 }), reason: 'Get all meetings from the past/upcoming week' },
        { tool: 'goal_status', params: () => ({ query: '' }), reason: 'Check current goal statuses' },
        { tool: 'ticket_search', params: () => ({ query: '', status: 'all' }), reason: 'Review ticket activity this week' },
        { tool: 'synthesize', params: {}, reason: 'Generate WBR-style weekly recap' },
    ],
    synthesisPrompt: `You are InGen's Weekly Recap specialist. Create a structured WBR-style executive summary.

FORMAT (use these exact sections):
## 📊 Week at a Glance
Quick stats: X meetings, Y emails, Z tickets

## ✅ Wins & Progress
Bullet points of accomplishments and forward movement this week

## ⚠️ Risks & Blockers
Issues that need attention, with specific details

## 🎯 Goal Status Update
For each goal found, show: Goal name | Status color | ECD | Key update

## 📋 Key Decisions Made
Important decisions from emails or meetings this week

## 📌 Action Items for Next Week
Prioritized list of what to focus on

## 💡 Observations
1-2 insights about time allocation, meeting load, or patterns

Be data-driven — cite specific email subjects, meeting names, and numbers.`,
});

// 3. Incident Agent
register({
    name: 'incident',
    icon: '🚨',
    description: 'Gathers context for incidents and high-severity tickets. Builds a timeline with stakeholders and mitigation.',
    triggerPatterns: [
        /\b(sev[\-\s]?[12]|incident|outage|alert|crash|down|degraded)/i,
        /\b(what happened|investigate)\b.*(ticket|issue|sev|alarm|alert)/i,
    ],
    toolChain: [
        { tool: 'ticket_search', params: (q) => ({ query: q, status: 'all' }), reason: 'Find the incident ticket(s) and their status' },
        { tool: 'email_search', params: (q) => ({ query: q, limit: 10 }), reason: 'Gather email threads about the incident' },
        { tool: 'people_lookup', params: (q) => ({ query: q }), reason: 'Identify stakeholders and on-call engineers' },
        { tool: 'knowledge_search', params: (q) => ({ query: q, limit: 5 }), reason: 'Search knowledge base for related past incidents or runbooks' },
        { tool: 'synthesize', params: {}, reason: 'Generate incident summary with timeline' },
    ],
    synthesisPrompt: `You are InGen's Incident Response specialist. Create a structured incident summary.

FORMAT (use these exact sections):
## 🚨 Incident Overview
One-paragraph summary: What happened, when, severity, current status

## ⏱️ Timeline
Chronological bullet points with timestamps from emails and tickets

## 👥 Stakeholders
Table: Name | Role | Involvement

## 🔍 Root Cause Analysis
What we know so far based on email threads and ticket details

## 🛠️ Mitigation Steps
What was done / what needs to be done

## 📌 Follow-Up Actions
Numbered action items with owners

Be precise — cite ticket IDs, email senders, timestamps.`,
});

// 4. Person Deep-Dive Agent
register({
    name: 'person_deep_dive',
    icon: '👤',
    description: 'Deep-dive on a specific person. Finds their role, recent email activity, upcoming meetings, and relevant context.',
    triggerPatterns: [
        /\b(who is|tell me about|background on|about)\b\s+[A-Z]/,
        /\b(person|people|team member)\b.*(deep.?dive|detail|profile|background)/i,
    ],
    toolChain: [
        { tool: 'people_lookup', params: (q) => ({ query: q }), reason: 'Find the person in org database, emails, or calendar' },
        { tool: 'email_search', params: (q) => ({ query: q, limit: 8 }), reason: 'Find recent email threads involving this person' },
        { tool: 'calendar_search', params: (q) => ({ query: q, days: 14 }), reason: 'Find meetings with this person' },
        { tool: 'synthesize', params: {}, reason: 'Generate person profile with recent activity' },
    ],
    synthesisPrompt: `You are InGen's People Intelligence specialist. Create a person profile.

FORMAT (use these exact sections):
## 👤 Person Profile
Name, alias, email, title/role, team, manager

## 📧 Recent Email Activity
Summary of recent email threads involving this person — what topics, what tone, any action items

## 📅 Upcoming Meetings
List of shared meetings in the next 2 weeks

## 🤝 Working Relationship
How you interact with this person based on email/calendar frequency

## 💡 Key Insights
2-3 observations about this person's current focus, concerns, or requests

Be specific — cite email subjects and meeting titles.`,
});

// 5. Weekly Executive Report Agent
register({
    name: 'weekly_executive_report',
    icon: '📊',
    description: 'Generates a crisp, executive-audience weekly report with Wins, Misses, and Insights from all data sources including goal-based wins.',
    triggerPatterns: [
        /\b(weekly|week)\b.*(executive|report|wbr|summary|recap)/i,
        /\bgenerate\b.*(weekly|wbr|executive)/i,
        /\bwbr\b/i,
    ],
    toolChain: [
        { tool: 'goal_wins', params: () => ({ days: 7 }), reason: 'Derive wins from tasks closed against goals in the last 7 days (depth 3: Goal → Tasks → Subtasks)' },
        { tool: 'goal_insights', params: () => ({ days: 7 }), reason: 'Extract technical/strategic insights from goal updates using AI' },
        { tool: 'goal_misses', params: () => ({ days: 7 }), reason: 'Extract misses and risks from at-risk goals, ECD slips, blocked items, and ticket health' },
        { tool: 'goal_key_updates', params: () => ({ days: 7 }), reason: 'Extract key updates and milestones from active goals' },
        { tool: 'ticket_search', params: () => ({ query: '', status: 'all' }), reason: 'Find all tickets — open = blockers, aging = operational risk' },
        { tool: 'oncall_report', params: () => ({ days: 7 }), reason: 'Fetch on-call schedules and incident data from last week' },
        { tool: 'calendar_search', params: () => ({ query: '', days: 7 }), reason: 'Get ALL meetings from the week for context' },
        { tool: 'email_search', params: () => ({ query: 'update milestone risk goal sev alarm urgent launch', limit: 30 }), reason: 'Find key email threads — discussions, escalations, decisions, updates' },
        { tool: 'goal_status', params: () => ({ query: '' }), reason: 'Check all goal statuses — green = wins, yellow/red = misses' },
        { tool: 'people_lookup', params: () => ({ query: 'team' }), reason: 'Identify key contributors for attribution' },
        { tool: 'synthesize', params: {}, reason: 'Generate the executive weekly report' },
    ],
    synthesisPrompt: `You are an executive report writer for a senior engineering leader at Amazon. Generate a polished weekly executive report from the tool evidence provided.

REPORT FORMAT (use these exact sections):

# [Team Name] Weekly Executive Report — Week of [Date Range]

**[Y] meetings** · **[Z] tickets** · **[W] goal tasks completed**

---

## 🏆 Wins
IMPORTANT: Start with Goal-Based Wins from the goal_wins tool. For each goal that had tasks completed this week:
- **Bold headline: "[Goal Title] — [N] task(s) completed"**
- List each completed task by ID and title, with assignee attribution
- Explain the business impact of this progress toward the goal

Then add any additional wins from tickets, emails, or other sources:
- **Bold headline with specific metric/outcome** (e.g., "$168K Savings, 150x Latency Boost")
- 3-5 sentences expanding on what was done, specific numbers, and business impact
- Cite specific people, teams, dates, and data from the evidence

## ⚠️ Misses
Number each miss. Each miss should have:
- **Bold headline quantifying the impact** (e.g., "$120k IMR impact due to...")
- What happened, when, root cause, and current mitigation
- Risk to goals/timelines if unresolved

## 💡 Insights
Number each insight. Each insight should have:
- **Bold headline with the strategic takeaway** (e.g., "93% Cost Reduction via FAISS")
- Data-driven analysis with specific numbers
- Next steps and implications

## 🎫 Operational Health & Ticket Summary
MANDATORY: Include this section using data from the oncall_report and ticket_search tools.
- Show a table of ALL resolver groups with: Group Name | Open Tickets | Status Breakdown | Oldest Age | Resolved/30d | Your Role
- List who is currently on-call for each matched team
- Flag any groups with aging tickets >14 days as operational risks
- If the oncall_report tool returned ticket health data, you MUST include it here

## 📊 Week at a Glance
Table with key metrics: meetings, sev incidents, tickets, goal tasks completed, sprint status

## 📌 Key Decisions Needed
Numbered list of open decisions requiring leadership attention

STYLE GUIDELINES:
- Write for a VP/Director audience — be specific, data-driven, concise
- Every win/miss/insight MUST include specific metrics (dollars, percentages, counts, dates)
- Attribute work to specific people by name
- Goal-based wins are the PRIMARY source of wins — completed tasks against goals are concrete achievements
- Closed/resolved tickets = completed features = potential additional wins
- Yellow/red goals or escalation emails = potential misses
- Technical learnings from meeting summaries = potential insights
- If evidence is thin, acknowledge it honestly rather than fabricating`,
});

module.exports = { register, detect, buildPlan, listAll };
