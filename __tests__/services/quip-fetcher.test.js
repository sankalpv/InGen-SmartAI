// Auto-generated test for services/quip-fetcher.js
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/prompt-loader', () => ({ getPrompt: jest.fn(() => 'test prompt'), loadPrompts: jest.fn(() => ({})) }));
jest.mock('../../services/mcp-client', () => ({ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }));

describe('services/quip-fetcher.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/quip-fetcher');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('extractQuipUrls', () => {
        it('should be defined', () => {
            expect(mod.extractQuipUrls || mod.default?.extractQuipUrls).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.extractQuipUrls || mod.default?.extractQuipUrls;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('extractQuipUrlsFromEmails', () => {
        it('should be defined', () => {
            expect(mod.extractQuipUrlsFromEmails || mod.default?.extractQuipUrlsFromEmails).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.extractQuipUrlsFromEmails || mod.default?.extractQuipUrlsFromEmails;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchQuipDocument', () => {
        it('should be defined', () => {
            expect(mod.fetchQuipDocument || mod.default?.fetchQuipDocument).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchQuipDocument || mod.default?.fetchQuipDocument;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchMultipleQuipDocs', () => {
        it('should be defined', () => {
            expect(mod.fetchMultipleQuipDocs || mod.default?.fetchMultipleQuipDocs).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchMultipleQuipDocs || mod.default?.fetchMultipleQuipDocs;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('formatQuipContextForAI', () => {
        it('should be defined', () => {
            expect(mod.formatQuipContextForAI || mod.default?.formatQuipContextForAI).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.formatQuipContextForAI || mod.default?.formatQuipContextForAI;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getQuipSettings', () => {
        it('should be defined', () => {
            expect(mod.getQuipSettings || mod.default?.getQuipSettings).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getQuipSettings || mod.default?.getQuipSettings;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('clearCache', () => {
        it('should be defined', () => {
            expect(mod.clearCache || mod.default?.clearCache).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.clearCache || mod.default?.clearCache;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
