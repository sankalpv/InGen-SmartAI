// Auto-generated test for services/prompt-loader.js
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/prompt-loader.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        mod = require('../../services/prompt-loader');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('get', () => {
        it('should be defined', () => {
            expect(mod.get).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.get).toBe('function');
        });
    });

    describe('invalidate', () => {
        it('should be defined', () => {
            expect(mod.invalidate).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.invalidate).toBe('function');
        });
    });
});
