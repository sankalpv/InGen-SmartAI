// Behavioral tests for app/api/ticket-health/route.js
// Tests HTTP contract: status codes, response shapes, error handling.

jest.mock('@/services/ticket-health', () => ({
  buildDashboard: jest.fn(() => Promise.resolve({ summary: { totalOpen: 5 }, groups: [] })),
  getGroupDetail: jest.fn((name) => Promise.resolve({ groupName: name, tickets: [], total: 0 })),
  getMyTickets: jest.fn(() => Promise.resolve([{ id: 'T-001', title: 'My ticket' }])),
  clearCache: jest.fn(),
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

describe('API: /api/ticket-health', () => {
  let GET, ticketHealth;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    ticketHealth = require('@/services/ticket-health');
    ({ GET } = require('../../app/api/ticket-health/route'));
  });

  describe('GET ?view=dashboard (default)', () => {
    it('returns 200 with { view, data } shape', async () => {
      const res = await GET(new Request('http://localhost/api/ticket-health'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('view', 'dashboard');
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('summary');
      expect(ticketHealth.buildDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET ?view=group', () => {
    it('returns group detail when name is provided', async () => {
      const res = await GET(new Request('http://localhost/api/ticket-health?view=group&name=TeamAlpha'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.view).toBe('group');
      expect(body.data.groupName).toBe('TeamAlpha');
      expect(ticketHealth.getGroupDetail).toHaveBeenCalledWith('TeamAlpha');
    });

    it('returns 400 when name parameter is missing', async () => {
      const res = await GET(new Request('http://localhost/api/ticket-health?view=group'));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toContain('name');
    });
  });

  describe('GET ?view=my-tickets', () => {
    it('returns user tickets', async () => {
      const res = await GET(new Request('http://localhost/api/ticket-health?view=my-tickets'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.view).toBe('my-tickets');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data[0].id).toBe('T-001');
    });
  });

  describe('GET ?view=refresh', () => {
    it('clears cache and rebuilds dashboard', async () => {
      const res = await GET(new Request('http://localhost/api/ticket-health?view=refresh'));
      expect(res.status).toBe(200);
      expect(ticketHealth.clearCache).toHaveBeenCalled();
      expect(ticketHealth.buildDashboard).toHaveBeenCalledWith(true);
    });
  });

  describe('GET ?view=invalid', () => {
    it('returns 400 for unknown view', async () => {
      const res = await GET(new Request('http://localhost/api/ticket-health?view=foobar'));
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('Unknown view');
    });
  });

  describe('error handling', () => {
    it('returns 500 when service throws', async () => {
      ticketHealth.buildDashboard.mockRejectedValueOnce(new Error('MCP unreachable'));

      const res = await GET(new Request('http://localhost/api/ticket-health'));
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body.error).toContain('MCP unreachable');
    });
  });
});
