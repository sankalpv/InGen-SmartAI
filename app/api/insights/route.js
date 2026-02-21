import { NextResponse } from 'next/server';
import insightStore from '@/services/insight-store';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const priority = searchParams.get('priority');
        const status = searchParams.get('status') || 'unread';

        let insights;
        if (status === 'unread') {
            insights = await insightStore.getUnreadInsights();
        } else if (status === 'dismissed') {
            insights = await insightStore.getDismissedInsights();
        } else {
            insights = await insightStore.getAllInsights();
        }

        // Apply filters
        if (type) {
            insights = insights.filter(i => i.type === type);
        }
        if (priority) {
            insights = insights.filter(i => i.priority === priority);
        }

        // Get stats
        const stats = await insightStore.getStats();

        return NextResponse.json({
            insights,
            stats,
            count: insights.length
        });
    } catch (error) {
        console.error('Failed to fetch insights:', error);
        return NextResponse.json(
            { error: 'Failed to fetch insights', details: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { id, action, actionType, feedback } = body;

        if (!id || !action) {
            return NextResponse.json(
                { error: 'Missing required fields: id, action' },
                { status: 400 }
            );
        }

        let result;
        switch (action) {
            case 'read':
                result = await insightStore.markAsRead(id);
                break;
            case 'dismiss':
                result = await insightStore.dismissInsight(id);
                break;
            case 'act':
                if (!actionType) {
                    return NextResponse.json(
                        { error: 'actionType required for act action' },
                        { status: 400 }
                    );
                }
                result = await insightStore.markAsActed(id, actionType, feedback);
                break;
            default:
                return NextResponse.json(
                    { error: `Unknown action: ${action}` },
                    { status: 400 }
                );
        }

        return NextResponse.json({
            success: true,
            result
        });
    } catch (error) {
        console.error('Failed to update insight:', error);
        return NextResponse.json(
            { error: 'Failed to update insight', details: error.message },
            { status: 500 }
        );
    }
}