/**
 * AI Insights Service
 * Generates proactive, predictive insights using LLMs and vector similarity
 */

const { createRequire } = require('module');
const require = createRequire(import.meta.url);

const logger = require('./logger').child('AIInsights');
const ollamaClient = require('./ollama-client');
const vectorStore = require('./vector-store');

/**
 * Predict meeting outcomes based on historical patterns
 */
async function predictMeetingOutcome(meeting) {
    try {
        logger.info(`Predicting outcome for meeting: ${meeting.title}`);
        
        // Generate embedding for meeting
        const meetingText = `${meeting.title} ${meeting.description || ''}`;
        const meetingEmbedding = await ollamaClient.embed(meetingText);
        
        // Find similar past meetings
        const similarMeetings = await vectorStore.searchByVector(meetingEmbedding, {
            filter: { type: 'meeting' },
            limit: 10,
            maxDistance: 1.0 // Similarity threshold
        });
        
        if (similarMeetings.length === 0) {
            logger.info('No similar meetings found, returning low confidence prediction');
            return {
                criticalPrep: ['Review meeting agenda', 'Check attendee backgrounds'],
                likelyQuestions: [],
                potentialDecisions: [],
                expectedFollowUps: [],
                confidence: 0.3
            };
        }
        
        // Build context from similar meetings
        const historicalContext = similarMeetings.map(m => `
- ${m.subject || m.title} (${m.date})
  Follow-ups: ${m.followUps || 'none'}
  Decisions: ${m.decisions || 'none'}
  Attendees: ${m.attendees?.length || 'unknown'}
        `).join('\n');
        
        const prompt = `You are an AI meeting assistant analyzing patterns to help prepare for an upcoming meeting.

UPCOMING MEETING:
Title: ${meeting.title}
Date: ${new Date(meeting.start?.dateTime || meeting.startTime).toLocaleString()}
Attendees: ${meeting.attendees?.length || 0}
Description: ${meeting.description || 'N/A'}

SIMILAR PAST MEETINGS:
${historicalContext}

Based on these patterns, predict what will likely happen in this meeting:

1. What preparation is MOST critical?
2. What questions are likely to come up?
3. What decisions might need to be made?
4. What follow-up actions should I expect?

Respond in JSON format:
{
  "criticalPrep": ["specific prep item 1", "specific prep item 2"],
  "likelyQuestions": ["question 1", "question 2"],
  "potentialDecisions": ["decision 1", "decision 2"],
  "expectedFollowUps": ["follow-up 1", "follow-up 2"],
  "confidence": 0.7
}

Only include high-probability items. Set confidence based on pattern strength (0.0-1.0).`;

        const response = await ollamaClient.generate(prompt, {
            temperature: 0.3,
            format: 'json'
        });
        
        const prediction = JSON.parse(response);
        logger.info(`Prediction confidence: ${prediction.confidence}`);
        
        return prediction;
        
    } catch (error) {
        logger.error(`Failed to predict meeting outcome: ${error.message}`);
        return {
            criticalPrep: [],
            likelyQuestions: [],
            potentialDecisions: [],
            expectedFollowUps: [],
            confidence: 0.0
        };
    }
}

/**
 * Generate contextual insights from recent activity
 */
async function generateContextualInsights(context) {
    try {
        const { emails, meetings, relationships, timeAudit } = context;
        
        logger.info('Generating contextual insights from recent activity');
        
        // Build rich context summary
        const contextSummary = `
=== RECENT ACTIVITY (Last 7 Days) ===

MEETINGS:
- Total: ${meetings.length} meetings (${timeAudit.meetings.totalHours}h)
- 1-on-1s: ${timeAudit.meetings.breakdown.oneOnOne}
- Balance: ${timeAudit.balance.assessment}
- Deep Work: ${timeAudit.deepWork.totalHours}h (${timeAudit.deepWork.percentageOfWorkDay}%)

EMAILS:
- Sent: ${emails.filter(e => e.isSent).length}
- Received: ${emails.filter(e => !e.isSent).length}

RELATIONSHIPS:
- Healthy: ${relationships.summary.healthy}
- At Risk: ${relationships.summary.atRisk}
${relationships.topRelationships.slice(0, 3).map(r => 
    `- ${r.name}: ${r.status} (${r.daysSinceLastContact}d since contact)`
).join('\n')}
        `;
        
        const prompt = `You are an AI executive assistant analyzing work patterns to generate proactive insights.

${contextSummary}

Generate 3-5 actionable insights that would help improve productivity, relationships, or work-life balance.

Focus on:
1. Patterns that indicate problems (e.g., declining relationships, meeting overload)
2. Predictions of upcoming challenges (e.g., burnout risk, missed connections)
3. Optimization opportunities (e.g., better time management)
4. Recognition of positive trends (e.g., improved balance)
5. Risks that need attention (e.g., at-risk relationships)

Respond in JSON array format:
[
  {
    "type": "warning|opportunity|achievement|prediction",
    "priority": "urgent|high|medium|low",
    "title": "Brief, actionable headline (max 60 chars)",
    "description": "2-3 sentence explanation of the insight",
    "reasoning": "Why this matters based on the data",
    "actions": ["specific actionable step 1", "specific actionable step 2"],
    "confidence": 0.85
  }
]

Only include insights with confidence > 0.7. Be specific and actionable.`;

        const response = await ollamaClient.generate(prompt, {
            temperature: 0.4,
            format: 'json'
        });
        
        const insights = JSON.parse(response);
        logger.info(`Generated ${insights.length} contextual insights`);
        
        return insights.filter(i => i.confidence > 0.7);
        
    } catch (error) {
        logger.error(`Failed to generate contextual insights: ${error.message}`);
        return [];
    }
}

/**
 * Predict potential blockers using historical patterns
 */
async function predictBlockers(currentWork) {
    try {
        logger.info('Predicting potential blockers from current work');
        
        const predictions = [];
        
        for (const workItem of currentWork) {
            const embedding = await ollamaClient.embed(workItem.description);
            
            // Find similar past work that had blockers
            const pastBlockers = await vectorStore.searchByVector(embedding, {
                filter: { hasBlocker: true },
                limit: 5,
                maxDistance: 0.8
            });
            
            if (pastBlockers.length === 0) continue;
            
            const blockerContext = pastBlockers.map(b => `
- "${b.subject}"
  Blocker: ${b.blockerDescription || 'dependency issue'}
  Resolution: ${b.resolutionDays || 'unknown'} days
            `).join('\n');
            
            const prompt = `You are analyzing work patterns to predict potential blockers.

CURRENT WORK:
${workItem.description}

SIMILAR PAST WORK THAT HAD BLOCKERS:
${blockerContext}

Assess the risk of similar blockers occurring:

{
  "riskScore": 0.75,
  "likelyBlocker": "specific description of what might block progress",
  "mitigationSteps": ["preventive step 1", "preventive step 2"],
  "earlyWarningSign": "what to watch for as an early indicator"
}

Only predict if risk is significant (>0.6). Be specific about the blocker.`;

            const response = await ollamaClient.generate(prompt, {
                temperature: 0.2,
                format: 'json'
            });
            
            const prediction = JSON.parse(response);
            
            if (prediction.riskScore > 0.6) {
                predictions.push({
                    workStream: workItem.description,
                    ...prediction
                });
            }
        }
        
        logger.info(`Predicted ${predictions.length} potential blockers`);
        return predictions;
        
    } catch (error) {
        logger.error(`Failed to predict blockers: ${error.message}`);
        return [];
    }
}

/**
 * Score email importance using AI and historical context
 */
async function scoreEmailImportance(email, relationshipContext) {
    try {
        const emailText = `${email.subject} ${email.body?.substring(0, 500)}`;
        const embedding = await ollamaClient.embed(emailText);
        
        // Find similar past emails
        const similarPast = await vectorStore.searchByVector(embedding, {
            filter: { type: 'email' },
            limit: 10
        });
        
        const historicalContext = similarPast.map(e => `
- "${e.subject}"
  Was urgent: ${e.markedUrgent || false}
  Response time: ${e.responseTimeHours || 'unknown'}h
  Had follow-up: ${e.hadFollowup || false}
        `).join('\n');
        
        const prompt = `Analyze this email's importance and urgency.

NEW EMAIL:
From: ${email.from?.name || email.from}
Subject: ${email.subject}
Preview: ${email.body?.substring(0, 200)}...

SIMILAR PAST EMAILS:
${historicalContext}

RELATIONSHIP CONTEXT:
${relationshipContext}

Score this email's importance (0-100) considering:
- Sender's importance (relationship health)
- Content urgency keywords
- Similarity to past urgent emails
- Upcoming meeting relevance

{
  "importanceScore": 75,
  "urgencyLevel": "high",
  "reasoning": "specific reason for this score",
  "suggestedAction": "immediate|today|this_week|when_time",
  "relatedUpcomingMeetings": ["meeting title if relevant"],
  "confidence": 0.8
}`;

        const response = await ollamaClient.generate(prompt, {
            temperature: 0.3,
            format: 'json'
        });
        
        return JSON.parse(response);
        
    } catch (error) {
        logger.error(`Failed to score email importance: ${error.message}`);
        return {
            importanceScore: 50,
            urgencyLevel: 'medium',
            reasoning: 'Unable to analyze',
            suggestedAction: 'when_time',
            confidence: 0.0
        };
    }
}

/**
 * Generate predictive weekly report
 */
async function generateWeeklyPrediction(historicalData, upcomingCalendar) {
    try {
        logger.info('Generating predictive weekly report');
        
        const prompt = `You are analyzing work patterns to predict next week's challenges and opportunities.

=== HISTORICAL TRENDS (Last 4 Weeks) ===
${JSON.stringify(historicalData, null, 2)}

=== NEXT WEEK'S SCHEDULE ===
Total meetings scheduled: ${upcomingCalendar.length}
${upcomingCalendar.slice(0, 5).map(m => `- ${m.title} @ ${m.start}`).join('\n')}

Predict next week based on trends:

{
  "prediction": {
    "meetingLoad": "heavier|similar|lighter than average",
    "deepWorkOpportunities": "abundant|limited|scarce",
    "emailVolume": "increase|steady|decrease"
  },
  "risks": [
    {
      "risk": "specific risk description",
      "likelihood": 0.75,
      "mitigation": "specific mitigation action"
    }
  ],
  "opportunities": [
    {
      "opportunity": "specific opportunity",
      "impact": "high|medium|low"
    }
  ],
  "topRecommendations": [
    "specific recommendation with reasoning"
  ],
  "confidence": 0.8
}`;

        const response = await ollamaClient.generate(prompt, {
            temperature: 0.4,
            format: 'json'
        });
        
        return JSON.parse(response);
        
    } catch (error) {
        logger.error(`Failed to generate weekly prediction: ${error.message}`);
        return null;
    }
}

module.exports = {
    predictMeetingOutcome,
    generateContextualInsights,
    predictBlockers,
    scoreEmailImportance,
    generateWeeklyPrediction
};