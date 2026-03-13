// Auto-generated test for services/tool-registry.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('fs');
jest.mock('../../services/email-search', () => ({ search: jest.fn(() => Promise.resolve([])) }));
jest.mock('fs');
jest.mock('sqlite3', () => jest.fn(() => ({
    prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
    exec: jest.fn(),
    pragma: jest.fn(),
    close: jest.fn(),
})));
jest.mock('../../services/email-search', () => ({ search: jest.fn(() => Promise.resolve([])) }));
jest.mock('../../services/phonetool', () => ({ lookupAlias: jest.fn(() => Promise.resolve({})) }));
jest.mock('../../services/phonetool', () => ({ lookupAlias: jest.fn(() => Promise.resolve({})) }));
jest.mock('fs');
jest.mock('../../services/ticket-health', () => ({ getDashboard: jest.fn(() => Promise.resolve({})) }));
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/mcp-client', () => ({ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }));
jest.mock('../../services/goal-narrative-tools', () => (jest.fn()));

describe('services/tool-registry.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/tool-registry');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('register', () => {
        it('should be defined', () => {
            expect(mod.register || mod.default?.register).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.register || mod.default?.register;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
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

    describe('execute', () => {
        it('should be defined', () => {
            expect(mod.execute || mod.default?.execute).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.execute || mod.default?.execute;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('listAll', () => {
        it('should be defined', () => {
            expect(mod.listAll || mod.default?.listAll).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.listAll || mod.default?.listAll;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
