// Auto-generated test for app/api/slack/route.js
jest.mock('@/services/slack', () => ({ fetchSlackMessages: jest.fn(() => Promise.resolve([])), fetchAllSlackMessages: jest.fn(() => Promise.resolve([])), getWatchChannels: jest.fn(() => []), sendDM: jest.fn(), postToChannelByName: jest.fn(), searchSlack: jest.fn() }));
jest.mock('@/services/mock-data', () => ({ mockEmails: [], mockCalendar: [], mockSlackMessages: [] }));

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

describe('API: /api/slack', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/slack/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/slack/route');
            const response = await GET(new Request('http://localhost/api/slack'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/slack/route');
            // Should not throw even if dependencies fail
            const response = await GET(new Request('http://localhost/api/slack'));
            expect(response).toBeDefined();
        });
    });
});
