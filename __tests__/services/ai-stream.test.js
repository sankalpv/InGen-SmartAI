// Auto-generated test for services/ai-stream.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/prompt-loader', () => ({ getPrompt: jest.fn(() => 'test prompt'), loadPrompts: jest.fn(() => ({})) }));
jest.mock('../../services/quip-fetcher', () => (jest.fn()));
jest.mock('../../services/issues-store', () => ({ getIssues: jest.fn(() => []), getIssueById: jest.fn() }));
jest.mock('../../services/bedrock-client', () => ({ invoke: jest.fn(() => Promise.resolve('response')), isAvailable: jest.fn(() => false) }));

describe('services/ai-stream.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/ai-stream');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('streamCompletion', () => {
        it('should be defined', () => {
            expect(mod.streamCompletion || mod.default?.streamCompletion).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.streamCompletion || mod.default?.streamCompletion;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('streamDailyBriefing', () => {
        it('should be defined', () => {
            expect(mod.streamDailyBriefing || mod.default?.streamDailyBriefing).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.streamDailyBriefing || mod.default?.streamDailyBriefing;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('streamChatResponse', () => {
        it('should be defined', () => {
            expect(mod.streamChatResponse || mod.default?.streamChatResponse).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.streamChatResponse || mod.default?.streamChatResponse;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('streamPageChatResponse', () => {
        it('should be defined', () => {
            expect(mod.streamPageChatResponse || mod.default?.streamPageChatResponse).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.streamPageChatResponse || mod.default?.streamPageChatResponse;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('streamDraftReply', () => {
        it('should be defined', () => {
            expect(mod.streamDraftReply || mod.default?.streamDraftReply).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.streamDraftReply || mod.default?.streamDraftReply;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
