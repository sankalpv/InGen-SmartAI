import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const dynamic = 'force-dynamic';

/**
 * POST /api/voice-rewrite
 * Takes an AI response text and rewrites it via Bedrock
 * into a concise, natural spoken format for TTS.
 */
export async function POST(request) {
    try {
        const { text } = await request.json();
        if (!text || text.length < 5) {
            return NextResponse.json({ spoken: text || '' });
        }

        const bedrockClient = require('../../../services/bedrock-client');

        if (!bedrockClient.isAvailable()) {
            // Bedrock not available — return cleaned original text
            const cleaned = text
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/#{1,3}\s*/g, '')
                .replace(/[-•]\s+/g, '. ')
                .replace(/`[^`]+`/g, '')
                .substring(0, 800);
            return NextResponse.json({ spoken: cleaned });
        }

        const prompt = `Rewrite this AI response into NATURAL SPOKEN words for a voice assistant:

Rules:
- Maximum 3-4 sentences. Every word earns its place.
- Jump straight into the answer. NO greetings, NO time-of-day comments, NO "Hey there."
- Sound like a person briefing a busy executive — direct, confident, natural.
- Use specific numbers, names, and dates from the text. Never be vague.
- If something in the data is notably good or bad, react naturally (brief observation, not forced humor).
- Vary your sentence structure — don't always start the same way.
- NO bullet points, headers, markdown, or formatting.
- Don't say "based on the data", "according to", "it appears that", or other filler phrases.
- Sound like you're talking, not reading a report.

AI Response to rewrite:
${text.substring(0, 2000)}

Spoken version:`;

        const spoken = await bedrockClient.generate(prompt, {
            system: 'You are InGen, a sharp AI voice assistant. Rewrite text into clean, natural spoken English. Be direct and confident. If data contains something remarkable, one brief observational reaction is welcome — but never forced. Think: smart colleague who talks like a person, not a chatbot.',
            maxTokens: 300,
            temperature: 0.4,
        });

        return NextResponse.json({ spoken: spoken?.trim() || text.substring(0, 500) });
    } catch (error) {
        console.error('[Voice Rewrite] Error:', error.message);
        // Fallback: return cleaned original
        const { text } = await request.json().catch(() => ({ text: '' }));
        return NextResponse.json({ spoken: text?.substring(0, 500) || '' });
    }
}
