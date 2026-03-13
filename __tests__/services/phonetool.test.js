// Auto-generated test for services/phonetool.js
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/mcp-client', () => ({ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }));

describe('services/phonetool.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/phonetool');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('getAlias', () => {
        it('should be defined', () => {
            expect(mod.getAlias || mod.default?.getAlias).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getAlias || mod.default?.getAlias;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchDirectReports', () => {
        it('should be defined', () => {
            expect(mod.fetchDirectReports || mod.default?.fetchDirectReports).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchDirectReports || mod.default?.fetchDirectReports;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchPersonName', () => {
        it('should be defined', () => {
            expect(mod.fetchPersonName || mod.default?.fetchPersonName).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchPersonName || mod.default?.fetchPersonName;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchPersonNames', () => {
        it('should be defined', () => {
            expect(mod.fetchPersonNames || mod.default?.fetchPersonNames).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchPersonNames || mod.default?.fetchPersonNames;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getCachedName', () => {
        it('should be defined', () => {
            expect(mod.getCachedName || mod.default?.getCachedName).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getCachedName || mod.default?.getCachedName;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchOrgTree', () => {
        it('should be defined', () => {
            expect(mod.fetchOrgTree || mod.default?.fetchOrgTree).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchOrgTree || mod.default?.fetchOrgTree;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getOrgFlatList', () => {
        it('should be defined', () => {
            expect(mod.getOrgFlatList || mod.default?.getOrgFlatList).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getOrgFlatList || mod.default?.getOrgFlatList;
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
