// Auto-generated test for services/tool-registry.js
// tool-registry.js registers tools at module load time, requiring many service mocks.

jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('fs');
jest.mock('sqlite3', () => ({
    verbose: jest.fn(() => ({
        Database: jest.fn((path, cb) => { if (cb) cb(null); return {
            run: jest.fn((sql, params, cb) => { if (typeof params === 'function') params(null); else if (cb) cb(null); }),
            get: jest.fn((sql, params, cb) => { if (typeof params === 'function') params(null, {}); else if (cb) cb(null, {}); }),
            all: jest.fn((sql, params, cb) => { if (typeof params === 'function') params(null, []); else if (cb) cb(null, []); }),
            exec: jest.fn((sql, cb) => { if (cb) cb(null); }),
            close: jest.fn((cb) => { if (cb) cb(null); }),
            serialize: jest.fn(fn => { if (fn) fn(); }),
        }; }),
    })),
}));
jest.mock('../../services/email-search', () => ({ search: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/phonetool', () => ({ lookupAlias: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../services/ticket-health', () => ({ getDashboard: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../services/mcp-client', () => ({ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }));
jest.mock('../../services/local-store', () => ({ getEmails: jest.fn(() => ({ exists: true, data: [] })), getCalendar: jest.fn(() => ({ exists: true, data: [] })), getIssues: jest.fn(() => ({ exists: false })), fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 0, calendar: 0, elapsed: 0 })) }));
jest.mock('../../services/slack', () => ({ fetchSlackMessages: jest.fn(() => Promise.resolve([])), fetchAllSlackMessages: jest.fn(() => Promise.resolve([])), getWatchChannels: jest.fn(() => []), sendDM: jest.fn(), postToChannelByName: jest.fn(), searchSlack: jest.fn() }));
jest.mock('../../services/ai', () => ({ summarizeEmails: jest.fn(() => Promise.resolve([])), summarizeSlack: jest.fn(() => Promise.resolve([])), generateBriefing: jest.fn(() => Promise.resolve('briefing')), prepareMeetingBrief: jest.fn(() => Promise.resolve('brief')), analyzeMeetingNotes: jest.fn(), generateGoalInsights: jest.fn() }));
jest.mock('../../services/vector-store', () => ({ init: jest.fn(), search: jest.fn(() => Promise.resolve([])), ingestEmail: jest.fn(), ingestSlackMessage: jest.fn(), save: jest.fn(), getStats: jest.fn(() => ({ totalDocuments: 0 })) }));
jest.mock('../../services/ollama-client', () => ({ embed: jest.fn(() => Promise.resolve(new Array(4096).fill(0))), generate: jest.fn(() => Promise.resolve('response')), chat: jest.fn() }));
jest.mock('../../services/org-store', () => ({ getOrgTree: jest.fn(() => []), getDirectReports: jest.fn(() => []) }));
jest.mock('../../services/eng-metrics', () => ({ getWeeklyMetrics: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../services/wbr-report', () => ({ getGoals: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/insight-store', () => ({ getInsights: jest.fn(() => []), addInsight: jest.fn() }));
jest.mock('../../services/issues-store', () => ({ getIssues: jest.fn(() => []), getIssueById: jest.fn() }));
jest.mock('../../services/person-insights', () => ({ getPersonInsights: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../services/scheduling', () => ({ findFreeSlots: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/outlook-local', () => ({ getCalendar: jest.fn(() => Promise.resolve([])), getEmails: jest.fn(() => Promise.resolve([])), getCalendarList: jest.fn(() => Promise.resolve([])) }));
// Mock goal-narrative-tools — tool-registry uses goalNarrative.executeGoalInsights etc.
jest.mock('../../services/goal-narrative-tools', () => ({
    executeGoalInsights: jest.fn(),
    executeGoalMisses: jest.fn(),
    executeGoalKeyUpdates: jest.fn(),
    executeOncallReport: jest.fn(),
}));

describe('services/tool-registry.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        mod = require('../../services/tool-registry');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('register', () => {
        it('should be defined', () => {
            expect(mod.register).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.register).toBe('function');
        });
    });

    describe('get', () => {
        it('should be defined', () => {
            expect(mod.get).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.get).toBe('function');
        });
    });

    describe('execute', () => {
        it('should be defined', () => {
            expect(mod.execute).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.execute).toBe('function');
        });
    });

    describe('listAll', () => {
        it('should be defined', () => {
            expect(mod.listAll).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.listAll).toBe('function');
        });
    });
});
