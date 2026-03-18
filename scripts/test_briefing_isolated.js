const SYSTEM_PROMPT = `
You are the AI engine for 'SmartAI', a productivity dashboard.
Your goal is to be helpful, concise, and proactive.
Identify urgent items, categorize emails, and prepare meeting briefs.
Sound professional but friendly.
`;

const OLLAMA_MODEL = 'gemma2:2b';
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

async function generateCompletion(systemPrompt, userPrompt, jsonMode = true, temperature = 0.7) {
    try {
        console.log(`[AI] Using Ollama model: '${OLLAMA_MODEL}' at ${OLLAMA_BASE_URL}`);

        const body = {
            model: OLLAMA_MODEL,
            system: systemPrompt,
            prompt: userPrompt,
            stream: false,
            format: jsonMode ? 'json' : undefined,
            options: { temperature: temperature }
        };

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
}

    const limitedEmails = emails.slice(0, 3).map(e => ({ from: e.from, subject: e.subject, snippet: (e.snippet || '').substring(0, 50) }));

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

3. Keep the entire response under 200 words.`;

    try {
        console.log("Generating briefing...");
        const resultRaw = await generateCompletion(SYSTEM_PROMPT, prompt, false, 0.2);
        console.log('[AI] Briefing Raw:\n', resultRaw);

        let greeting = resultRaw;
        let topPriorities = [];

        const lines = resultRaw.split('\n');
        // Debug regex matching
        console.log("Lines found:", lines.length);

        const firstBulletIndex = lines.findIndex(l => {
            const isBullet = l.trim().match(/^-\s/) || l.trim().match(/^\*\s/) || l.trim().match(/^\d+\.\s/);
            if (isBullet) console.log(`Found bullet at line: "${l}"`);
            return isBullet;
        });

        if (firstBulletIndex !== -1) {
            greeting = lines.slice(0, firstBulletIndex).join('\n').trim();
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
        } else {
            console.log("No bullets found!");
        }

        return {
            greeting,
            topPriorities
        };

    } catch (error) {
        console.error('AI daily briefing failed:', error);
        return { error: error.message };
    }
}

// RUN TEST
(async () => {
    const emails = [
        { from: { name: "Boss" }, subject: "Urgent: Q1 Report", snippet: "Need this by EOD." },
        { from: { name: "Team" }, subject: "Lunch?", snippet: "Tacos sound good." },
        { from: { name: "Client" }, subject: "Proposal Feedback", snippet: "Looks great, let's proceed." }
    ];

    const meetings = [
        { title: "Team Sync", start: { dateTime: "10:00 AM" } }
    ];

    const result = await generateDailyBriefing(emails, meetings, []);
    console.log("\n--- PARSED RESULT ---");
    console.log(JSON.stringify(result, null, 2));
})();
