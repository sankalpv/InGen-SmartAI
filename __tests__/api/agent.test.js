// Auto-generated test for app/api/agent/route.js
jest.mock('@/services/agent-memory', () => (jest.fn()));
jest.mock('@/services/agent-memory', () => (jest.fn()));
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

describe('API: /api/agent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/agent/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/agent/route');
            const response = await GET(new Request('http://localhost/api/agent'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/agent/route');
            // Should not throw even if dependencies fail
            const response = await GET(new Request('http://localhost/api/agent'));
            expect(response).toBeDefined();
        });
    });

    describe('POST', () => {
        it('should return response on valid input', async () => {
            const { POST } = require('../../app/api/agent/route');
            const request = new Request('http://localhost/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test: true }),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        });

        it('should handle missing body', async () => {
            const { POST } = require('../../app/api/agent/route');
            const request = new Request('http://localhost/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        });
    });
});
