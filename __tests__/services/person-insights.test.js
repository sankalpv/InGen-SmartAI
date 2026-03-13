// Auto-generated test for services/person-insights.js
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/local-store', () => ({ getEmails: jest.fn(() => ({ exists: true, data: [] })), getCalendar: jest.fn(() => ({ exists: true, data: [] })), getIssues: jest.fn(() => ({ exists: false })), fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 0, calendar: 0, elapsed: 0 })) }));
jest.mock('../../services/issues-store', () => ({ getIssues: jest.fn(() => []), getIssueById: jest.fn() }));
jest.mock('../../services/ollama-client', () => ({ embed: jest.fn(() => Promise.resolve(new Array(4096).fill(0))), generate: jest.fn(() => Promise.resolve('response')), chat: jest.fn() }));

describe('services/person-insights.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/person-insights');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('getEmailsForPerson', () => {
        it('should be defined', () => {
            expect(mod.getEmailsForPerson || mod.default?.getEmailsForPerson).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getEmailsForPerson || mod.default?.getEmailsForPerson;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getMeetingsForPerson', () => {
        it('should be defined', () => {
            expect(mod.getMeetingsForPerson || mod.default?.getMeetingsForPerson).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getMeetingsForPerson || mod.default?.getMeetingsForPerson;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getIssuesForPerson', () => {
        it('should be defined', () => {
            expect(mod.getIssuesForPerson || mod.default?.getIssuesForPerson).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getIssuesForPerson || mod.default?.getIssuesForPerson;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generatePersonInsight', () => {
        it('should be defined', () => {
            expect(mod.generatePersonInsight || mod.default?.generatePersonInsight).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generatePersonInsight || mod.default?.generatePersonInsight;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
