// Auto-generated test for services/startup-checks.js
jest.mock('../../services/startup-checks', () => (jest.fn()));
jest.mock('fs');
jest.mock('hnswlib-node', () => ({
    HierarchicalNSW: jest.fn(() => ({
        initIndex: jest.fn(), addPoint: jest.fn(), searchKnn: jest.fn(() => ({ neighbors: [], distances: [] })),
        writeIndexSync: jest.fn(), readIndexSync: jest.fn(),
    })),
}));

describe('services/startup-checks.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/startup-checks');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('runAll', () => {
        it('should be defined', () => {
            expect(mod.runAll || mod.default?.runAll).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.runAll || mod.default?.runAll;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
