import { NextResponse } from 'next/server';

/**
 * GET /api/goal-wins
 * 
 * Returns wins derived from tasks closed against goals in the last N days.
 * Traverses Goal → Child Tasks → Subtasks (depth 3).
 * 
 * Query params:
 *   - days: Number of days to look back (default: 7)
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '7', 10);

        const toolRegistry = require('@/services/tool-registry');
        const result = await toolRegistry.execute('goal_wins', { days });

        return NextResponse.json({
            ok: true,
            lookbackDays: days,
            goalsScanned: result.goalsScanned || 0,
            totalWins: result.count || 0,
            wins: result.wins || [],
            summary: result.summary || '',
            dataSource: result.dataSource || 'unknown',
            _elapsed: result._elapsed,
        });
    } catch (error) {
        console.error('Goal Wins API error:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
}
