// Auto-generated test for app/api/slack/send/route.js
jest.mock('@/services/slack', () => ({ fetchSlackMessages: jest.fn(() => Promise.resolve([])), fetchAllSlackMessages: jest.fn(() => Promise.resolve([])), getWatchChannels: jest.fn(() => []), sendDM: jest.fn(), postToChannelByName: jest.fn(), searchSlack: jest.fn() }));

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

describe('API: /api/slack/send', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/slack/send/route');
        expect(route).toBeDefined();
    });

    describe('POST', () => {
        it('should return response on valid input', async () => {
            const { POST } = require('../../app/api/slack/send/route');
            const request = new Request('http://localhost/api/slack/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ test: true }),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        });

        it('should handle missing body', async () => {
            const { POST } = require('../../app/api/slack/send/route');
            const request = new Request('http://localhost/api/slack/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        });
    });
});
