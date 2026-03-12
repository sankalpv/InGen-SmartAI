import { generateDraft } from '@/services/ai';
import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const body = await req.json();
        const { email, intent } = body;

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
