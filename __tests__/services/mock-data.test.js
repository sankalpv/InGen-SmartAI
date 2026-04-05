// Auto-generated test for services/mock-data.js


describe('services/mock-data.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/mock-data');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('mockEmails', () => {
        it('should be defined', () => {
            expect(mod.mockEmails || mod.default?.mockEmails).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.mockEmails || mod.default?.mockEmails;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('mockMeetings', () => {
        it('should be defined', () => {
            expect(mod.mockMeetings || mod.default?.mockMeetings).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.mockMeetings || mod.default?.mockMeetings;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    // NOTE: mockSlackMessages was removed from mock-data.js — test removed to match source exports

    describe('mockBriefing', () => {
        it('should be defined', () => {
            expect(mod.mockBriefing || mod.default?.mockBriefing).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.mockBriefing || mod.default?.mockBriefing;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
