// Auto-generated test for services/startup-checks.js
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/ollama-client', () => ({ embed: jest.fn(() => Promise.resolve(new Array(4096).fill(0))), generate: jest.fn(() => Promise.resolve('response')), chat: jest.fn() }));

describe('services/startup-checks.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        mod = require('../../services/startup-checks');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('runAll', () => {
        it('should be defined', () => {
            expect(mod.runAll).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.runAll).toBe('function');
        });
    });
});
