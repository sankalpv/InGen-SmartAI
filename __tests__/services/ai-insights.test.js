// Auto-generated test for services/ai-insights.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/ollama-client', () => ({ embed: jest.fn(() => Promise.resolve(new Array(4096).fill(0))), generate: jest.fn(() => Promise.resolve('response')), chat: jest.fn() }));
jest.mock('../../services/vector-store', () => ({ init: jest.fn(), search: jest.fn(() => Promise.resolve([])), ingestEmail: jest.fn(), ingestSlackMessage: jest.fn(), save: jest.fn(), getStats: jest.fn(() => ({ totalDocuments: 0 })) }));

describe('services/ai-insights.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/ai-insights');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('predictMeetingOutcome', () => {
        it('should be defined', () => {
            expect(mod.predictMeetingOutcome || mod.default?.predictMeetingOutcome).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.predictMeetingOutcome || mod.default?.predictMeetingOutcome;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateContextualInsights', () => {
        it('should be defined', () => {
            expect(mod.generateContextualInsights || mod.default?.generateContextualInsights).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateContextualInsights || mod.default?.generateContextualInsights;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('predictBlockers', () => {
        it('should be defined', () => {
            expect(mod.predictBlockers || mod.default?.predictBlockers).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.predictBlockers || mod.default?.predictBlockers;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('scoreEmailImportance', () => {
        it('should be defined', () => {
            expect(mod.scoreEmailImportance || mod.default?.scoreEmailImportance).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.scoreEmailImportance || mod.default?.scoreEmailImportance;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateWeeklyPrediction', () => {
        it('should be defined', () => {
            expect(mod.generateWeeklyPrediction || mod.default?.generateWeeklyPrediction).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateWeeklyPrediction || mod.default?.generateWeeklyPrediction;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
