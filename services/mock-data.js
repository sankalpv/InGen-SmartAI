// Realistic mock data for development and demo purposes

const today = new Date();
const todayStr = today.toISOString().split('T')[0];

export const mockEmails = [
    {
        id: 'email-1',
        source: 'gmail',
        from: { name: 'Sarah Chen', email: 'sarah.chen@techcorp.com' },
        to: [{ name: 'You', email: 'you@company.com' }],
        subject: 'Q1 Budget Review — Need Your Input by EOD',
        body: `Hi,\n\nI'm finalizing the Q1 budget review deck for tomorrow's leadership meeting. Could you review the engineering allocation section and confirm the headcount numbers?\n\nSpecifically, I need:\n1. Updated contractor costs for the AI platform team\n2. Confirmation of the 3 new hires starting in March\n3. Any changes to the cloud infrastructure budget\n\nThe deck is in the shared drive: Q1_Budget_Review_v3.pptx\n\nNeed this by end of day if possible — presenting at 9 AM tomorrow.\n\nBest,\nSarah`,
        date: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        read: false,
        labels: ['important'],
        threadLength: 1,
        priority: 'urgent',
        aiSuggestedReply: `Hi Sarah,\n\nThanks for flagging this. I'll review the engineering allocation section right away.\n\nQuick updates:\n1. Contractor costs for AI platform: $245K (up $15K from last quarter due to the ML pipeline work)\n2. Confirmed — 3 new hires start March 3rd (2 SWEs + 1 ML engineer)\n3. Cloud infra budget remains at $180K/month, no changes\n\nI'll add comments directly in the deck within the next hour.\n\nGood luck with the presentation!\nBest`,
        aiCategory: 'respond_now'
    },
    {
        id: 'email-2',
        source: 'outlook',
        from: { name: 'Marcus Rodriguez', email: 'marcus.r@partnerfirm.com' },
        to: [{ name: 'You', email: 'you@company.com' }],
        subject: 'Re: Partnership Proposal — AI Integration',
        body: `Hi,\n\nFollowing up on our call last week about the AI integration partnership. Our team has reviewed the technical requirements and we're excited to move forward.\n\nA few questions:\n- Can we schedule a technical deep-dive with your engineering team next week?\n- What's your preferred API authentication method (OAuth2 vs API keys)?\n- Are there any data residency requirements we should be aware of?\n\nWe'd also love to set up a pilot program with 2-3 of your enterprise clients. Let me know what you think.\n\nBest regards,\nMarcus`,
        date: new Date(today.getTime() - 5 * 60 * 60 * 1000).toISOString(),
        read: false,
        labels: [],
        threadLength: 4,
        priority: 'high',
        aiSuggestedReply: `Hi Marcus,\n\nGreat to hear you're ready to move forward! Here are my thoughts:\n\n- Technical deep-dive: I'll coordinate with our engineering lead and propose a few slots for next week. Tuesday or Thursday afternoon work best on our end.\n- Auth: We strongly prefer OAuth2 for enterprise integrations. I'll share our API documentation.\n- Data residency: Yes, we have EU data residency requirements for GDPR compliance. Let's cover this in the technical session.\n\nThe pilot program sounds excellent. I have 2 clients in mind who'd be great fits. Let me reach out to them first.\n\nI'll send calendar invites by tomorrow.\n\nBest`,
        aiCategory: 'respond_today'
    },
    {
        id: 'email-3',
        source: 'gmail',
        from: { name: 'Engineering Alerts', email: 'alerts@monitoring.internal' },
        to: [{ name: 'Engineering Team', email: 'eng-team@company.com' }],
        subject: '[Resolved] Production API latency spike — Root cause identified',
        body: `Incident Report: API Latency Spike\n\nStatus: RESOLVED\nDuration: 14:32 - 14:47 UTC\nImpact: P95 latency increased to 2.3s (normal: 180ms)\n\nRoot Cause: Database connection pool exhaustion due to a long-running analytics query that wasn't using read replicas.\n\nResolution: Killed the offending query, added connection pool monitoring alerts, and redirected analytics queries to read replicas.\n\nAction Items:\n- Add query timeout enforcement (assigned to DevOps)\n- Review analytics query routing (assigned to Data team)\n\nNo customer-facing impact detected.`,
        date: new Date(today.getTime() - 3 * 60 * 60 * 1000).toISOString(),
        read: true,
        labels: ['engineering'],
        threadLength: 8,
        priority: 'low',
        aiSuggestedReply: null,
        aiCategory: 'fyi'
    },
    {
        id: 'email-4',
        source: 'outlook',
        from: { name: 'Lisa Park', email: 'lisa.park@company.com' },
        to: [{ name: 'You', email: 'you@company.com' }],
        subject: 'Team Offsite Planning — Vote on Activities',
        body: `Hey team!\n\nWe're planning the Q2 team offsite for March 28-29. Please vote on your preferred activities:\n\n🏔️ Option A: Hiking + BBQ at Redwood Regional Park\n🎳 Option B: Bowling + team dinner downtown\n🎨 Option C: Cooking class + wine tasting\n\nAlso, any dietary restrictions I should know about for catering?\n\nPlease reply by Friday!\n\nCheers,\nLisa`,
        date: new Date(today.getTime() - 8 * 60 * 60 * 1000).toISOString(),
        read: true,
        labels: ['team'],
        threadLength: 1,
        priority: 'low',
        aiSuggestedReply: `Hi Lisa,\n\nLove all the options! My vote goes to Option C — the cooking class + wine tasting sounds like a great team bonding experience.\n\nNo dietary restrictions from my end.\n\nThanks for organizing this!\nBest`,
        aiCategory: 'respond_today'
    },
    {
        id: 'email-5',
        source: 'gmail',
        from: { name: 'David Kim', email: 'david.kim@company.com' },
        to: [{ name: 'You', email: 'you@company.com' }],
        subject: 'Re: Architecture Review — Microservices Migration',
        body: `Hi,\n\nI've updated the architecture doc based on your feedback from Monday's review. Key changes:\n\n1. Moved to event-driven communication between services (as you suggested)\n2. Added circuit breaker patterns for inter-service calls\n3. Separated the auth service into its own deployment\n\nCould you do a final review before I present to the architecture board on Thursday?\n\nDoc link: architecture-review-v4.md\n\nThanks,\nDavid`,
        date: new Date(today.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        read: false,
        labels: ['engineering', 'important'],
        threadLength: 6,
        priority: 'high',
        aiSuggestedReply: `Hi David,\n\nGreat improvements! I'll review the updated doc today.\n\nAt first glance, the event-driven approach and circuit breakers look solid. A few things I'll pay attention to:\n- Event schema versioning strategy\n- Failure handling for the circuit breaker fallbacks\n- Auth service deployment isolation and its impact on latency\n\nI'll add inline comments in the doc and ping you by end of day.\n\nGood luck with the architecture board presentation!\nBest`,
        aiCategory: 'respond_now'
    },
    {
        id: 'email-6',
        source: 'outlook',
        from: { name: 'HR Updates', email: 'hr@company.com' },
        to: [{ name: 'All Staff', email: 'all@company.com' }],
        subject: 'Reminder: Benefits Enrollment Deadline Feb 28',
        body: `Dear Team,\n\nThis is a friendly reminder that the annual benefits enrollment period ends on February 28th.\n\nPlease log into the HR portal to:\n- Review your current benefits selections\n- Make any changes to health, dental, or vision plans\n- Update your 401(k) contribution percentage\n- Enroll in the new wellness program\n\nIf you have questions, please reach out to benefits@company.com.\n\nBest,\nHR Team`,
        date: new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        read: true,
        labels: ['hr'],
        threadLength: 1,
        priority: 'low',
        aiSuggestedReply: null,
        aiCategory: 'fyi'
    }
];

export const mockMeetings = [
    {
        id: 'meeting-1',
        title: 'Q1 Budget Leadership Review',
        startTime: `${todayStr}T09:00:00`,
        endTime: `${todayStr}T10:00:00`,
        location: 'Conference Room A / Zoom',
        organizer: { name: 'Sarah Chen', email: 'sarah.chen@techcorp.com' },
        attendees: [
            { name: 'Sarah Chen', email: 'sarah.chen@techcorp.com' },
            { name: 'You', email: 'you@company.com' },
            { name: 'James Wright', email: 'james.w@company.com' },
            { name: 'Priya Sharma', email: 'priya.s@company.com' },
        ],
        description: 'Review Q1 budget allocations across all departments. Engineering section led by you.',
        source: 'outlook',
        aiContext: 'Sarah Chen emailed you requesting budget review input (contractor costs, new hires, cloud infra). You need to have the engineering allocation numbers ready. The deck is Q1_Budget_Review_v3.pptx in the shared drive.',
        aiQuestions: [
            'What is the ROI projection for the 3 new engineering hires starting in March?',
            'How does the $15K increase in contractor costs compare to the value delivered by the ML pipeline?',
            'Are there opportunities to optimize the $180K/month cloud infrastructure spend?',
            'What is the engineering team\'s capacity utilization rate this quarter?',
            'Should we allocate budget for the new AI partnership with Marcus Rodriguez\'s firm?',
            'Are there any upcoming vendor contract renewals that could impact Q2 budget?',
        ]
    },
    {
        id: 'meeting-2',
        title: 'Architecture Review Board',
        startTime: `${todayStr}T14:00:00`,
        endTime: `${todayStr}T15:30:00`,
        location: 'Virtual — Google Meet',
        organizer: { name: 'David Kim', email: 'david.kim@company.com' },
        attendees: [
            { name: 'David Kim', email: 'david.kim@company.com' },
            { name: 'You', email: 'you@company.com' },
            { name: 'Emily Torres', email: 'emily.t@company.com' },
            { name: 'Raj Patel', email: 'raj.p@company.com' },
        ],
        description: 'Review the microservices migration architecture proposal (v4).',
        source: 'gmail',
        aiContext: 'David Kim has updated the architecture doc to v4 based on your Monday review feedback. Key changes include event-driven communication, circuit breaker patterns, and separated auth service. He\'s presenting the final version today. You should review the doc before this meeting.',
        aiQuestions: [
            'What event schema versioning strategy is proposed for inter-service communication?',
            'How are circuit breaker fallbacks configured — what happens during partial outages?',
            'What is the latency impact of separating the auth service into its own deployment?',
            'How will the migration be phased — big bang or incremental?',
            'What monitoring and observability tooling is planned for the distributed architecture?',
            'How does this architecture handle data consistency across services?',
            'What is the rollback strategy if a service migration fails?',
        ]
    },
    {
        id: 'meeting-3',
        title: '1:1 with Engineering Manager',
        startTime: `${todayStr}T11:00:00`,
        endTime: `${todayStr}T11:30:00`,
        location: 'Office — Desk Drop-in',
        organizer: { name: 'You', email: 'you@company.com' },
        attendees: [
            { name: 'You', email: 'you@company.com' },
            { name: 'Alex Johnson', email: 'alex.j@company.com' },
        ],
        description: 'Weekly 1:1 sync',
        source: 'gmail',
        aiContext: 'Regular weekly 1:1. Recent topics in email threads include: production API latency incident (now resolved), upcoming team offsite planning, and the microservices migration timeline.',
        aiQuestions: [
            'What are the action items from the resolved API latency incident — are DevOps and Data team tracking them?',
            'How is the team feeling about the microservices migration timeline?',
            'Are there any blockers for the 3 new hires starting in March?',
            'What feedback does Alex have on the team offsite activity options?',
            'Are there any performance review follow-ups needed?',
        ]
    }
];

export const mockSlackMessages = [
    {
        id: 'slack-1',
        channel: '#engineering',
        from: { name: 'Alex Johnson', avatar: '👨‍💻' },
        message: 'Hey team, the post-mortem for yesterday\'s latency incident is scheduled for Thursday at 3 PM. Please review the incident timeline before the meeting.',
        timestamp: new Date(today.getTime() - 1 * 60 * 60 * 1000).toISOString(),
        isDirectMessage: false,
        needsResponse: false,
        actionItem: 'Review incident timeline before Thursday 3 PM post-mortem',
    },
    {
        id: 'slack-2',
        channel: 'DM',
        from: { name: 'Priya Sharma', avatar: '👩‍💼' },
        message: 'Quick question — do you have the updated headcount numbers for the budget meeting tomorrow? Sarah is asking.',
        timestamp: new Date(today.getTime() - 30 * 60 * 1000).toISOString(),
        isDirectMessage: true,
        needsResponse: true,
        actionItem: 'Respond with updated headcount numbers',
        aiSuggestedReply: 'Yes! I have them ready — 3 new hires starting March 3rd (2 SWEs + 1 ML engineer). I\'m updating the deck now and will share by EOD.',
    },
    {
        id: 'slack-3',
        channel: '#general',
        from: { name: 'Lisa Park', avatar: '🎉' },
        message: 'Reminder: Team offsite activity vote closes Friday! We\'re tied between hiking and cooking class. Cast your vote in the thread! 🗳️',
        timestamp: new Date(today.getTime() - 4 * 60 * 60 * 1000).toISOString(),
        isDirectMessage: false,
        needsResponse: false,
        actionItem: 'Vote on team offsite activity by Friday',
    },
    {
        id: 'slack-4',
        channel: '#deployments',
        from: { name: 'CI/CD Bot', avatar: '🤖' },
        message: '✅ Production deploy successful: api-gateway v2.14.3 — includes connection pool monitoring (hotfix for yesterday\'s incident)',
        timestamp: new Date(today.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        isDirectMessage: false,
        needsResponse: false,
        actionItem: null,
    },
    {
        id: 'slack-5',
        channel: 'DM',
        from: { name: 'Marcus Rodriguez', avatar: '🤝' },
        message: 'Hey! Just sent you an email about the partnership next steps. Would be great to get the technical deep-dive scheduled ASAP. Our team is really excited about this.',
        timestamp: new Date(today.getTime() - 45 * 60 * 1000).toISOString(),
        isDirectMessage: true,
        needsResponse: true,
        actionItem: 'Schedule technical deep-dive with Marcus\'s team',
        aiSuggestedReply: 'Hey Marcus! Just saw the email — great questions. I\'m aligning with our engineering lead and will propose a few time slots for next week. Expect calendar invites by tomorrow!',
    },
];

export const mockBriefing = {
    summary: {
        totalEmails: 6,
        needResponse: 3,
        urgentCount: 2,
        meetingsToday: 3,
        slackActionItems: 4,
        generatedAt: new Date().toISOString(),
    },
    greeting: `Good morning. You have a high-leverage day ahead with 3 strategic meetings and 2 urgent decisions pending. Your primary focus should be finalizing the Q1 Budget for Sarah Chen's board presentation and reviewing the Architecture Doc v4 to unblock the engineering team. The partnership with Marcus Rodriguez is also gaining momentum and requires your steer.`,
    topPriorities: [
        {
            type: 'general',
            title: 'Approve Q1 Budget Allocations',
            urgency: 'high',
            deadline: 'today',
            reason: 'Sarah Chen presents to the board at 9 AM tomorrow; needs $245k contractor approval.'
        },
        {
            type: 'general',
            title: 'Final Review: Microservices Architecture v4',
            urgency: 'high',
            deadline: 'today',
            reason: 'Critical for unblocking the platform team; David presents at 2 PM.'
        },
        {
            type: 'general',
            title: 'Authorize AI Partnership Pilot',
            urgency: 'medium',
            deadline: 'this week',
            reason: 'Marcus Rodriguez requesting technical deep-dive to finalize contract.'
        },
        {
            type: 'general',
            title: 'Resolve Headcount Discrepancy',
            urgency: 'medium',
            deadline: 'today',
            reason: 'Priya needs confirmation on the 3 new hires for HR processing.'
        }
    ]
};

