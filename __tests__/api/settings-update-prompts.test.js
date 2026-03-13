// Auto-generated test for app/api/settings/update-prompts/route.js


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

describe('API: /api/settings/update-prompts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/settings/update-prompts/route');
        expect(route).toBeDefined();
    });

    describe('POST', () => {
        it('should return response on valid input', async () => {
            const { POST } = require('../../app/api/settings/update-prompts/route');
            const request = new Request('http://localhost/api/settings/update-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test: true }),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        });

        it('should handle missing body', async () => {
            const { POST } = require('../../app/api/settings/update-prompts/route');
            const request = new Request('http://localhost/api/settings/update-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        });
    });
});
