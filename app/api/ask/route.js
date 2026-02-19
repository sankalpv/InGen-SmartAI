import { NextResponse } from 'next/server';
import { askQuestionAboutEmail } from '@/services/ai';

export async function POST(req) {
    try {
        const { emailBody, question } = await req.json();

        if (!emailBody || !question) {
            return NextResponse.json(
                { error: 'Email body and question are required.' },
                { status: 400 }
            );
        }

        console.log(`[API] Asking question about email: "${question}"`);
        const answer = await askQuestionAboutEmail(emailBody, question);

        return NextResponse.json({ answer });
    } catch (error) {
        console.error('[API] Ask question failed:', error);
        return NextResponse.json(
            { error: 'Failed to process your question.' },
            { status: 500 }
        );
    }
}
