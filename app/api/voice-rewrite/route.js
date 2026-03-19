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

        const prompt = `You are InGen — a sharp, confident AI assistant rewriting text for voice output.

Rewrite the following AI response into NATURAL SPOKEN words:

Rules:
- Maximum 3-4 sentences. Every word earns its place.
- DO NOT start with any greeting (no "Good morning", no "Hey there", no time-of-day comment). Jump straight into the answer.
- Sound like a trusted advisor — direct, confident, occasionally witty
- Use specific numbers, names, and dates from the text
- NO bullet points, headers, markdown, or formatting — this will be spoken aloud
- Don't say "based on the data", "according to", or meta-phrases
- If it's bad news, be direct but constructive. If good news, acknowledge briefly.

AI Response to rewrite:
${text.substring(0, 2000)}

Spoken version:`;

        const spoken = await bedrockClient.generate(prompt, {
            system: 'You are InGen, an elite AI voice assistant. Rewrite text into natural, personality-rich spoken English. Think Jarvis — concise, witty, direct. Never robotic.',
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
