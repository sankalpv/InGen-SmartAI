/**
 * Issues Parser — Extracts structured metadata from Issues folder emails
 * 
 * Parses SIM tickets, Taskei tasks, and CloudWatch alarms from Outlook
 * "Issues" folder emails into the normalized SQLite schema.
 * 
 * Runs entirely on cached email data — never touches Outlook directly.
 */

const crypto = require('crypto');
const logger = require('./logger').child('IssuesParser');
const issuesStore = require('./issues-store');

// ─── Issue Type Detection ───

function detectIssueType(subject, body) {
    const text = `${subject} ${body}`.toLowerCase();
    if (text.includes('view in taskei') || text.includes('taskei.amazon.dev')) return 'taskei';
    if (text.includes('[alarm]') || text.includes('cloudwatch alarm') || text.includes('entered the "alarm" state')) return 'alarm';
    if (text.includes('status:') && (text.includes('impact:') || text.includes('next step:') || text.includes('resolver group'))) return 'sim';
    if (text.includes('sim-') || text.includes('tt/')) return 'sim';
    return 'unknown';
}

// ─── Field Extractors ───

function extractStatus(body) {
    // "Status: Work In Progress (Impact: 3)"
    // "Status: Open		Next step: Comment by resolver"
    // "Status: Assigned (Impact: 3)"
    const match = body.match(/Status:\s*([^\t\n(]+)/i);
    if (match) return match[1].trim();
    return null;
}

function extractImpact(body) {
    const match = body.match(/\(Impact:\s*(\d)\)/i) || body.match(/Impact:\s*(\d)/i);
    if (match) return parseInt(match[1]);
    // Also check for Sev patterns
    const sevMatch = body.match(/Sev-?(\d)/i);
    if (sevMatch) return parseInt(sevMatch[1]);
    return null;
}

function extractAssignee(body) {
    // "Assignee: adaliep" or "Assignee: 4f753ab2-7584-4830-9451-c6ac81fb19f7"
    const match = body.match(/Assignee:\s*(\S+)/i);
    if (match) {
        const raw = match[1].trim();
        // Check if it's a UUID (not an alias)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(raw);
        return {
            alias: isUUID ? null : raw,
            raw: raw
        };
    }
    return { alias: null, raw: null };
}

/**
 * Extract the owner alias from the email subject's first word.
 * Email subjects typically start with the alias: "adaliep commented on ..."
 * This is the person most recently acting on the issue, which may differ from the assignee.
 * Falls back to the assignee if subject parsing fails.
 */
function extractOwnerFromSubject(subject) {
    if (!subject) return null;
    // The first word of the subject is typically the alias
    // e.g., "adaliep commented on [MVP] Create Drift Signal Store..."
    const match = subject.match(/^([a-zA-Z][a-zA-Z0-9_-]{1,20})\s+(?:commented|edited|created|assigned|resolved|reopened|closed|set)\b/i);
    if (match) {
        const alias = match[1].trim();
        // Exclude known non-person actors
        if (alias === 'A' || alias === 'The' || alias === 'An') return null;
        return alias;
    }
    return null;
}

function extractResolverGroup(body) {
    const match = body.match(/Resolver Group\s+(\S+)/i);
    if (match) return match[1].trim();
    return null;
}

function extractNextStep(body) {
    const match = body.match(/Next step:\s*([^\t\n]+)/i);
    if (match) return match[1].trim();
    return null;
}

function extractSimId(subject, body) {
    const text = `${subject} ${body}`;
    // SIM-12345678
    const simMatch = text.match(/SIM-(\d{6,})/i);
    if (simMatch) return `SIM-${simMatch[1]}`;
    // tt/0123456789
    const ttMatch = text.match(/tt\/(\d{6,})/i);
    if (ttMatch) return `tt/${ttMatch[1]}`;
    return null;
}

function extractIssueTitle(subject) {
    // Common patterns:
    // "adaliep commented on [MVP] Create Drift Signal Store (view in Taskei) at 2026-03-05..."
    // "A Robot commented on InternalServerException when fetching Image..."
    // "fkayensu edited the comment on [ALARM] CPP.CRISPRECON..."
    // "deqian set next step to Implementation by the resolver for InternalServerException..."
    
    let title = subject;
    
    // Pattern: "X commented on TITLE (view in Taskei) at DATE"
    const taskeiMatch = subject.match(/(?:commented on|edited.*?on|created)\s+(.+?)\s+\(view in Taskei\)/i);
    if (taskeiMatch) return taskeiMatch[1].trim();
    
    // Pattern: "X commented on TITLE at DATE"
    const commentMatch = subject.match(/(?:commented on|edited.*?on)\s+(.+?)\s+at\s+\d{4}-/i);
    if (commentMatch) return commentMatch[1].trim();
    
    // Pattern: "X set next step to Y for TITLE at DATE"
    const nextStepMatch = subject.match(/set next step to .+? for\s+(.+?)\s+at\s+\d{4}-/i);
    if (nextStepMatch) return nextStepMatch[1].trim();
    
    // Pattern: "X created TITLE at DATE"
    const createdMatch = subject.match(/created\s+(.+?)\s+at\s+\d{4}-/i);
    if (createdMatch) return createdMatch[1].trim();
    
    // Fallback: remove the leading "person action on" part
    const genericMatch = subject.match(/^\S+\s+\S+(?:\s+\S+)?\s+(?:on|for)\s+(.+?)(?:\s+at\s+\d{4}|$)/i);
    if (genericMatch) return genericMatch[1].trim();
    
    return title;
}

function extractActorAndAction(subject) {
    // "adaliep commented on ..."
    // "A Robot commented on ..."
    // "fkayensu edited the comment on ..."
    // "deqian set next step to Implementation by the resolver for ..."
    
    const patterns = [
        { regex: /^(\S+)\s+commented\s+on/i, action: 'commented' },
        { regex: /^(\S+)\s+edited\s+the\s+comment\s+on/i, action: 'edited' },
        { regex: /^(\S+)\s+set\s+next\s+step\s+to\s+(.+?)\s+for/i, action: 'set_status' },
        { regex: /^(\S+)\s+created\s+/i, action: 'created' },
        { regex: /^(\S+)\s+assigned\s+/i, action: 'assigned' },
        { regex: /^(\S+)\s+resolved\s+/i, action: 'resolved' },
        { regex: /^(\S+)\s+reopened\s+/i, action: 'reopened' },
        { regex: /^(\S+)\s+closed\s+/i, action: 'closed' },
    ];
    
    for (const p of patterns) {
        const match = subject.match(p.regex);
        if (match) {
            let person = match[1].trim();
            // "A Robot" is a system actor
            if (person === 'A' && subject.startsWith('A Robot')) person = 'system';
            return { person, action: p.action };
        }
    }
    
    return { person: 'unknown', action: 'unknown' };
}

function extractTimestampFromSubject(subject) {
    // "... at 2026-03-05 11:56:46 PST (GMT-0800)"
    const match = subject.match(/at\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\w+/);
    if (match) {
        try {
            return new Date(match[1].replace(' ', 'T') + 'Z').toISOString();
        } catch (e) {}
    }
    return null;
}

function extractCreatedTimestamp(body) {
    // "2026-02-20 12:07:08 PST (GMT-0800) ethyang created"
    const match = body.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\w+\s+\(GMT[^)]*\)\s+\S+\s+created/);
    if (match) {
        try {
            return new Date(match[1].replace(' ', 'T') + 'Z').toISOString();
        } catch (e) {}
    }
    return null;
}

function extractComments(body) {
    // "2026-03-05 11:11:21 PST (GMT-0800) deqian commented:"
    // "2026-03-04 10:59:55 PST (GMT-0800) sacsabya commented:"
    const comments = [];
    const regex = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\w+\s+\(GMT[^)]*\)\s+(\S+)\s+(commented|created|edited|set\s+next\s+step|reopened|resolved|closed|assigned)(?:\s*:?\s*)([\s\S]*?)(?=\n\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\w+\s+\(GMT|Issue description|…and \d+ earlier|$)/gi;
    
    let match;
    while ((match = regex.exec(body)) !== null) {
        const timestamp = match[1];
        const person = match[2];
        let action = match[3].toLowerCase().replace(/\s+/g, '_');
        const content = match[4]?.trim().substring(0, 2000) || '';
        
        try {
            comments.push({
                person,
                action: action === 'set_next_step' ? 'set_status' : action,
                timestamp: new Date(timestamp.replace(' ', 'T') + 'Z').toISOString(),
                content
            });
        } catch (e) {
            // Skip invalid timestamps
        }
    }
    
    return comments;
}

// ─── URL/Reference Extractors ───

function extractReferences(body) {
    const refs = [];
    const urlRegex = /https?:\/\/[^\s"'<>\])\},]+/g;
    let match;
    
    while ((match = urlRegex.exec(body)) !== null) {
        const url = match[0].replace(/[.,;:!?]+$/, ''); // Strip trailing punctuation
        let refType = 'other';
        
        if (url.includes('code.amazon.com/reviews/CR-')) refType = 'cr';
        else if (url.includes('t.corp.amazon.com')) refType = 'tt';
        else if (url.includes('quip-amazon.com')) refType = 'quip';
        else if (url.includes('sim.amazon.com') || url.includes('issues.amazon.com')) refType = 'sim';
        else if (url.includes('console.aws.amazon.com') || url.includes('console.harmony.a2z.com')) refType = 'console';
        else if (url.includes('w.amazon.com') || url.includes('wiki')) refType = 'wiki';
        else if (url.includes('taskei.amazon.dev')) refType = 'taskei';
        
        refs.push({ refType, url, label: null });
    }
    
    // Deduplicate by URL
    const seen = new Set();
    return refs.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
    });
}

function extractSlaEvents(body, timestamp) {
    const events = [];
    // "Resolver Group QuartzDev failed the First Contact SLA"
    const regex = /Resolver Group\s+(\S+)\s+failed the\s+(.+?)\s+SLA/gi;
    let match;
    while ((match = regex.exec(body)) !== null) {
        events.push({
            resolverGroup: match[1],
            eventType: match[2].toLowerCase().replace(/\s+/g, '_'),
            timestamp: timestamp
        });
    }
    return events;
}

function extractCrossTeamDeps(body) {
    const deps = [];
    
    // TT links to other teams: "TT to MSA https://t.corp.amazon.com/P393216671"
    const ttRegex = /TT\s+to\s+(\S+)\s+(https:\/\/t\.corp\.amazon\.com\/\S+)/gi;
    let match;
    while ((match = ttRegex.exec(body)) !== null) {
        deps.push({
            externalTeam: match[1],
            depType: 'tt_opened',
            refUrl: match[2]
        });
    }
    
    // Mentions of external team queues: "UFC TT queue", "MSA outage"
    const teamMentions = body.match(/(?:open TT to|check.*?at)\s+(\w+)\s+/gi);
    if (teamMentions) {
        for (const mention of teamMentions) {
            const teamMatch = mention.match(/(?:open TT to|check.*?at)\s+(\w+)/i);
            if (teamMatch && !deps.find(d => d.externalTeam === teamMatch[1])) {
                deps.push({
                    externalTeam: teamMatch[1],
                    depType: 'mentioned',
                    refUrl: null
                });
            }
        }
    }
    
    return deps;
}

// ─── Main Parse Function ───

function generateIssueId(title) {
    return crypto.createHash('sha256').update(title).digest('hex').substring(0, 16);
}

/**
 * Parse a single email from the Issues folder and populate the SQLite store.
 * @param {Object} email - Raw email object {id, subject, body, sender, date, folder}
 * @returns {Object} - { issueId, isNew, activitiesAdded }
 */
async function parseIssueEmail(email) {
    const result = { issueId: null, isNew: false, activitiesAdded: 0, refsAdded: 0 };
    
    try {
        // Skip if already parsed
        if (await issuesStore.isEmailParsed(email.id)) {
            return result;
        }
        
        const subject = email.subject || '';
        const body = email.body || '';
        const emailDate = email.date || new Date().toISOString();
        
        // Extract issue title (deduplication key)
        const title = extractIssueTitle(subject);
        if (!title || title.length < 3) {
            logger.warn('Could not extract issue title from:', subject);
            return result;
        }
        
        const issueId = generateIssueId(title);
        result.issueId = issueId;
        
        // Extract metadata
        const type = detectIssueType(subject, body);
        const status = extractStatus(body);
        const impact = extractImpact(body);
        const assignee = extractAssignee(body);
        const resolverGroup = extractResolverGroup(body);
        const nextStep = extractNextStep(body);
        const simId = extractSimId(subject, body);
        const createdAt = extractCreatedTimestamp(body) || emailDate;
        
        // If no assignee from body, try to get the creator alias from the "created" comment in body
        if (!assignee.alias) {
            const creatorMatch = body.match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+\w+\s+\(GMT[^)]*\)\s+(\S+)\s+created/);
            if (creatorMatch) {
                const creatorAlias = creatorMatch[1].trim();
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(creatorAlias);
                if (!isUUID && creatorAlias !== 'system' && creatorAlias !== 'unknown') {
                    assignee.alias = creatorAlias;
                    assignee.raw = creatorAlias;
                }
            }
        }
        
        // Final fallback: use the subject-line actor (first word of subject) as owner
        // e.g., "adaliep commented on [MVP] Create Drift Signal Store..."
        if (!assignee.alias) {
            const subjectOwner = extractOwnerFromSubject(subject);
            if (subjectOwner) {
                assignee.alias = subjectOwner;
                assignee.raw = subjectOwner;
            }
        }
        
        // Check if this is a new issue
        const existing = await issuesStore.getOpenIssues().then(issues => issues.find(i => i.id === issueId));
        result.isNew = !existing;
        
        // Upsert the issue
        await issuesStore.upsertIssue({
            id: issueId,
            simId,
            title,
            type,
            status,
            impact,
            assigneeAlias: assignee.alias,
            assigneeRaw: assignee.raw,
            resolverGroup,
            nextStep,
            createdAt,
            updatedAt: emailDate,
            firstEmailId: existing ? existing.firstEmailId : email.id,
            latestEmailId: email.id,
            rawBodyLatest: body.substring(0, 10000)
        });
        
        // Extract and store the primary activity from the subject line
        const { person: subjectPerson, action: subjectAction } = extractActorAndAction(subject);
        const subjectTimestamp = extractTimestampFromSubject(subject) || emailDate;
        
        if (subjectPerson !== 'unknown') {
            try {
                await issuesStore.addActivity({
                    issueId,
                    person: subjectPerson,
                    action: subjectAction,
                    timestamp: subjectTimestamp,
                    content: null, // Main activity from subject, content is in comments
                    emailId: email.id
                });
                result.activitiesAdded++;
            } catch (e) {
                // Duplicate activity — expected for existing issues
            }
        }
        
        // Extract and store inline comments from the body
        const comments = extractComments(body);
        for (const comment of comments) {
            try {
                await issuesStore.addActivity({
                    issueId,
                    person: comment.person,
                    action: comment.action,
                    timestamp: comment.timestamp,
                    content: comment.content,
                    emailId: email.id
                });
                result.activitiesAdded++;
            } catch (e) {
                // Duplicate — ignore
            }
        }
        
        // Extract and store references (URLs)
        const refs = extractReferences(body);
        for (const ref of refs) {
            try {
                await issuesStore.addReference({ issueId, ...ref });
                result.refsAdded++;
            } catch (e) {
                // Duplicate — ignore
            }
        }
        
        // Extract and store SLA events
        const slaEvents = extractSlaEvents(body, subjectTimestamp || emailDate);
        for (const event of slaEvents) {
            try {
                await issuesStore.addSlaEvent({ issueId, ...event });
            } catch (e) {}
        }
        
        // Extract and store cross-team dependencies
        const deps = extractCrossTeamDeps(body);
        for (const dep of deps) {
            try {
                await issuesStore.addDependency({ issueId, ...dep });
            } catch (e) {}
        }
        
        // Record this email as parsed
        await issuesStore.addSourceEmail({
            emailId: email.id,
            issueId,
            subject: subject.substring(0, 500),
            receivedAt: emailDate,
            parsedAt: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error(`Failed to parse issue email ${email.id}: ${error.message}`);
    }
    
    return result;
}

/**
 * Parse a batch of emails from the Issues folder.
 * @param {Array} emails - Array of raw email objects
 * @returns {Object} - { total, parsed, newIssues, activitiesAdded }
 */
async function parseIssueEmails(emails) {
    await issuesStore.init();
    
    const stats = { total: emails.length, parsed: 0, skipped: 0, newIssues: 0, activitiesAdded: 0 };
    
    for (const email of emails) {
        try {
            const result = await parseIssueEmail(email);
            if (result.issueId) {
                stats.parsed++;
                if (result.isNew) stats.newIssues++;
                stats.activitiesAdded += result.activitiesAdded;
            } else {
                stats.skipped++;
            }
        } catch (error) {
            logger.error(`Error processing email ${email.id}: ${error.message}`);
            stats.skipped++;
        }
    }
    
    logger.info(`Issues parsing complete: ${stats.parsed} parsed, ${stats.newIssues} new issues, ${stats.activitiesAdded} activities, ${stats.skipped} skipped`);
    return stats;
}

/**
 * Classify activities by type (ops/feature/cross_team/quality/investigation)
 * Uses simple heuristic rules — can be upgraded to AI classification later.
 */
async function classifyActivities() {
    await issuesStore.init();
    
    // Get unclassified activities
    const activities = await issuesStore.getPersonActivitySummary(30);
    
    // For each person's activities, classify based on patterns
    for (const person of activities) {
        const personActivities = await issuesStore.getPersonActivities(person.person, 30);
        
        for (const activity of personActivities) {
            let activityType = 'ops'; // default
            const content = `${activity.title || ''} ${activity.content || ''}`.toLowerCase();
            
            // Feature work indicators
            if (activity.type === 'taskei' || 
                content.includes('design') || content.includes('mvp') ||
                content.includes('feature') || content.includes('implement')) {
                activityType = 'feature';
            }
            // Cross-team indicators
            else if (content.includes('tt to') || content.includes('open tt') ||
                     content.includes('external') || content.includes('dependency')) {
                activityType = 'cross_team';
            }
            // Quality indicators
            else if (activity.action === 'reopened' || 
                     content.includes('cant mark') || content.includes("can't") ||
                     content.includes('wrong classification') || content.includes('review')) {
                activityType = 'quality';
            }
            // Investigation indicators
            else if (content.includes('stack trace') || content.includes('error code') ||
                     content.includes('root cause') || content.includes('found below error')) {
                activityType = 'investigation';
            }
            // Alarm/ops indicators
            else if (activity.type === 'alarm' || 
                     content.includes('alarm') || content.includes('sla') ||
                     content.includes('sev-') || content.includes('anomaly')) {
                activityType = 'ops';
            }
            
            // Only classify if we have an activity ID
            if (activity.id) {
                try {
                    await issuesStore.classifyActivity(activity.id, activityType, 0.8);
                } catch (e) {}
            }
        }
    }
    
    logger.info('Activity classification complete');
}

module.exports = {
    parseIssueEmail,
    parseIssueEmails,
    classifyActivities,
    // Expose extractors for testing
    detectIssueType,
    extractIssueTitle,
    extractStatus,
    extractImpact,
    extractAssignee,
    extractOwnerFromSubject,
    extractResolverGroup,
    extractNextStep,
    extractSimId,
    extractComments,
    extractReferences,
    extractSlaEvents,
    extractCrossTeamDeps,
    extractActorAndAction,
};