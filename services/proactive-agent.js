/**
 * Proactive Agent Service
 * Orchestrates AI-powered proactive insights generation
 * Runs periodically to analyze patterns and surface recommendations
 */

const logger = require('./logger').child('ProactiveAgent');
const aiInsights = require('./ai-insights');
const insightStore = require('./insight-store');
const { analyzeTimeAudit, analyzeRelationshipHealth } = require('./leadership-analytics');
const localStore = require('./local-store');

// Read from local JSON cache instead of ESM outlook-local (avoids ESM/CJS conflict in background agent)
function fetchOutlookEmails() {
    const cached = localStore.getEmails();
    return Promise.resolve(cached.data || []);
}
function fetchOutlookCalendar() {
    const cached = localStore.getCalendar();
    return Promise.resolve(cached.data || []);
}

/**
 * Main proactive analysis run
 * Called periodically by background agent (every 30 minutes)
 */
async function generateActionItemInsights() {
    try {
        const notesStore = require('./notes-store');
        const dueItems = await notesStore.getDueActionItems(3); // due within 3 days
        if (dueItems.length === 0) return;

        const hasSimilar = await insightStore.hasRecentSimilarInsight(
            'action_items_due',
            'Action items due',
            12 // check every 12 hours
        );
        if (hasSimilar) return;

        const overdue = dueItems.filter(i => i.isOverdue);
        const dueToday = dueItems.filter(i => !i.isOverdue);
        const lines = [];
        if (overdue.length > 0) lines.push(`⚠️ ${overdue.length} overdue: ${overdue.map(i => `${(i.owner || '?').replace('@', '')} — ${i.action}`).join('; ')}`);
        if (dueToday.length > 0) lines.push(`📅 ${dueToday.length} due soon: ${dueToday.map(i => `${(i.owner || '?').replace('@', '')} — ${i.action}`).join('; ')}`);

        const insight = {
            type: 'action_items_due',
            priority: overdue.length > 0 ? 'high' : 'medium',
            title: `${dueItems.length} action item${dueItems.length > 1 ? 's' : ''} need attention`,
            description: lines.join('\n'),
            data: { overdue: overdue.length, dueSoon: dueToday.length, items: dueItems.slice(0, 10) },
            source: 'meeting-notes',
        };
        await insightStore.storeInsight(insight);
        logger.info(`Created action items due insight (${overdue.length} overdue, ${dueToday.length} due soon)`);
    } catch (e) {
        logger.warn('Action item insight generation failed:', e.message);
    }
}

async function runProactiveAnalysis() {
    let generated = 0;
    let skipped = 0;
    
    try {
        logger.info('Starting proactive analysis run');
        
        const startCount = (await insightStore.getStats()).total || 0;
        
        // Fetch recent data (30 days for proactive analysis)
        const emails = await fetchOutlookEmails();
        const meetings = await fetchOutlookCalendar(null, 30);
        
        // Get upcoming meetings (next 24 hours)
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const upcomingMeetings = meetings.filter(m => {
            const meetingDate = new Date(m.start?.dateTime || m.startTime);
            return meetingDate > now && meetingDate < tomorrow;
        });
        
        logger.info(`Found ${upcomingMeetings.length} upcoming meetings in next 24h`);
        
        // 1. Generate meeting prep insights
        await generateMeetingPrepInsights(upcomingMeetings);
        
        // 2. Generate contextual insights from recent activity
        await generateContextInsights(emails, meetings);
        
        // 3. Email prioritization (if new unread emails)
        await generateEmailPriorityInsights(emails);
        
        // 4. Relationship health monitoring
        await generateRelationshipInsights(emails, meetings);
        
        // 5. Weekly report (Mondays only)
        await generateWeeklyReportIfNeeded(emails, meetings);
        
        // 6. Action items from meeting notes
        await generateActionItemInsights();
        
        // 7. Cleanup old insights
        await insightStore.cleanupOldInsights(90);
        
        const endCount = (await insightStore.getStats()).total || 0;
        generated = endCount - startCount;
        
        logger.info(`Proactive analysis complete. Generated ${generated} new insights.`);
        
        return { generated, skipped };
        
    } catch (error) {
        logger.error(`Proactive analysis failed: ${error.message}`);
        return { generated, skipped, error: error.message };
    }
}

/**
 * Generate meeting preparation insights
 */
async function generateMeetingPrepInsights(upcomingMeetings) {
    for (const meeting of upcomingMeetings) {
        try {
            // Check if we already have a prep insight for this meeting
            const meetingId = meeting.id || meeting.title;
            const hasSimilar = await insightStore.hasRecentSimilarInsight(
                'meeting_prep',
                `Prep for ${meeting.title}`,
                12 // Within last 12 hours
            );
            
            if (hasSimilar) {
                logger.info(`Skipping duplicate prep insight for: ${meeting.title}`);
                continue;
            }
            
            // Predict meeting outcome
            const prediction = await aiInsights.predictMeetingOutcome(meeting);
            
            // Only create insight if confidence is high enough
            if (prediction.confidence < 0.5) {
                logger.info(`Low confidence (${prediction.confidence}) for: ${meeting.title}`);
                continue;
            }
            
            const meetingTime = new Date(meeting.start?.dateTime || meeting.startTime);
            const hoursUntil = (meetingTime - new Date()) / (1000 * 60 * 60);
            
            const insight = {
                type: 'meeting_prep',
                priority: hoursUntil < 2 ? 'high' : 'medium',
                title: `Prep for ${meeting.title}`,
                description: `Meeting in ${Math.round(hoursUntil)}h. ${prediction.criticalPrep.length} prep items recommended.`,
                reasoning: `Based on ${prediction.confidence * 100}% confidence from similar past meetings`,
                actions: prediction.criticalPrep.slice(0, 3),
                confidence: prediction.confidence,
                metadata: {
                    meetingId,
                    meetingTitle: meeting.title,
                    meetingTime: meetingTime.toISOString(),
                    prediction
                }
            };
            
            await insightStore.storeInsight(insight);
            logger.info(`Created meeting prep insight: ${meeting.title}`);
            
        } catch (error) {
            logger.error(`Failed to generate prep insight for ${meeting.title}: ${error.message}`);
        }
    }
}

/**
 * Generate contextual insights from recent activity
 */
async function generateContextInsights(emails, meetings) {
    try {
        // Get last 7 days of data
        const now = new Date();
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        const recentEmails = emails.filter(e => {
            const emailDate = new Date(e.received || e.receivedDateTime || e.date);
            return emailDate > weekAgo;
        });
        
        const recentMeetings = meetings.filter(m => {
            const meetingDate = new Date(m.start?.dateTime || m.startTime || m.date);
            return meetingDate > weekAgo;
        });
        
        // Analyze time audit and relationships
        const timeAudit = await analyzeTimeAudit(recentEmails, recentMeetings, 7);
        const relationships = await analyzeRelationshipHealth(recentEmails, recentMeetings, 10);
        
        // Generate insights
        const insights = await aiInsights.generateContextualInsights({
            emails: recentEmails,
            meetings: recentMeetings,
            timeAudit,
            relationships
        });
        
        // Store high-value insights
        for (const insight of insights) {
            const hasSimilar = await insightStore.hasRecentSimilarInsight(
                insight.type,
                insight.title,
                24 // Within last 24 hours
            );
            
            if (!hasSimilar) {
                await insightStore.storeInsight(insight);
                logger.info(`Created contextual insight: ${insight.title}`);
            }
        }
        
    } catch (error) {
        logger.error(`Failed to generate contextual insights: ${error.message}`);
    }
}

/**
 * Generate email prioritization insights
 */
async function generateEmailPriorityInsights(emails) {
    try {
        // Get unread emails from last 24 hours
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentUnread = emails.filter(e => {
            const emailDate = new Date(e.received || e.receivedDateTime || e.date);
            return !e.isRead && emailDate > dayAgo;
        });
        
        if (recentUnread.length === 0) {
            logger.info('No recent unread emails to prioritize');
            return;
        }
        
        logger.info(`Analyzing ${recentUnread.length} unread emails`);
        
        // Score each email
        const scoredEmails = [];
        for (const email of recentUnread) {
            try {
                const relationshipContext = `From: ${email.from?.name || email.from}`;
                const score = await aiInsights.scoreEmailImportance(email, relationshipContext);
                
                if (score.importanceScore > 70) { // Only high-importance emails
                    scoredEmails.push({ email, score });
                }
            } catch (error) {
                logger.warn(`Failed to score email: ${error.message}`);
            }
        }
        
        if (scoredEmails.length > 0) {
            const topUrgent = scoredEmails
                .sort((a, b) => b.score.importanceScore - a.score.importanceScore)
                .slice(0, 3);
            
            const hasSimilar = await insightStore.hasRecentSimilarInsight(
                'urgent_emails',
                'Urgent emails need attention',
                6 // Within last 6 hours
            );
            
            if (!hasSimilar) {
                const insight = {
                    type: 'urgent_emails',
                    priority: 'high',
                    title: `${topUrgent.length} urgent email${topUrgent.length > 1 ? 's' : ''} need attention`,
                    description: topUrgent.map(e => 
                        `"${e.email.subject}" from ${e.email.from?.name || e.email.from}`
                    ).join(', '),
                    reasoning: 'AI-scored based on sender importance, content, and urgency keywords',
                    actions: topUrgent.map(e => `Review: ${e.email.subject}`),
                    confidence: 0.8,
                    metadata: {
                        emails: topUrgent.map(e => ({
                            id: e.email.id,
                            subject: e.email.subject,
                            from: e.email.from,
                            score: e.score.importanceScore
                        }))
                    }
                };
                
                await insightStore.storeInsight(insight);
                logger.info('Created urgent emails insight');
            }
        }
        
    } catch (error) {
        logger.error(`Failed to generate email priority insights: ${error.message}`);
    }
}

/**
 * Generate relationship health insights
 */
async function generateRelationshipInsights(emails, meetings) {
    try {
        const relationships = await analyzeRelationshipHealth(emails, meetings, 20);
        
        // Find declining relationships
        const atRisk = relationships.topRelationships.filter(r => 
            r.status === 'at-risk' && 
            r.daysSinceLastContact > 14 &&
            r.totalInteractions > 5 // Was previously active
        );
        
        for (const rel of atRisk.slice(0, 3)) { // Top 3 at-risk relationships
            const hasSimilar = await insightStore.hasRecentSimilarInsight(
                'relationship_alert',
                `Relationship alert: ${rel.name}`,
                48 // Within last 48 hours
            );
            
            if (!hasSimilar) {
                const insight = {
                    type: 'relationship_alert',
                    priority: 'medium',
                    title: `Relationship needs attention: ${rel.name}`,
                    description: `${rel.daysSinceLastContact} days since last contact. Previously had ${rel.totalInteractions} interactions.`,
                    reasoning: `Health score dropped to ${rel.healthScore}/100. Risk of relationship degradation.`,
                    actions: [
                        'Schedule a catch-up meeting',
                        'Send a quick check-in email',
                        'Add to next 1:1 agenda'
                    ],
                    confidence: 0.85,
                    metadata: {
                        person: rel.name,
                        email: rel.email,
                        healthScore: rel.healthScore,
                        daysSinceContact: rel.daysSinceLastContact
                    }
                };
                
                await insightStore.storeInsight(insight);
                logger.info(`Created relationship alert: ${rel.name}`);
            }
        }
        
    } catch (error) {
        logger.error(`Failed to generate relationship insights: ${error.message}`);
    }
}

/**
 * Generate weekly report (Mondays at 8 AM)
 */
async function generateWeeklyReportIfNeeded(emails, meetings) {
    try {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const hourOfDay = now.getHours();
        
        // Only run on Mondays between 8-9 AM
        if (dayOfWeek !== 1 || hourOfDay !== 8) {
            return;
        }
        
        const hasSimilar = await insightStore.hasRecentSimilarInsight(
            'weekly_report',
            'Weekly Insights Report',
            168 // Within last week
        );
        
        if (hasSimilar) {
            logger.info('Weekly report already generated');
            return;
        }
        
        logger.info('Generating weekly predictive report');
        
        // Get historical data (last 4 weeks)
        const historicalData = [];
        for (let i = 1; i <= 4; i++) {
            const weekEnd = new Date(now - (i - 1) * 7 * 24 * 60 * 60 * 1000);
            const weekStart = new Date(weekEnd - 7 * 24 * 60 * 60 * 1000);
            
            const weekEmails = emails.filter(e => {
                const d = new Date(e.received || e.receivedDateTime || e.date);
                return d >= weekStart && d < weekEnd;
            });
            
            const weekMeetings = meetings.filter(m => {
                const d = new Date(m.start?.dateTime || m.startTime || m.date);
                return d >= weekStart && d < weekEnd;
            });
            
            const timeAudit = await analyzeTimeAudit(weekEmails, weekMeetings, 7);
            historicalData.push({
                week: i,
                meetingHours: parseFloat(timeAudit.meetings.totalHours),
                deepWorkHours: parseFloat(timeAudit.deepWork.totalHours),
                emailVolume: weekEmails.length
            });
        }
        
        // Get upcoming calendar
        const nextWeekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcomingCalendar = meetings.filter(m => {
            const d = new Date(m.start?.dateTime || m.startTime);
            return d >= now && d < nextWeekEnd;
        });
        
        const prediction = await aiInsights.generateWeeklyPrediction(historicalData, upcomingCalendar);
        
        if (prediction) {
            const insight = {
                type: 'weekly_report',
                priority: 'medium',
                title: 'Weekly Insights Report',
                description: `Next week: ${prediction.prediction.meetingLoad} meeting load, ${prediction.prediction.deepWorkOpportunities} deep work opportunities`,
                reasoning: `Based on 4-week trend analysis with ${prediction.confidence * 100}% confidence`,
                actions: prediction.topRecommendations.slice(0, 3),
                confidence: prediction.confidence,
                metadata: {
                    prediction,
                    historicalData,
                    upcomingMeetings: upcomingCalendar.length
                }
            };
            
            await insightStore.storeInsight(insight);
            logger.info('Created weekly report insight');
        }
        
    } catch (error) {
        logger.error(`Failed to generate weekly report: ${error.message}`);
    }
}

/**
 * Get statistics about insight generation performance
 */
async function getInsightStats() {
    try {
        const stats = await insightStore.getStats(30);
        logger.info('Insight Stats (Last 30 days):', stats);
        return stats;
    } catch (error) {
        logger.error(`Failed to get insight stats: ${error.message}`);
        return null;
    }
}

module.exports = {
    runProactiveAnalysis,
    getInsightStats
};