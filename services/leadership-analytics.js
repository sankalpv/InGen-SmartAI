/**
 * Leadership Analytics Service
 * Provides insights for senior leaders: time audit, relationship health,
 * action items, blockers, decisions, and leadership style analysis
 */

const logger = require('./logger').child('Leadership');
const ollamaClient = require('./ollama-client');

// Cache for embeddings to avoid redundant computation
const embeddingCache = new Map();

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
        throw new Error('Vectors must have same length');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Check if a meeting is a 1x1 using semantic similarity
 */
async function isOneOnOneBySemantic(meetingTitle) {
    try {
        // Reference 1x1 meeting patterns
        const reference1x1Patterns = [
            "one-on-one meeting",
            "1:1 discussion",
            "weekly 1:1",
            "biweekly one on one",
            "individual meeting between two people",
            "personal check-in meeting"
        ];
        
        // Get embedding for the meeting title
        const cacheKey = meetingTitle.toLowerCase();
        let titleEmbedding;
        
        if (embeddingCache.has(cacheKey)) {
            titleEmbedding = embeddingCache.get(cacheKey);
        } else {
            titleEmbedding = await ollamaClient.embed(meetingTitle);
            embeddingCache.set(cacheKey, titleEmbedding);
        }
        
        // Get embeddings for reference patterns and compute max similarity
        let maxSimilarity = 0;
        
        for (const pattern of reference1x1Patterns) {
            const patternKey = pattern.toLowerCase();
            let patternEmbedding;
            
            if (embeddingCache.has(patternKey)) {
                patternEmbedding = embeddingCache.get(patternKey);
            } else {
                patternEmbedding = await ollamaClient.embed(pattern);
                embeddingCache.set(patternKey, patternEmbedding);
            }
            
            const similarity = cosineSimilarity(titleEmbedding, patternEmbedding);
            maxSimilarity = Math.max(maxSimilarity, similarity);
        }
        
        // Threshold: 0.7 similarity indicates likely 1x1
        return maxSimilarity >= 0.7;
    } catch (error) {
        logger.warn(`Semantic 1x1 detection failed for "${meetingTitle}": ${error.message}`);
        return false;
    }
}

/**
 * TIME AUDIT: Analyze how time is spent
 */
async function analyzeTimeAudit(emails, meetings, dateRange = 7) {
    const now = new Date();
    const startDate = new Date(now - dateRange * 24 * 60 * 60 * 1000);

    // Debug logging
    logger.info(`[TimeAudit] Analyzing ${meetings.length} total meetings`);
    logger.info(`[TimeAudit] Date range: ${startDate.toISOString()} to ${now.toISOString()}`);

    // Filter to date range AND (busy/tentative status OR has 1:1 in title)
    const recentMeetings = meetings.filter(m => {
        const meetingDate = new Date(m.start?.dateTime || m.startTime || m.date);
        const isInRange = meetingDate >= startDate && meetingDate <= now;
        const status = (m.busyStatus || 'busy').toLowerCase();
        const isValidStatus = status === 'busy' || status === 'tentative';
        
        // Check if title indicates a 1:1 meeting
        const title = (m.title || m.subject || '').toLowerCase();
        const is1on1Title = title.includes('1:1') || 
                           title.includes('1-on-1') || 
                           title.includes('one-on-one') ||
                           title.includes('1 on 1') ||
                           title.includes('biweekly 1:1') ||
                           title.includes('bi-weekly 1:1') ||
                           title.includes('weekly 1:1') ||
                           // Pattern: "Name/Sankalp" or "Sankalp/Name" or "Name - Sankalp"
                           (title.includes('/') && title.includes('sankalp')) ||
                           (title.match(/\w+\s*-\s*sankalp/i) || title.match(/sankalp\s*-\s*\w+/i));
        
        // Include if: in range AND (valid status OR is a 1:1 by title)
        const shouldInclude = isInRange && (isValidStatus || is1on1Title);
        
        logger.info(`[TimeAudit] Meeting "${m.title}" - Date: ${meetingDate.toISOString()}, In Range: ${isInRange}, Status: ${status}, Valid: ${isValidStatus}, Is1x1Title: ${is1on1Title}, Include: ${shouldInclude}`);
        
        return shouldInclude;
    });

    logger.info(`[TimeAudit] Found ${recentMeetings.length} BUSY/TENTATIVE meetings in last ${dateRange} days`);

    const recentEmails = emails.filter(e => {
        const emailDate = new Date(e.received || e.receivedDateTime || e.date);
        return emailDate >= startDate;
    });

    // Meeting Analysis
    let totalMeetingMinutes = 0;
    const meetingsByType = {
        '1on1': [],
        'small_group': [], // 2-5 people
        'large_meeting': [], // 6+ people
        'all_hands': [] // 20+ people
    };

    // Use async/await for semantic similarity checks
    const categorizationPromises = recentMeetings.map(async (meeting) => {
        const duration = calculateDuration(
            meeting.start?.dateTime || meeting.startTime,
            meeting.end?.dateTime || meeting.endTime
        );
        totalMeetingMinutes += duration;

        const attendeeCount = (meeting.attendees || []).length + 1; // +1 for self
        const title = (meeting.title || meeting.subject || '').toLowerCase();
        
        // Check if title indicates a 1:1 meeting using pattern matching
        const is1on1Title = title.includes('1:1') || 
                           title.includes('1-on-1') || 
                           title.includes('one-on-one') ||
                           title.includes('1 on 1');
        
        // If pattern matching fails but attendee count is ambiguous (3-4 people), use semantic similarity
        let isSemantic1x1 = false;
        if (!is1on1Title && attendeeCount >= 2 && attendeeCount <= 4) {
            try {
                isSemantic1x1 = await isOneOnOneBySemantic(meeting.title || meeting.subject || '');
            } catch (error) {
                logger.warn(`Semantic check failed for "${meeting.title}": ${error.message}`);
            }
        }
        
        const is1x1 = is1on1Title || attendeeCount <= 2 || isSemantic1x1;
        
        logger.info(`[TimeAudit] Meeting "${meeting.title}" - Attendees: ${(meeting.attendees || []).length}, With Self: ${attendeeCount}, Is1x1Title: ${is1on1Title}, Semantic1x1: ${isSemantic1x1}, Final1x1: ${is1x1}`);
        
        return { meeting, duration, attendeeCount, is1x1 };
    });

    // Wait for all categorizations to complete
    const categorizedMeetings = await Promise.all(categorizationPromises);
    
    // Now categorize based on results
    categorizedMeetings.forEach(({ meeting, is1x1, attendeeCount }) => {
        if (is1x1) {
            meetingsByType['1on1'].push(meeting);
        } else if (attendeeCount <= 5) {
            meetingsByType['small_group'].push(meeting);
        } else if (attendeeCount <= 20) {
            meetingsByType['large_meeting'].push(meeting);
        } else {
            meetingsByType['all_hands'].push(meeting);
        }
    });

    logger.info(`[TimeAudit] Meeting categorization: 1x1=${meetingsByType['1on1'].length}, Small=${meetingsByType['small_group'].length}, Large=${meetingsByType['large_meeting'].length}, All-Hands=${meetingsByType['all_hands'].length}`);

    // Email Analysis
    const emailsSent = recentEmails.filter(e => e.isSent === true || e.folder === 'Sent Items');
    const emailsReceived = recentEmails.filter(e => e.isSent === false || e.folder === 'Inbox');

    // Calculate deep work time (gaps between meetings)
    const deepWorkMinutes = calculateDeepWorkTime(recentMeetings, dateRange);

    return {
        dateRange,
        meetings: {
            total: recentMeetings.length,
            totalHours: (totalMeetingMinutes / 60).toFixed(1),
            avgPerDay: (recentMeetings.length / dateRange).toFixed(1),
            breakdown: {
                oneOnOne: meetingsByType['1on1'].length,
                smallGroup: meetingsByType['small_group'].length,
                largeMeeting: meetingsByType['large_meeting'].length,
                allHands: meetingsByType['all_hands'].length
            },
            hoursPerType: {
                oneOnOne: (meetingsByType['1on1'].reduce((sum, m) => sum + calculateDuration(m.start?.dateTime || m.startTime, m.end?.dateTime || m.endTime), 0) / 60).toFixed(1),
                smallGroup: (meetingsByType['small_group'].reduce((sum, m) => sum + calculateDuration(m.start?.dateTime || m.startTime, m.end?.dateTime || m.endTime), 0) / 60).toFixed(1),
                largeMeeting: (meetingsByType['large_meeting'].reduce((sum, m) => sum + calculateDuration(m.start?.dateTime || m.startTime, m.end?.dateTime || m.endTime), 0) / 60).toFixed(1),
                allHands: (meetingsByType['all_hands'].reduce((sum, m) => sum + calculateDuration(m.start?.dateTime || m.startTime, m.end?.dateTime || m.endTime), 0) / 60).toFixed(1)
            }
        },
        email: {
            sent: emailsSent.length,
            received: emailsReceived.length,
            avgSentPerDay: (emailsSent.length / dateRange).toFixed(1),
            avgReceivedPerDay: (emailsReceived.length / dateRange).toFixed(1)
        },
        deepWork: {
            totalHours: (deepWorkMinutes / 60).toFixed(1),
            avgPerDay: (deepWorkMinutes / dateRange / 60).toFixed(1),
            percentageOfWorkDay: ((deepWorkMinutes / (dateRange * 8 * 60)) * 100).toFixed(1)
        },
        balance: {
            meetingToDeepWorkRatio: (totalMeetingMinutes / (deepWorkMinutes || 1)).toFixed(2),
            assessment: assessTimeBalance(totalMeetingMinutes, deepWorkMinutes, dateRange)
        }
    };
}

/**
 * RELATIONSHIP HEALTH: Track communication patterns with key people
 */
function analyzeRelationshipHealth(emails, meetings, topN = 10) {
    const relationshipMap = new Map();
    
    logger.info(`[Relationships] Analyzing ${emails.length} emails and ${meetings.length} meetings`);

    // Process emails
    emails.forEach(email => {
        const contacts = [];
        
        // Sender (for received emails)
        if (email.from && !email.isSent) {
            const emailAddr = email.from.emailAddress?.address || email.from.address || email.from.email || email.from;
            const name = email.from.emailAddress?.name || email.from.name || emailAddr.split('@')[0];
            contacts.push({ email: emailAddr, name });
        }

        // Recipients (for sent emails)
        if (email.isSent && email.to) {
            const recipients = Array.isArray(email.to) ? email.to : [email.to];
            recipients.forEach(r => {
                const emailAddr = r.emailAddress?.address || r.address || r.email || r;
                const name = r.emailAddress?.name || r.name || emailAddr.split('@')[0];
                contacts.push({ email: emailAddr, name });
            });
        }

        contacts.forEach(contact => {
            // Ensure email is a string before checking
            const emailStr = typeof contact.email === 'string' ? contact.email : String(contact.email || '');
            if (!emailStr || emailStr.includes('noreply') || emailStr.includes('no-reply') || emailStr === 'me') {
                return;
            }

            if (!relationshipMap.has(emailStr)) {
                relationshipMap.set(emailStr, {
                    email: emailStr,
                    name: contact.name || emailStr.split('@')[0],
                    emailsSent: 0,
                    emailsReceived: 0,
                    lastContact: null,
                    meetingsTogether: 0,
                    responseTimeHours: []
                });
            }

            const relationship = relationshipMap.get(emailStr);
            
            // Update name if we got a better one
            if (contact.name && contact.name !== emailStr && !contact.name.includes('@')) {
                relationship.name = contact.name;
            }
            
            if (email.isSent) {
                relationship.emailsSent++;
            } else {
                relationship.emailsReceived++;
            }

            const emailDate = new Date(email.received || email.receivedDateTime || email.date);
            if (!relationship.lastContact || emailDate > relationship.lastContact) {
                relationship.lastContact = emailDate;
            }
        });
    });

    logger.info(`[Relationships] Found ${relationshipMap.size} unique contacts from emails`);

    // Process meetings - extract attendee info more thoroughly
    meetings.forEach(meeting => {
        const attendees = meeting.attendees || [];
        
        // Try to extract attendee emails/names from various formats
        attendees.forEach(attendee => {
            let email = null;
            let name = null;
            
            // Handle different attendee formats
            if (typeof attendee === 'object') {
                email = attendee.emailAddress?.address || attendee.address || attendee.email;
                name = attendee.emailAddress?.name || attendee.name;
            } else if (typeof attendee === 'string') {
                email = attendee;
            }
            
            if (!email) return;
            
            // Initialize or update relationship
            if (!relationshipMap.has(email)) {
                relationshipMap.set(email, {
                    email,
                    name: name || email.split('@')[0],
                    emailsSent: 0,
                    emailsReceived: 0,
                    lastContact: null,
                    meetingsTogether: 0,
                    responseTimeHours: []
                });
            }
            
            const relationship = relationshipMap.get(email);
            relationship.meetingsTogether++;
            
            // Update name if we got a better one
            if (name && name !== email && !name.includes('@')) {
                relationship.name = name;
            }
            
            // Update last contact from meeting
            const meetingDate = new Date(meeting.start?.dateTime || meeting.startTime || meeting.date);
            if (!relationship.lastContact || meetingDate > relationship.lastContact) {
                relationship.lastContact = meetingDate;
            }
        });
    });
    
    logger.info(`[Relationships] Total unique contacts after meetings: ${relationshipMap.size}`);

    // Calculate health scores
    const relationships = Array.from(relationshipMap.values())
        .filter(r => r.emailsSent + r.emailsReceived > 1) // At least 2 interactions
        .map(r => {
            const totalInteractions = r.emailsSent + r.emailsReceived + r.meetingsTogether;
            const daysSinceLastContact = r.lastContact 
                ? Math.floor((Date.now() - r.lastContact.getTime()) / (1000 * 60 * 60 * 24))
                : 999;
            
            // Health score (0-100)
            let healthScore = 50; // Base score
            
            // Boost for recent contact
            if (daysSinceLastContact <= 3) healthScore += 30;
            else if (daysSinceLastContact <= 7) healthScore += 20;
            else if (daysSinceLastContact <= 14) healthScore += 10;
            else if (daysSinceLastContact > 30) healthScore -= 20;
            
            // Boost for frequency
            if (totalInteractions > 20) healthScore += 20;
            else if (totalInteractions > 10) healthScore += 10;
            
            // Balance bonus (bidirectional communication)
            const balance = Math.min(r.emailsSent, r.emailsReceived) / Math.max(r.emailsSent, r.emailsReceived, 1);
            healthScore += balance * 10;

            healthScore = Math.max(0, Math.min(100, healthScore));

            return {
                ...r,
                totalInteractions,
                daysSinceLastContact,
                healthScore: Math.round(healthScore),
                status: getRelationshipStatus(healthScore, daysSinceLastContact)
            };
        })
        .sort((a, b) => b.totalInteractions - a.totalInteractions)
        .slice(0, topN);

    return {
        topRelationships: relationships,
        summary: {
            total: relationshipMap.size,
            healthy: relationships.filter(r => r.healthScore >= 70).length,
            atRisk: relationships.filter(r => r.healthScore < 50).length,
            avgHealthScore: Math.round(
                relationships.reduce((sum, r) => sum + r.healthScore, 0) / relationships.length
            )
        }
    };
}

/**
 * ACTION ITEMS: Extract and intelligently categorize action items
 * Groups by timeline, owner, and project for executive-level clarity
 */
async function extractActionItems(emails, meetings) {
    const actionItems = [];
    const actionKeywords = [
        'todo', 'to-do', 'action item', 'follow up', 'will do',
        'need to', 'should', 'must', 'deadline', 'by end of',
        'by eod', 'by eow', 'by friday', 'assigned to', 'please',
        'can you', 'could you', 'review', 'approve', 'schedule',
        'update', 'send', 'share', 'prepare', 'finalize'
    ];

    const deadlineKeywords = {
        'by eod': 0, 'by end of day': 0, 'today': 0,
        'by tomorrow': 1, 'tomorrow': 1,
        'by friday': null, 'by eow': null, 'end of week': null, 'this week': null,
        'next week': 7, 'by monday': null
    };

    // Extract from emails with richer metadata
    emails.forEach(email => {
        const body = (email.body || email.snippet || '').toLowerCase();
        const subject = (email.subject || '').toLowerCase();
        const fullText = `${subject} ${body}`;
        const hasActionKeyword = actionKeywords.some(keyword => fullText.includes(keyword));

        if (hasActionKeyword) {
            // Determine if this is assigned TO me or BY me
            const isSent = email.isSent === true || email.folder === 'Sent Items';
            const owner = isSent ? 'delegated' : 'assigned_to_me';

            // Extract deadline hints
            let deadline = null;
            let deadlineLabel = null;
            for (const [keyword, daysOffset] of Object.entries(deadlineKeywords)) {
                if (fullText.includes(keyword)) {
                    if (daysOffset !== null) {
                        const d = new Date();
                        d.setDate(d.getDate() + daysOffset);
                        deadline = d.toISOString();
                        deadlineLabel = keyword;
                    } else {
                        deadlineLabel = keyword;
                    }
                    break;
                }
            }

            // Classify the action type
            let actionType = 'general';
            if (fullText.includes('review') || fullText.includes('approve')) actionType = 'review';
            else if (fullText.includes('schedule') || fullText.includes('meeting')) actionType = 'schedule';
            else if (fullText.includes('send') || fullText.includes('share') || fullText.includes('forward')) actionType = 'communicate';
            else if (fullText.includes('prepare') || fullText.includes('finalize') || fullText.includes('update')) actionType = 'create';
            else if (fullText.includes('follow up') || fullText.includes('check')) actionType = 'follow_up';

            // Extract the actual action sentence (find the sentence with the keyword)
            const sentences = (email.body || email.snippet || '').split(/[.!?\n]+/);
            let actionSentence = '';
            for (const sentence of sentences) {
                const lower = sentence.toLowerCase().trim();
                if (actionKeywords.some(k => lower.includes(k)) && lower.length > 10 && lower.length < 200) {
                    actionSentence = sentence.trim();
                    break;
                }
            }

            actionItems.push({
                id: `email-${email.id}`,
                source: 'email',
                sourceId: email.id,
                subject: email.subject,
                action: actionSentence || (email.body || email.snippet || '').substring(0, 150),
                from: email.from?.name || email.from?.address || 'Unknown',
                date: email.received || email.receivedDateTime || email.date,
                urgency: determineUrgency(email),
                owner,
                actionType,
                deadline,
                deadlineLabel,
                status: 'open'
            });
        }
    });

    // Extract from meetings
    meetings.forEach(meeting => {
        const description = (meeting.description || meeting.body || '').toLowerCase();
        const title = (meeting.title || meeting.subject || '').toLowerCase();
        const fullText = `${title} ${description}`;
        const hasActionKeyword = actionKeywords.some(keyword => fullText.includes(keyword));

        if (hasActionKeyword) {
            actionItems.push({
                id: `meeting-${meeting.id}`,
                source: 'meeting',
                sourceId: meeting.id,
                subject: meeting.title || meeting.subject,
                action: (meeting.description || meeting.body || '').substring(0, 150),
                from: 'Meeting',
                date: meeting.start?.dateTime || meeting.startTime || meeting.date,
                urgency: 'medium',
                owner: 'from_meeting',
                actionType: 'follow_up',
                deadline: null,
                deadlineLabel: null,
                status: 'open'
            });
        }
    });

    // Sort by urgency then date
    const sorted = actionItems.sort((a, b) => {
        const urgencyOrder = { high: 0, medium: 1, low: 2 };
        const ua = urgencyOrder[a.urgency] ?? 1;
        const ub = urgencyOrder[b.urgency] ?? 1;
        if (ua !== ub) return ua - ub;
        return new Date(b.date) - new Date(a.date);
    });

    // Group by timeline
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + (7 - today.getDay()));

    const byTimeline = {
        overdue: sorted.filter(i => i.deadline && new Date(i.deadline) < now),
        today: sorted.filter(i => {
            const d = new Date(i.date);
            return d >= today && d < tomorrow;
        }),
        thisWeek: sorted.filter(i => {
            const d = new Date(i.date);
            return d >= tomorrow && d <= weekEnd;
        }),
        older: sorted.filter(i => {
            const d = new Date(i.date);
            return d < today;
        })
    };

    // Group by owner type
    const byOwner = {
        assigned_to_me: sorted.filter(i => i.owner === 'assigned_to_me'),
        delegated: sorted.filter(i => i.owner === 'delegated'),
        from_meeting: sorted.filter(i => i.owner === 'from_meeting')
    };

    // Group by action type
    const byActionType = {};
    sorted.forEach(item => {
        if (!byActionType[item.actionType]) byActionType[item.actionType] = [];
        byActionType[item.actionType].push(item);
    });

    return {
        items: sorted,
        byTimeline,
        byOwner,
        byActionType,
        summary: {
            total: actionItems.length,
            byUrgency: {
                high: actionItems.filter(i => i.urgency === 'high').length,
                medium: actionItems.filter(i => i.urgency === 'medium').length,
                low: actionItems.filter(i => i.urgency === 'low').length
            },
            bySource: {
                email: actionItems.filter(i => i.source === 'email').length,
                meeting: actionItems.filter(i => i.source === 'meeting').length
            },
            byOwner: {
                assignedToMe: byOwner.assigned_to_me.length,
                delegated: byOwner.delegated.length,
                fromMeeting: byOwner.from_meeting.length
            },
            byActionType: Object.fromEntries(
                Object.entries(byActionType).map(([k, v]) => [k, v.length])
            ),
            withDeadline: sorted.filter(i => i.deadlineLabel).length,
            overdue: byTimeline.overdue.length
        }
    };
}

/**
 * BLOCKER DETECTION: Identify blockers mentioned in communications
 */
function detectBlockers(emails, meetings) {
    const blockers = [];
    const blockerKeywords = [
        'blocked', 'blocker', 'stuck', 'waiting for', 'waiting on',
        'dependency', 'depends on', 'pending', 'issue', 'problem',
        'risk', 'concern', 'challenge', 'obstacle'
    ];

    // Analyze emails
    emails.forEach(email => {
        const body = (email.body || email.snippet || '').toLowerCase();
        const matchedKeywords = blockerKeywords.filter(keyword => body.includes(keyword));

        if (matchedKeywords.length > 0) {
            blockers.push({
                id: `email-${email.id}`,
                source: 'email',
                subject: email.subject,
                from: email.from?.name || email.from?.address || 'Unknown',
                date: email.received || email.receivedDateTime || email.date,
                snippet: (email.body || email.snippet || '').substring(0, 200),
                keywords: matchedKeywords,
                severity: matchedKeywords.includes('blocked') || matchedKeywords.includes('blocker') ? 'high' : 'medium'
            });
        }
    });

    // Analyze meetings
    meetings.forEach(meeting => {
        const description = (meeting.description || meeting.body || '').toLowerCase();
        const matchedKeywords = blockerKeywords.filter(keyword => description.includes(keyword));

        if (matchedKeywords.length > 0) {
            blockers.push({
                id: `meeting-${meeting.id}`,
                source: 'meeting',
                subject: meeting.title || meeting.subject,
                date: meeting.start?.dateTime || meeting.startTime || meeting.date,
                snippet: (meeting.description || meeting.body || '').substring(0, 200),
                keywords: matchedKeywords,
                severity: 'medium'
            });
        }
    });

    return {
        blockers: blockers.sort((a, b) => {
            if (a.severity !== b.severity) {
                return a.severity === 'high' ? -1 : 1;
            }
            return new Date(b.date) - new Date(a.date);
        }),
        summary: {
            total: blockers.length,
            high: blockers.filter(b => b.severity === 'high').length,
            medium: blockers.filter(b => b.severity === 'medium').length,
            bySource: {
                email: blockers.filter(b => b.source === 'email').length,
                meeting: blockers.filter(b => b.source === 'meeting').length
            }
        }
    };
}

/**
 * DECISION TRACKING: Track decisions made in communications
 */
function trackDecisions(emails, meetings) {
    const decisions = [];
    const decisionKeywords = [
        'decided', 'decision', 'agreed', 'approve', 'approved',
        'go ahead', 'greenlight', 'sign off', 'confirmed',
        'final decision', 'we will', 'going with'
    ];

    // Analyze emails
    emails.forEach(email => {
        const body = (email.body || email.snippet || '').toLowerCase();
        const matchedKeywords = decisionKeywords.filter(keyword => body.includes(keyword));

        if (matchedKeywords.length > 0) {
            decisions.push({
                id: `email-${email.id}`,
                source: 'email',
                subject: email.subject,
                from: email.from?.name || email.from?.address || 'Unknown',
                date: email.received || email.receivedDateTime || email.date,
                snippet: (email.body || email.snippet || '').substring(0, 200),
                keywords: matchedKeywords
            });
        }
    });

    // Analyze meetings
    meetings.forEach(meeting => {
        const description = (meeting.description || meeting.body || '').toLowerCase();
        const matchedKeywords = decisionKeywords.filter(keyword => description.includes(keyword));

        if (matchedKeywords.length > 0) {
            decisions.push({
                id: `meeting-${meeting.id}`,
                source: 'meeting',
                subject: meeting.title || meeting.subject,
                date: meeting.start?.dateTime || meeting.startTime || meeting.date,
                snippet: (meeting.description || meeting.body || '').substring(0, 200),
                keywords: matchedKeywords
            });
        }
    });

    return {
        decisions: decisions.sort((a, b) => new Date(b.date) - new Date(a.date)),
        summary: {
            total: decisions.length,
            thisWeek: decisions.filter(d => {
                const decisionDate = new Date(d.date);
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                return decisionDate >= weekAgo;
            }).length,
            bySource: {
                email: decisions.filter(d => d.source === 'email').length,
                meeting: decisions.filter(d => d.source === 'meeting').length
            }
        }
    };
}

// Helper Functions

function calculateDuration(start, end) {
    if (!start || !end) return 30; // Default 30 min
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate - startDate) / (1000 * 60));
}

function calculateDeepWorkTime(meetings, dateRange) {
    // Simple and accurate calculation: Total work time minus meeting time
    const totalWorkMinutes = dateRange * 8 * 60; // Assume 8-hour workdays
    
    if (meetings.length === 0) return totalWorkMinutes;
    
    // Calculate total meeting time
    let totalMeetingMinutes = 0;
    meetings.forEach(m => {
        const start = new Date(m.start?.dateTime || m.startTime);
        const end = new Date(m.end?.dateTime || m.endTime);
        const duration = Math.round((end - start) / (1000 * 60));
        totalMeetingMinutes += duration;
    });
    
    // Deep work = Total work time - Meeting time
    const deepWorkMinutes = Math.max(0, totalWorkMinutes - totalMeetingMinutes);
    
    return deepWorkMinutes;
}

function assessTimeBalance(meetingMinutes, deepWorkMinutes, dateRange) {
    const meetingPercentage = (meetingMinutes / (dateRange * 8 * 60)) * 100;
    
    if (meetingPercentage > 70) {
        return 'meeting-heavy';
    } else if (meetingPercentage > 50) {
        return 'balanced';
    } else if (meetingPercentage > 30) {
        return 'deep-work-focused';
    } else {
        return 'minimal-meetings';
    }
}

function getRelationshipStatus(healthScore, daysSinceLastContact) {
    if (healthScore >= 70 && daysSinceLastContact <= 7) {
        return 'healthy';
    } else if (healthScore >= 50 || daysSinceLastContact <= 14) {
        return 'stable';
    } else if (healthScore >= 30 || daysSinceLastContact <= 30) {
        return 'at-risk';
    } else {
        return 'neglected';
    }
}

function determineUrgency(email) {
    const body = (email.body || email.snippet || '').toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    
    const urgentKeywords = ['urgent', 'asap', 'immediate', 'critical', 'emergency'];
    const highPriorityKeywords = ['deadline', 'by eod', 'by today', 'by tomorrow'];
    
    if (urgentKeywords.some(k => subject.includes(k) || body.includes(k))) {
        return 'high';
    } else if (highPriorityKeywords.some(k => body.includes(k))) {
        return 'medium';
    }
    
    return 'low';
}

// CommonJS exports (compatible with both Next.js API routes and standalone Node.js)
module.exports = {
    analyzeTimeAudit,
    analyzeRelationshipHealth,
    extractActionItems,
    detectBlockers,
    trackDecisions
};
