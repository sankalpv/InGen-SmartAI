// Auto-generated test for services/background-agent.js
// Note: background-agent.js has no module.exports - it runs side effects on import.
// We must mock all dependencies to prevent side effects.

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/local-store', () => ({ getEmails: jest.fn(() => ({ exists: true, data: [] })), getCalendar: jest.fn(() => ({ exists: true, data: [] })), getIssues: jest.fn(() => ({ exists: false })), fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 0, calendar: 0, elapsed: 0 })) }));
jest.mock('../../services/proactive-agent', () => ({ runProactiveAnalysis: jest.fn(() => Promise.resolve({ generated: 0 })) }));
jest.mock('../../services/issues-parser', () => ({ parseIssueEmails: jest.fn(() => Promise.resolve({ parsed: 0, newIssues: 0, activitiesAdded: 0 })), classifyActivities: jest.fn() }));
jest.mock('../../services/ai-insights', () => ({ generateInsights: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/insight-store', () => ({ getInsights: jest.fn(() => []), addInsight: jest.fn(), storeInsight: jest.fn() }));

describe('services/background-agent.js', () => {
    it('should load without throwing', () => {
        expect(() => {
            require('../../services/background-agent');
        }).not.toThrow();
    });
});
