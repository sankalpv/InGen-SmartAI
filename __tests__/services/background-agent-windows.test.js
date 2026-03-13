// Auto-generated test for services/background-agent-windows.js
jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('fs');
jest.mock('../../services/vector-store', () => ({ init: jest.fn(), search: jest.fn(() => Promise.resolve([])), ingestEmail: jest.fn(), ingestSlackMessage: jest.fn(), save: jest.fn(), getStats: jest.fn(() => ({ totalDocuments: 0 })) }));
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/background-agent-windows.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/background-agent-windows');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('runSync', () => {
        it('should be defined', () => {
            expect(mod.runSync || mod.default?.runSync).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.runSync || mod.default?.runSync;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
