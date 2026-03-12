import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const toolRegistry = require('@/services/tool-registry');
        const result = await toolRegistry.execute('oncall_report', { days: 7 });
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
