import { NextResponse } from 'next/server';
import insightStore from '@/services/insight-store';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = parseInt(searchParams.get('days') || '30');

        // Get all insights for the time period
        const insights = await insightStore.getRecentInsights(days, 1000);
        
        // Calculate analytics
        const totalInsights = insights.length;
        const readInsights = insights.filter(i => i.readAt).length;
        const actedInsights = insights.filter(i => i.actedAt).length;
        const dismissedInsights = insights.filter(i => i.dismissedAt).length;
        const feedbackInsights = insights.filter(i => i.feedback_score !== undefined && i.feedback_score !== null).length;
        const helpfulFeedback = insights.filter(i => i.feedback_score > 0).length;
        const notHelpfulFeedback = insights.filter(i => i.feedback_score < 0).length;

        // Group by type
        const byType = insights.reduce((acc, insight) => {
            if (!acc[insight.type]) {
                acc[insight.type] = { total: 0, acted: 0, avgConfidence: 0 };
            }
            acc[insight.type].total++;
            if (insight.actedAt) acc[insight.type].acted++;
            acc[insight.type].avgConfidence += insight.confidence || 0;
            return acc;
        }, {});

        // Calculate averages for type
        Object.keys(byType).forEach(type => {
            byType[type].avgConfidence = (byType[type].avgConfidence / byType[type].total).toFixed(2);
        });

        // Group by priority
        const byPriority = insights.reduce((acc, insight) => {
            if (!acc[insight.priority]) {
                acc[insight.priority] = { total: 0, acted: 0 };
            }
            acc[insight.priority].total++;
            if (insight.actedAt) acc[insight.priority].acted++;
            return acc;
        }, {});

        // Action type breakdown
        const actionTypes = insights
            .filter(i => i.action_type)
            .reduce((acc, i) => {
                acc[i.action_type] = (acc[i.action_type] || 0) + 1;
                return acc;
            }, {});

        // Daily trend (last 7 days)
        const dailyTrend = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dayStart = new Date(date.setHours(0, 0, 0, 0)).getTime();
            const dayEnd = new Date(date.setHours(23, 59, 59, 999)).getTime();
            
            const dayInsights = insights.filter(insight => {
                const created = new Date(insight.created_at).getTime();
                return created >= dayStart && created <= dayEnd;
            });

            dailyTrend.push({
                date: new Date(dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                count: dayInsights.length,
                acted: dayInsights.filter(i => i.actedAt).length
            });
        }

        return NextResponse.json({
            totalInsights,
            readInsights,
            actedInsights,
            dismissedInsights,
            feedbackInsights,
            helpfulFeedback,
            notHelpfulFeedback,
            byType,
            byPriority,
            actionTypes,
            dailyTrend,
            avgConfidence: insights.length > 0 
                ? (insights.reduce((sum, i) => sum + (i.confidence || 0), 0) / insights.length).toFixed(2)
                : 0
        });
    } catch (error) {
        console.error('Failed to fetch analytics:', error);
        return NextResponse.json(
            { error: 'Failed to fetch analytics', details: error.message },
            { status: 500 }
        );
    }
}