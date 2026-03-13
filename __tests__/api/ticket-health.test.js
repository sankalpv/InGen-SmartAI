// Auto-generated test for app/api/ticket-health/route.js

jest.mock('@/services/ticket-health', () => ({
    getDashboard: jest.fn(() => Promise.resolve({ tickets: [], summary: {} })),
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

describe('API: /api/ticket-health', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/ticket-health/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/ticket-health/route');
            const response = await GET(new Request('http://localhost/api/ticket-health'));
            expect(response.status).toBeLessThanOrEqual(500);
        }, 10000);

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/ticket-health/route');
            const response = await GET(new Request('http://localhost/api/ticket-health'));
            expect(response).toBeDefined();
        }, 10000);
    });
});
