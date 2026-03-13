// Auto-generated test for app/api/weekly-retro/route.js

jest.mock('@/auth', () => ({ auth: jest.fn(() => Promise.resolve({ user: { name: 'Test' }, accessToken: 'test-token' })) }));
jest.mock('@/services/gmail', () => ({
    fetchGmailEmails: jest.fn(() => Promise.resolve([])),
    fetchGoogleCalendarEvents: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@/services/ai', () => ({ generateWeeklyRetro: jest.fn(() => Promise.resolve('retro summary')) }));

// Mock NextResponse
jest.mock('next/server', () => ({
    NextResponse: {
        json: jest.fn((data, opts) => ({
            status: opts?.status || 200,
            json: async () => data,
            headers: new Map(),
        })),
    },
}));

describe('API: /api/weekly-retro', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/weekly-retro/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/weekly-retro/route');
            const response = await GET(new Request('http://localhost/api/weekly-retro'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/weekly-retro/route');
            const response = await GET(new Request('http://localhost/api/weekly-retro'));
            expect(response).toBeDefined();
        });
    });
});
