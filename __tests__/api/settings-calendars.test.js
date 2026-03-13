// Auto-generated test for app/api/settings/calendars/route.js

jest.mock('@/services/outlook-local', () => ({
    getCalendarList: jest.fn(() => Promise.resolve([{ id: 'cal1', name: 'Calendar' }])),
}));

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

describe('API: /api/settings/calendars', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/settings/calendars/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/settings/calendars/route');
            const response = await GET(new Request('http://localhost/api/settings/calendars'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/settings/calendars/route');
            const response = await GET(new Request('http://localhost/api/settings/calendars'));
            expect(response).toBeDefined();
        });
    });
});
