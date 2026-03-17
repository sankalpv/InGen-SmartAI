import { generateDraft } from '@/services/ai';
import { NextResponse } from 'next/server';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const tracker = require('../../../services/usage-tracker');

export async function POST(req) {
    try {
        const body = await req.json();
        const { email, intent } = body;

        tracker.trackAPICall('/api/draft');
        tracker.trackAIGeneration('DraftReply');

        if (!email) {
            return NextResponse.json({ error: 'Email object is required' }, { status: 400 });
        }

        const draft = await generateDraft(email, intent);
        return NextResponse.json({ draft });
    } catch (error) {
        console.error('Draft generation API failed:', error);
        return NextResponse.json({ error: 'Failed to generate draft' }, { status: 500 });
    }
}
