// Auto-generated test for services/ollama-client.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/ollama-client.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        mod = require('../../services/ollama-client');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('generate', () => {
        it('should be defined', () => {
            expect(mod.generate).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.generate).toBe('function');
        });
    });

    describe('embed', () => {
        it('should be defined', () => {
            expect(mod.embed).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.embed).toBe('function');
        });
    });

    describe('generateJSON', () => {
        it('should be defined', () => {
            expect(mod.generateJSON).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.generateJSON).toBe('function');
        });
    });
});
