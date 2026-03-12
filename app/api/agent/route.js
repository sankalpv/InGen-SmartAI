import { NextResponse } from 'next/server';
import { executeAgent } from '@/services/agent-executor';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min max for complex agent tasks

/**
 * POST /api/agent
 * 
 * Body: { task: string, preferences?: object }
 * 
 * Returns: SSE stream of agent execution events
 * Event types:
 *   - phase: { phase, message }
 *   - plan: { plan, totalSteps }
 *   - clarify: { questions, plan }
 *   - step: { index, total, tool, status, icon, label, elapsed?, summary?, count?, data? }
 *   - chunk: { text } (streaming synthesis tokens)
 *   - done: { totalElapsed, toolCount }
 *   - error: { message }
 */
export async function POST(req) {
    try {
        const body = await req.json();
        const { task, preferences } = body;

        if (!task || typeof task !== 'string' || task.trim().length === 0) {
            return NextResponse.json({ error: 'Task is required' }, { status: 400 });
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    await executeAgent(task.trim(), preferences || {}, (event) => {
                        try {
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
                            );
                        } catch (e) {
                            // Stream may be closed by client
                        }
                    });

                    controller.close();
                } catch (error) {
                    try {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`)
                        );
                    } catch (e) { /* stream closed */ }
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Agent API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * GET /api/agent — Returns available tools manifest + task history
 * Query params: ?view=history | ?view=tools | ?id=task-xxx
 */
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const view = searchParams.get('view');
        const taskId = searchParams.get('id');

        if (view === 'history') {
            const agentMemory = require('@/services/agent-memory');
            const history = agentMemory.getHistoryForUI();
            return NextResponse.json({ history });
        }

        if (taskId) {
            const agentMemory = require('@/services/agent-memory');
            const task = agentMemory.getTaskById(taskId);
            if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
            return NextResponse.json({ task });
        }

        // Default: return tools manifest
        const toolRegistry = require('@/services/tool-registry');
        const tools = toolRegistry.listAll();
        return NextResponse.json({ tools });
    } catch (error) {
        console.error('Agent GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
