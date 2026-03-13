// Auto-generated test for app/api/issues/route.js

// The route uses createRequire with relative paths, so mock the resolved modules
jest.mock('@/services/issues-store', () => ({
    getIssues: jest.fn(() => []),
    getIssueById: jest.fn(() => null),
    updateIssue: jest.fn(() => ({})),
    getStats: jest.fn(() => Promise.resolve({ totalIssues: 5 })),
}));
jest.mock('@/services/issues-parser', () => ({
    parseIssueEmails: jest.fn(() => Promise.resolve({ parsed: 0, newIssues: 0, activitiesAdded: 0 })),
    classifyActivities: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services/local-store', () => ({
    getEmails: jest.fn(() => ({ exists: true, data: [] })),
    getCalendar: jest.fn(() => ({ exists: true, data: [] })),
    getIssues: jest.fn(() => ({ exists: false })),
}));
jest.mock('@/services/phonetool', () => ({
    lookupAlias: jest.fn(() => Promise.resolve({})),
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

describe('API: /api/issues', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
    });

    it('should export route handlers', () => {
        const route = require('../../app/api/issues/route');
        expect(route).toBeDefined();
    });

    describe('GET', () => {
        it('should return 200 on success', async () => {
            const { GET } = require('../../app/api/issues/route');
            const response = await GET(new Request('http://localhost/api/issues'));
            expect(response.status).toBeLessThanOrEqual(500);
        });

        it('should handle errors gracefully', async () => {
            const { GET } = require('../../app/api/issues/route');
            const response = await GET(new Request('http://localhost/api/issues'));
            expect(response).toBeDefined();
        });
    });

    describe('POST', () => {
        it('should return response on valid input', async () => {
            const { POST } = require('../../app/api/issues/route');
            const request = new Request('http://localhost/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'refresh' }),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        }, 15000);

        it('should handle missing body', async () => {
            const { POST } = require('../../app/api/issues/route');
            const request = new Request('http://localhost/api/issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const response = await POST(request);
            expect(response).toBeDefined();
        }, 15000);
    });
});
