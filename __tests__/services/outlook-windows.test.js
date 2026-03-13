// Auto-generated test for services/outlook-windows.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/outlook-windows.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/outlook-windows');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('fetchOutlookEmails', () => {
        it('should be defined', () => {
            expect(mod.fetchOutlookEmails || mod.default?.fetchOutlookEmails).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchOutlookEmails || mod.default?.fetchOutlookEmails;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchOutlookCalendar', () => {
        it('should be defined', () => {
            expect(mod.fetchOutlookCalendar || mod.default?.fetchOutlookCalendar).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchOutlookCalendar || mod.default?.fetchOutlookCalendar;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getCalendarList', () => {
        it('should be defined', () => {
            expect(mod.getCalendarList || mod.default?.getCalendarList).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getCalendarList || mod.default?.getCalendarList;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
