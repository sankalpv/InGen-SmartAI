// Auto-generated test for services/ai.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/prompt-loader', () => ({ getPrompt: jest.fn(() => 'test prompt'), loadPrompts: jest.fn(() => ({})) }));
jest.mock('../../services/quip-fetcher', () => (jest.fn()));
jest.mock('fs');

describe('services/ai.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/ai');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('analyzeEmails', () => {
        it('should be defined', () => {
            expect(mod.analyzeEmails || mod.default?.analyzeEmails).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.analyzeEmails || mod.default?.analyzeEmails;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('prepareMeetingBrief', () => {
        it('should be defined', () => {
            expect(mod.prepareMeetingBrief || mod.default?.prepareMeetingBrief).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.prepareMeetingBrief || mod.default?.prepareMeetingBrief;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('summarizeSlack', () => {
        it('should be defined', () => {
            expect(mod.summarizeSlack || mod.default?.summarizeSlack).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.summarizeSlack || mod.default?.summarizeSlack;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateDailyBriefing', () => {
        it('should be defined', () => {
            expect(mod.generateDailyBriefing || mod.default?.generateDailyBriefing).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateDailyBriefing || mod.default?.generateDailyBriefing;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateMeetingBrief', () => {
        it('should be defined', () => {
            expect(mod.generateMeetingBrief || mod.default?.generateMeetingBrief).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateMeetingBrief || mod.default?.generateMeetingBrief;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateWeeklyRetro', () => {
        it('should be defined', () => {
            expect(mod.generateWeeklyRetro || mod.default?.generateWeeklyRetro).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateWeeklyRetro || mod.default?.generateWeeklyRetro;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('generateDraft', () => {
        it('should be defined', () => {
            expect(mod.generateDraft || mod.default?.generateDraft).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.generateDraft || mod.default?.generateDraft;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('chatWithData', () => {
        it('should be defined', () => {
            expect(mod.chatWithData || mod.default?.chatWithData).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.chatWithData || mod.default?.chatWithData;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('askQuestionAboutEmail', () => {
        it('should be defined', () => {
            expect(mod.askQuestionAboutEmail || mod.default?.askQuestionAboutEmail).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.askQuestionAboutEmail || mod.default?.askQuestionAboutEmail;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('extractTimeConstraints', () => {
        it('should be defined', () => {
            expect(mod.extractTimeConstraints || mod.default?.extractTimeConstraints).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.extractTimeConstraints || mod.default?.extractTimeConstraints;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
