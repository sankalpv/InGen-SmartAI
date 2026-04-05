// Behavioral tests for services/ticket-health.js
// Tests buildDashboard aggregation, caching, getGroupDetail, getMyTickets with mocked MCP responses.

const mockCallTool = jest.fn();
jest.mock('../../services/mcp-client', () => ({
  callTool: (...args) => mockCallTool(...args),
  listTools: jest.fn(),
  getClient: jest.fn(),
  closeAll: jest.fn(),
  isConnected: jest.fn(),
  getConnectionStatus: jest.fn(),
  getMCPConfig: jest.fn(),
}));
jest.mock('../../services/oncall', () => ({
  getOncallForResolverGroups: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../services/logger', () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(() => JSON.stringify({ phonetoolAlias: 'testuser' })),
  existsSync: jest.fn(() => true),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// ─── Fixtures ────────────────────────────────────────────────────
function mcpResponse(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

const GROUPS_RESPONSE = mcpResponse({
  data: {
    groups: [
      {
        id: 'g1',
        name: 'TeamAlpha',
        description: 'Alpha team',
        primaryOwner: { value: 'testuser' },
        secondaryOwners: [{ value: 'bob' }],
        baselineStatus: 'UP_TO_DATE',
        status: 'ACTIVE',
      },
      {
        id: 'g2',
        name: 'TeamBeta',
        description: 'Beta team',
        primaryOwner: { value: 'alice' },
        secondaryOwners: [],
        baselineStatus: 'OVERDUE',
        status: 'ACTIVE',
      },
    ],
  },
});

// Two open tickets: one 3-day old, one 35-day old
const now = Date.now();
const OPEN_TICKETS_RESPONSE = mcpResponse({
  data: {
    tickets: [
      {
        id: 'T-001',
        title: 'Fresh ticket',
        extensions: { tt: { status: 'Assigned', assignedGroup: 'TeamAlpha', impact: '3' } },
        assigneeIdentity: 'kerberos:testuser@ANT.AMAZON.COM',
        createDate: new Date(now - 3 * 86400000).toISOString(),
        lastUpdatedDate: new Date(now - 86400000).toISOString(),
      },
      {
        id: 'T-002',
        title: 'Old ticket',
        extensions: { tt: { status: 'Work In Progress', assignedGroup: 'TeamAlpha', impact: '2' } },
        assigneeIdentity: 'kerberos:bob@ANT.AMAZON.COM',
        createDate: new Date(now - 35 * 86400000).toISOString(),
        lastUpdatedDate: new Date(now - 10 * 86400000).toISOString(),
      },
    ],
  },
});

const RESOLVED_TICKETS_RESPONSE = mcpResponse({
  data: {
    tickets: [
      {
        id: 'T-003',
        title: 'Resolved ticket',
        extensions: { tt: { status: 'Resolved', assignedGroup: 'TeamAlpha' } },
        createDate: new Date(now - 20 * 86400000).toISOString(),
        lastResolvedDate: new Date(now - 2 * 86400000).toISOString(),
      },
    ],
  },
});

function setupMockMCP() {
  mockCallTool.mockImplementation((server, tool, params) => {
    if (params.action === 'get-my-resolver-groups') return Promise.resolve(GROUPS_RESPONSE);
    if (params.action === 'search-tickets') {
      const statuses = params.input?.status || [];
      if (statuses.includes('Resolved')) return Promise.resolve(RESOLVED_TICKETS_RESPONSE);
      return Promise.resolve(OPEN_TICKETS_RESPONSE);
    }
    return Promise.resolve(mcpResponse({}));
  });
}

describe('services/ticket-health.js', () => {
  let mod;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    setupMockMCP();
    mod = require('../../services/ticket-health');
    mod.clearCache();
  });

  // ─── Module Exports ─────────────────────────────────────────────
  describe('module exports', () => {
    it('exports buildDashboard, getGroupDetail, getMyTickets, clearCache', () => {
      expect(typeof mod.buildDashboard).toBe('function');
      expect(typeof mod.getGroupDetail).toBe('function');
      expect(typeof mod.getMyTickets).toBe('function');
      expect(typeof mod.clearCache).toBe('function');
    });
  });

  // ─── buildDashboard() ───────────────────────────────────────────
  describe('buildDashboard()', () => {
    it('returns correct dashboard shape with summary, groups, agingTickets, myTickets, allTickets', async () => {
      const dashboard = await mod.buildDashboard();

      expect(dashboard).toHaveProperty('userAlias', 'testuser');
      expect(dashboard).toHaveProperty('timestamp');
      expect(dashboard).toHaveProperty('summary');
      expect(dashboard).toHaveProperty('groups');
      expect(dashboard).toHaveProperty('agingTickets');
      expect(dashboard).toHaveProperty('myTickets');
      expect(dashboard).toHaveProperty('allTickets');
    });

    it('computes correct summary aggregations', async () => {
      const dashboard = await mod.buildDashboard();
      const s = dashboard.summary;

      expect(s.totalOpen).toBe(2);
      expect(s.totalResolved30d).toBe(1);
      expect(s.totalGroups).toBe(2);
      // T-002 is 35 days old → aging7d, aging14d, aging30d all include it
      expect(s.aging30d).toBeGreaterThanOrEqual(1);
      expect(s.aging7d).toBeGreaterThanOrEqual(1);
    });

    it('assigns correct aging buckets to tickets', async () => {
      const dashboard = await mod.buildDashboard();
      const allTickets = dashboard.allTickets;

      // T-001 is ~3 days old → bucket "ok"
      const fresh = allTickets.find(t => t.id === 'T-001');
      expect(fresh.ageBucket).toBe('ok');

      // T-002 is ~35 days old → bucket "critical"
      const old = allTickets.find(t => t.id === 'T-002');
      expect(old.ageBucket).toBe('critical');
    });

    it('identifies myTickets based on user alias', async () => {
      const dashboard = await mod.buildDashboard();

      // T-001 is assigned to testuser via kerberos:testuser@ANT.AMAZON.COM
      expect(dashboard.myTickets.length).toBe(1);
      expect(dashboard.myTickets[0].id).toBe('T-001');
      expect(dashboard.myTickets[0].assignee).toBe('testuser');
    });

    it('computes per-group breakdowns correctly', async () => {
      const dashboard = await mod.buildDashboard();

      // Both tickets are in TeamAlpha
      const alphaGroup = dashboard.groups.find(g => g.name === 'TeamAlpha');
      expect(alphaGroup).toBeDefined();
      expect(alphaGroup.open).toBe(2);
      expect(alphaGroup.resolved30d).toBe(1);
      expect(alphaGroup.role).toBe('Primary Owner'); // testuser is primaryOwner

      const betaGroup = dashboard.groups.find(g => g.name === 'TeamBeta');
      expect(betaGroup).toBeDefined();
      expect(betaGroup.open).toBe(0);
    });

    it('includes status distribution in summary', async () => {
      const dashboard = await mod.buildDashboard();
      const dist = dashboard.summary.statusDistribution;

      expect(dist).toHaveProperty('Assigned', 1);
      expect(dist).toHaveProperty('Work In Progress', 1);
    });

    it('counts baseline-overdue groups', async () => {
      const dashboard = await mod.buildDashboard();
      // TeamBeta has baselineStatus OVERDUE
      expect(dashboard.summary.baselineOverdue).toBe(1);
    });

    it('returns empty dashboard when no resolver groups found', async () => {
      mockCallTool.mockImplementation((server, tool, params) => {
        if (params.action === 'get-my-resolver-groups') {
          return Promise.resolve(mcpResponse({ data: { groups: [] } }));
        }
        return Promise.resolve(mcpResponse({}));
      });

      const dashboard = await mod.buildDashboard(true);
      expect(dashboard.empty).toBe(true);
      expect(dashboard.message).toContain('No resolver groups');
    });
  });

  // ─── Caching ────────────────────────────────────────────────────
  describe('caching', () => {
    it('returns cached result on second call without re-fetching', async () => {
      await mod.buildDashboard();
      expect(mockCallTool).toHaveBeenCalled();
      const firstCallCount = mockCallTool.mock.calls.length;

      const dashboard2 = await mod.buildDashboard();
      // No new MCP calls should be made
      expect(mockCallTool.mock.calls.length).toBe(firstCallCount);
      expect(dashboard2).toHaveProperty('summary');
    });

    it('clearCache forces fresh fetch on next buildDashboard call', async () => {
      await mod.buildDashboard();
      const firstCallCount = mockCallTool.mock.calls.length;

      mod.clearCache();
      await mod.buildDashboard();
      // Should have made new MCP calls
      expect(mockCallTool.mock.calls.length).toBeGreaterThan(firstCallCount);
    });

    it('forceRefresh=true bypasses cache', async () => {
      await mod.buildDashboard();
      const firstCallCount = mockCallTool.mock.calls.length;

      await mod.buildDashboard(true);
      expect(mockCallTool.mock.calls.length).toBeGreaterThan(firstCallCount);
    });
  });

  // ─── getGroupDetail() ──────────────────────────────────────────
  describe('getGroupDetail()', () => {
    it('returns tickets filtered by group name from cache', async () => {
      // Populate cache first
      await mod.buildDashboard();

      const detail = await mod.getGroupDetail('TeamAlpha');
      expect(detail.groupName).toBe('TeamAlpha');
      expect(detail.total).toBe(2);
      expect(detail.tickets.length).toBe(2);
    });

    it('fetches fresh when cache is cold', async () => {
      // Don't populate cache — getGroupDetail should call fetchOpenTickets
      const detail = await mod.getGroupDetail('TeamAlpha');
      expect(detail.groupName).toBe('TeamAlpha');
      expect(mockCallTool).toHaveBeenCalled();
    });
  });

  // ─── getMyTickets() ────────────────────────────────────────────
  describe('getMyTickets()', () => {
    it('returns only tickets assigned to the current user', async () => {
      const myTickets = await mod.getMyTickets();
      expect(Array.isArray(myTickets)).toBe(true);
      expect(myTickets.length).toBe(1);
      expect(myTickets[0].assignee).toBe('testuser');
    });
  });

  // ─── Error Handling ────────────────────────────────────────────
  describe('error handling', () => {
    it('handles MCP callTool failure for open tickets gracefully', async () => {
      mockCallTool.mockImplementation((server, tool, params) => {
        if (params.action === 'get-my-resolver-groups') return Promise.resolve(GROUPS_RESPONSE);
        if (params.action === 'search-tickets') return Promise.reject(new Error('MCP down'));
        return Promise.resolve(mcpResponse({}));
      });

      // Should not throw — errors are caught internally
      const dashboard = await mod.buildDashboard(true);
      expect(dashboard).toHaveProperty('summary');
      expect(dashboard.summary.totalOpen).toBe(0); // No tickets fetched due to error
    });
  });
});
