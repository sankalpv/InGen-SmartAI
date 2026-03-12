import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '7', 10);
        const toolRegistry = require('@/services/tool-registry');
        const result = await toolRegistry.execute('goal_key_updates', { days });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
