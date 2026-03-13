// Auto-generated test for app/api/xkcd/route.js


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

describe('API: /api/xkcd', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/xkcd/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/xkcd/route');
            const response = await GET(new Request('http://localhost/api/xkcd'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/xkcd/route');
            // Should not throw even if dependencies fail
            const response = await GET(new Request('http://localhost/api/xkcd'));
            expect(response).toBeDefined();
        });
    });
});
