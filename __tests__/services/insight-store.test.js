// Auto-generated test for services/insight-store.js
jest.mock('sqlite3', () => ({
    verbose: jest.fn(() => ({
        Database: jest.fn((path, cb) => { if (cb) cb(null); return {
            run: jest.fn((sql, params, cb) => { if (typeof params === 'function') params(null); else if (cb) cb(null); }),
            get: jest.fn((sql, params, cb) => { if (typeof params === 'function') params(null, {}); else if (cb) cb(null, {}); }),
            all: jest.fn((sql, params, cb) => { if (typeof params === 'function') params(null, []); else if (cb) cb(null, []); }),
            exec: jest.fn((sql, cb) => { if (cb) cb(null); }),
            close: jest.fn((cb) => { if (cb) cb(null); }),
            serialize: jest.fn(fn => { if (fn) fn(); }),
        }; }),
    })),
}));
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/insight-store.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        mod = require('../../services/insight-store');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('storeInsight', () => {
        it('should be defined', () => {
            expect(mod.storeInsight).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.storeInsight).toBe('function');
        });
    });

    describe('getRecentInsights', () => {
        it('should be defined', () => {
            expect(mod.getRecentInsights).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.getRecentInsights).toBe('function');
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

    describe('markAsRead', () => {
        it('should be defined', () => {
            expect(mod.markAsRead).toBeDefined();
        });

        it('should be a function', () => {
            expect(typeof mod.markAsRead).toBe('function');
        });
    });
});
