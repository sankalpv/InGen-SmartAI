// Behavioral tests for app/api/issues/route.js
// Tests HTTP contract: status codes, response shapes, error handling for GET and POST.

jest.mock('@/services/issues-store', () => ({
  init: jest.fn(() => Promise.resolve()),
  getOpenIssues: jest.fn(() => Promise.resolve([{ id: 'I-001', title: 'Open bug' }])),
  getIssueById: jest.fn(() => null),
  getStats: jest.fn(() => Promise.resolve({ totalIssues: 5 })),
  getAgingIssues: jest.fn(() => Promise.resolve([])),
  getSlaViolations: jest.fn(() => Promise.resolve([])),
  getCrossTeamDependencies: jest.fn(() => Promise.resolve([])),
  getPersonActivitySummary: jest.fn(() => Promise.resolve([])),
  getPersonActivityBreakdown: jest.fn(() => Promise.resolve([])),
  getPersonSummaries: jest.fn(() => Promise.resolve([])),
  getIssueTimeline: jest.fn(() => Promise.resolve([])),
  getIssuesByType: jest.fn(() => Promise.resolve([])),
  getWeeklyVelocity: jest.fn(() => Promise.resolve([])),
  getPersonActivities: jest.fn(() => Promise.resolve([])),
  getPersonSummary: jest.fn(() => Promise.resolve({})),
  getIssuesByOwner: jest.fn(() => Promise.resolve([])),
  getOwnerActivityBreakdown: jest.fn(() => Promise.resolve([])),
  getCombinedPeopleSummary: jest.fn(() => Promise.resolve([])),
  getOwnerIssues: jest.fn(() => Promise.resolve([])),
}));
jest.mock('@/services/issues-parser', () => ({
  parseIssueEmails: jest.fn(() => Promise.resolve({ parsed: 3, newIssues: 1, activitiesAdded: 5 })),
  classifyActivities: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/services/local-store', () => ({
  getEmails: jest.fn(() => ({ exists: true, data: [] })),
  getCalendar: jest.fn(() => ({ exists: true, data: [] })),
  getIssues: jest.fn(() => ({ exists: false })),
  fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 10, calendar: 5, issues: 3, elapsed: 1200 })),
}));
jest.mock('@/services/phonetool', () => ({
  lookupAlias: jest.fn(() => Promise.resolve({})),
  fetchPersonNames: jest.fn(() => Promise.resolve({})),
}));

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
  let GET, POST, issuesStore;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    issuesStore = require('@/services/issues-store');
    ({ GET, POST } = require('../../app/api/issues/route'));
  });

  describe('GET ?view=open (default)', () => {
    it('returns 200 with { view, data, source } shape', async () => {
      const res = await GET(new Request('http://localhost/api/issues'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('view', 'open');
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('source', 'sqlite');
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET ?view=stats', () => {
    it('returns stats with rawCache info', async () => {
      const res = await GET(new Request('http://localhost/api/issues?view=stats'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.view).toBe('stats');
      expect(body.data).toHaveProperty('totalIssues');
      expect(body.data).toHaveProperty('rawCache');
    });
  });

  describe('GET ?view=timeline', () => {
    it('returns 400 when issueId is missing', async () => {
      const res = await GET(new Request('http://localhost/api/issues?view=timeline'));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('issueId');
    });

    it('returns timeline when issueId is provided', async () => {
      const res = await GET(new Request('http://localhost/api/issues?view=timeline&issueId=abc123'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.view).toBe('timeline');
    });
  });

  describe('GET ?view=names', () => {
    it('returns 400 when aliases parameter is missing', async () => {
      const res = await GET(new Request('http://localhost/api/issues?view=names'));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('aliases');
    });
  });

  describe('GET ?view=invalid', () => {
    it('returns 400 for unknown view', async () => {
      const res = await GET(new Request('http://localhost/api/issues?view=foobar'));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Unknown view');
    });
  });

  describe('GET error handling', () => {
    it('returns 500 when service throws', async () => {
      issuesStore.getOpenIssues.mockRejectedValueOnce(new Error('DB corrupt'));

      const res = await GET(new Request('http://localhost/api/issues'));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toContain('DB corrupt');
    });
  });

  describe('POST (manual sync)', () => {
    it('returns success with sync + parse + stats shape', async () => {
      const localStore = require('@/services/local-store');
      localStore.getIssues.mockReturnValue({ exists: true, data: [{ id: 'e1' }] });

      const request = new Request('http://localhost/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' }),
      });

      const res = await POST(request);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('sync');
      expect(body.sync).toHaveProperty('emails');
      expect(body).toHaveProperty('parse');
      expect(body.parse).toHaveProperty('parsed');
      expect(body).toHaveProperty('stats');
    }, 15000);

    it('returns 500 when sync fails', async () => {
      const localStore = require('@/services/local-store');
      localStore.fullSync.mockRejectedValueOnce(new Error('Outlook unavailable'));

      const request = new Request('http://localhost/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await POST(request);
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toContain('Outlook unavailable');
    }, 15000);
  });
});
