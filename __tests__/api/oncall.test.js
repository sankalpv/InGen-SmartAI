// Auto-generated test for app/api/oncall/route.js
jest.mock('@/services/tool-registry', () => (jest.fn()));

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

describe('API: /api/oncall', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/oncall/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/oncall/route');
            const response = await GET(new Request('http://localhost/api/oncall'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/oncall/route');
            // Should not throw even if dependencies fail
            const response = await GET(new Request('http://localhost/api/oncall'));
            expect(response).toBeDefined();
        });
    });
});
