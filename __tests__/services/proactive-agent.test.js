// Auto-generated test for services/proactive-agent.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/ai-insights', () => (jest.fn()));
jest.mock('../../services/insight-store', () => ({ getInsights: jest.fn(() => []), addInsight: jest.fn() }));
jest.mock('../../services/leadership-analytics', () => (jest.fn()));
jest.mock('../../services/local-store', () => ({ getEmails: jest.fn(() => ({ exists: true, data: [] })), getCalendar: jest.fn(() => ({ exists: true, data: [] })), getIssues: jest.fn(() => ({ exists: false })), fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 0, calendar: 0, elapsed: 0 })) }));

describe('services/proactive-agent.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/proactive-agent');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('runProactiveAnalysis', () => {
        it('should be defined', () => {
            expect(mod.runProactiveAnalysis || mod.default?.runProactiveAnalysis).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.runProactiveAnalysis || mod.default?.runProactiveAnalysis;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getInsightStats', () => {
        it('should be defined', () => {
            expect(mod.getInsightStats || mod.default?.getInsightStats).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getInsightStats || mod.default?.getInsightStats;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
