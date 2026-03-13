// Auto-generated test for services/org-store.js
jest.mock('sqlite3', () => jest.fn(() => ({
    prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
    exec: jest.fn(),
    pragma: jest.fn(),
    close: jest.fn(),
})));
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/phonetool', () => ({ lookupAlias: jest.fn(() => Promise.resolve({})) }));

describe('services/org-store.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/org-store');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('init', () => {
        it('should be defined', () => {
            expect(mod.init || mod.default?.init).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.init || mod.default?.init;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('saveOrgTree', () => {
        it('should be defined', () => {
            expect(mod.saveOrgTree || mod.default?.saveOrgTree).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.saveOrgTree || mod.default?.saveOrgTree;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('populateFromPhoneTool', () => {
        it('should be defined', () => {
            expect(mod.populateFromPhoneTool || mod.default?.populateFromPhoneTool).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.populateFromPhoneTool || mod.default?.populateFromPhoneTool;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getRootAlias', () => {
        it('should be defined', () => {
            expect(mod.getRootAlias || mod.default?.getRootAlias).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getRootAlias || mod.default?.getRootAlias;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getMemberCount', () => {
        it('should be defined', () => {
            expect(mod.getMemberCount || mod.default?.getMemberCount).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getMemberCount || mod.default?.getMemberCount;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getAllMembers', () => {
        it('should be defined', () => {
            expect(mod.getAllMembers || mod.default?.getAllMembers).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getAllMembers || mod.default?.getAllMembers;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getManagers', () => {
        it('should be defined', () => {
            expect(mod.getManagers || mod.default?.getManagers).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getManagers || mod.default?.getManagers;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getDirectReports', () => {
        it('should be defined', () => {
            expect(mod.getDirectReports || mod.default?.getDirectReports).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getDirectReports || mod.default?.getDirectReports;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getMember', () => {
        it('should be defined', () => {
            expect(mod.getMember || mod.default?.getMember).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getMember || mod.default?.getMember;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getEngineers', () => {
        it('should be defined', () => {
            expect(mod.getEngineers || mod.default?.getEngineers).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getEngineers || mod.default?.getEngineers;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getOrgTree', () => {
        it('should be defined', () => {
            expect(mod.getOrgTree || mod.default?.getOrgTree).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getOrgTree || mod.default?.getOrgTree;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getLastFetched', () => {
        it('should be defined', () => {
            expect(mod.getLastFetched || mod.default?.getLastFetched).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getLastFetched || mod.default?.getLastFetched;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('isPopulated', () => {
        it('should be defined', () => {
            expect(mod.isPopulated || mod.default?.isPopulated).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.isPopulated || mod.default?.isPopulated;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('close', () => {
        it('should be defined', () => {
            expect(mod.close || mod.default?.close).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.close || mod.default?.close;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
