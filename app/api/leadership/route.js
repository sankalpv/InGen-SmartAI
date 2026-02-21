import { NextResponse } from 'next/server';
import { analyzeTimeAudit, analyzeRelationshipHealth, extractActionItems, detectBlockers, trackDecisions } from '../../../services/leadership-analytics.js';
import { fetchOutlookEmails, fetchOutlookCalendar } from '../../../services/outlook-local.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const analysisType = searchParams.get('type') || 'all';
        const dateRange = parseInt(searchParams.get('range') || '7');

        // Fetch data with proper date range
        const emails = await fetchOutlookEmails(100); // Get more emails for better analysis
        const meetings = await fetchOutlookCalendar(null, dateRange); // Pass date range to calendar fetch

        const results = {};

        // Time Audit (now async due to semantic similarity)
        if (analysisType === 'all' || analysisType === 'time-audit') {
            results.timeAudit = await analyzeTimeAudit(emails, meetings, dateRange);
        }

        // Relationship Health
        if (analysisType === 'all' || analysisType === 'relationships') {
            results.relationships = analyzeRelationshipHealth(emails, meetings, 10);
        }

        // Action Items
        if (analysisType === 'all' || analysisType === 'action-items') {
            results.actionItems = await extractActionItems(emails, meetings);
        }

        // Blockers
        if (analysisType === 'all' || analysisType === 'blockers') {
            results.blockers = detectBlockers(emails, meetings);
        }

        // Decisions
        if (analysisType === 'all' || analysisType === 'decisions') {
            results.decisions = trackDecisions(emails, meetings);
        }

        return NextResponse.json({
            success: true,
            data: results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[API/Leadership] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}