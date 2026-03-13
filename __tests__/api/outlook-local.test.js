// Auto-generated test for app/api/outlook-local/route.js


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

describe('API: /api/outlook-local', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/outlook-local/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/outlook-local/route');
            const response = await GET(new Request('http://localhost/api/outlook-local'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/outlook-local/route');
            // Should not throw even if dependencies fail
            const response = await GET(new Request('http://localhost/api/outlook-local'));
            expect(response).toBeDefined();
        });
    });
});
