// Auto-generated test for services/background-agent.js
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('fs');
jest.mock('../../services/vector-store', () => ({ init: jest.fn(), search: jest.fn(() => Promise.resolve([])), ingestEmail: jest.fn(), ingestSlackMessage: jest.fn(), save: jest.fn(), getStats: jest.fn(() => ({ totalDocuments: 0 })) }));
jest.mock('../../services/proactive-agent', () => ({ runProactiveAnalysis: jest.fn(() => Promise.resolve({ generated: 0 })) }));
jest.mock('../../services/local-store', () => ({ getEmails: jest.fn(() => ({ exists: true, data: [] })), getCalendar: jest.fn(() => ({ exists: true, data: [] })), getIssues: jest.fn(() => ({ exists: false })), fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 0, calendar: 0, elapsed: 0 })) }));
jest.mock('../../services/issues-parser', () => ({ parseIssueEmails: jest.fn(() => Promise.resolve({ parsed: 0, newIssues: 0, activitiesAdded: 0 })), classifyActivities: jest.fn() }));
jest.mock('../../services/issues-store', () => ({ getIssues: jest.fn(() => []), getIssueById: jest.fn() }));
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/slack', () => ({ fetchSlackMessages: jest.fn(() => Promise.resolve([])), fetchAllSlackMessages: jest.fn(() => Promise.resolve([])), getWatchChannels: jest.fn(() => []), sendDM: jest.fn(), postToChannelByName: jest.fn(), searchSlack: jest.fn() }));

describe('services/background-agent.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/background-agent');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('runSync', () => {
        it('should be defined', () => {
            expect(mod.runSync || mod.default?.runSync).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.runSync || mod.default?.runSync;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateInsights', () => {
        it('should be defined', () => {
            expect(mod.generateInsights || mod.default?.generateInsights).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateInsights || mod.default?.generateInsights;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('syncSlackMessages', () => {
        it('should be defined', () => {
            expect(mod.syncSlackMessages || mod.default?.syncSlackMessages).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.syncSlackMessages || mod.default?.syncSlackMessages;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
