import { NextResponse } from 'next/server';
import { analyzeTimeAudit, analyzeRelationshipHealth, extractActionItems, detectBlockers, trackDecisions } from '../../../services/leadership-analytics.js';
import { fetchOutlookEmails, fetchOutlookCalendar } from '../../../services/outlook-local.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const phonetool = require('../../../services/phonetool.js');

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const analysisType = searchParams.get('type') || 'all';
        const dateRange = parseInt(searchParams.get('range') || '7');

        // Fetch data with proper date range
        const allEmails = await fetchOutlookEmails(100); // Get more emails for better analysis
        const meetings = await fetchOutlookCalendar(null, dateRange); // Pass date range to calendar fetch

        // Filter emails to the selected date range
        const startDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);
        const emails = allEmails.filter(e => {
            const emailDate = new Date(e.received || e.receivedDateTime || e.date);
            return emailDate >= startDate;
        });

        console.log(`[API/Leadership] Date range: ${dateRange}d | Emails: ${emails.length}/${allEmails.length} | Meetings: ${meetings.length}`);

        const results = {};

        // Time Audit (now async due to semantic similarity)
        if (analysisType === 'all' || analysisType === 'time-audit') {
            results.timeAudit = await analyzeTimeAudit(emails, meetings, dateRange);
        }

        // Relationship Health - pass dateRange for proper scoping
        if (analysisType === 'all' || analysisType === 'relationships') {
            results.relationships = analyzeRelationshipHealth(emails, meetings, 10);
            
            // Fetch direct reports if alias is configured
            const alias = phonetool.getAlias();
            if (alias) {
                try {
                    const directReports = await phonetool.fetchDirectReports(alias);
                    if (directReports.length > 0) {
                        // Cross-reference direct reports with relationship health
                        const allRelationships = results.relationships.topRelationships || [];
                        results.relationships.team = directReports.map(report => {
                            // Find matching relationship data
                            const match = allRelationships.find(r => {
                                const rEmail = (r.email || '').toLowerCase();
                                const reportEmail = (report.email || '').toLowerCase();
                                const reportAlias = (report.alias || '').toLowerCase();
                                return rEmail === reportEmail || 
                                       rEmail.includes(reportAlias) ||
                                       (r.name || '').toLowerCase() === (report.name || '').toLowerCase();
                            });
                            
                            return {
                                ...report,
                                healthScore: match?.healthScore || null,
                                status: match?.status || 'unknown',
                                emailsSent: match?.emailsSent || 0,
                                emailsReceived: match?.emailsReceived || 0,
                                meetingsTogether: match?.meetingsTogether || 0,
                                daysSinceLastContact: match?.daysSinceLastContact || null,
                                totalInteractions: match?.totalInteractions || 0,
                                hasData: !!match
                            };
                        });
                        results.relationships.teamAlias = alias;
                    }
                } catch (error) {
                    console.error('[API/Leadership] Phonetool fetch failed:', error.message);
                }
            }
        }

        // Action Items - only items from the selected date range
        if (analysisType === 'all' || analysisType === 'action-items') {
            results.actionItems = await extractActionItems(emails, meetings);
        }

        // Blockers - only from the selected date range
        if (analysisType === 'all' || analysisType === 'blockers') {
            results.blockers = detectBlockers(emails, meetings);
        }

        // Decisions - only from the selected date range
        if (analysisType === 'all' || analysisType === 'decisions') {
            results.decisions = trackDecisions(emails, meetings);
        }

        return NextResponse.json({
            success: true,
            data: results,
            metadata: {
                dateRange,
                emailsAnalyzed: emails.length,
                meetingsAnalyzed: meetings.length,
                totalEmailsAvailable: allEmails.length
            },
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