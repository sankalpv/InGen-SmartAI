// Auto-generated test for services/prompt-loader.js
jest.mock('../../services/prompt-loader', () => ({ getPrompt: jest.fn(() => 'test prompt'), loadPrompts: jest.fn(() => ({})) }));
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/prompt-loader.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/prompt-loader');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('get', () => {
        it('should be defined', () => {
            expect(mod.get || mod.default?.get).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.get || mod.default?.get;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('invalidate', () => {
        it('should be defined', () => {
            expect(mod.invalidate || mod.default?.invalidate).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.invalidate || mod.default?.invalidate;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
