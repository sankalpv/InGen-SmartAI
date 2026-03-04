import { NextResponse } from 'next/server';
import { chatWithData } from '@/services/ai';

export const runtime = 'nodejs';

export async function POST(req) {
    try {
        const body = await req.json();
        const { message, history, stream: useStream } = body;

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // Phase 3: Streaming mode — ChatGPT-style word-by-word
        if (useStream) {
            return streamChat(message, history || []);
        }

        // Standard mode (backwards compatible)
        const result = await chatWithData(message, history || []);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

async function streamChat(query, history) {
    const encoder = new TextEncoder();

    // Retrieve context first (non-streaming)
    let contextDocs = [];
    try {
        const { default: vectorStore } = await import('@/services/vector-store.js');
        contextDocs = await vectorStore.search(query, 5);
    } catch (e) {
        console.error('Chat vector search failed:', e);
    }

    const stream = new ReadableStream({
        async start(controller) {
            try {
                // Send sources first
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'sources',
                    sources: contextDocs.map(doc => ({
                        id: doc.id,
                        subject: doc.subject,
                        from: doc.sender || doc.from?.name,
                        similarity: doc.similarity
                    }))
                })}\n\n`));

                // Stream the AI response
                const { streamChatResponse } = await import('@/services/ai-stream');

                await streamChatResponse(query, contextDocs, history, (chunk) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`));
                });

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
            } catch (error) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`));
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}