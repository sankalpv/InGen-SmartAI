// Auto-generated test for services/vector-store.js
jest.mock('hnswlib-node', () => ({
    HierarchicalNSW: jest.fn(() => ({
        initIndex: jest.fn(), addPoint: jest.fn(), searchKnn: jest.fn(() => ({ neighbors: [], distances: [] })),
        writeIndexSync: jest.fn(), readIndexSync: jest.fn(), getCurrentCount: jest.fn(() => 0),
    })),
}));
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/ollama-client', () => ({ embed: jest.fn(() => Promise.resolve(new Array(4096).fill(0))), generate: jest.fn(() => Promise.resolve('response')), chat: jest.fn() }));

describe('services/vector-store.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        mod = require('../../services/vector-store');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('init', () => {
        it('should be defined', () => {
            expect(mod.init).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.init).toBe('function');
        });
    });

    describe('search', () => {
        it('should be defined', () => {
            expect(mod.search).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.search).toBe('function');
        });
    });

    describe('ingestEmail', () => {
        it('should be defined', () => {
            expect(mod.ingestEmail).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.ingestEmail).toBe('function');
        });
    });

    describe('getStats', () => {
        it('should be defined', () => {
            expect(mod.getStats).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.getStats).toBe('function');
        });
    });

    // NOTE: save() was removed from vector-store.js — test removed to match source exports

    describe('cleanBody', () => {
        it('should be defined', () => {
            expect(mod.cleanBody).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.cleanBody).toBe('function');
        });
    });
});
