import { NextResponse } from 'next/server';
import { chatWithData } from '@/services/ai';

export const runtime = 'nodejs';

export async function POST(req) {
    try {
        const body = await req.json();
        const { message, history } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        const result = await chatWithData(message, history || []);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
