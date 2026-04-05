// Behavioral tests for services/insight-store.js
// Tests SQL construction, data transforms, stats math via sqlite3 mock callbacks.

// Shared mock DB methods — survive across jest.clearAllMocks
const mockDb = {
  run: jest.fn(),
  all: jest.fn(),
  get: jest.fn(),
};

function resetDbDefaults() {
  mockDb.run.mockReset();
  mockDb.all.mockReset();
  mockDb.get.mockReset();
  mockDb.run.mockImplementation((sql, params, cb) => {
    if (typeof params === 'function') params.call({ changes: 1 }, null);
    else if (cb) cb.call({ changes: 1 }, null);
  });
  mockDb.all.mockImplementation((sql, params, cb) => {
    if (typeof params === 'function') params(null, []);
    else if (cb) cb(null, []);
  });
  mockDb.get.mockImplementation((sql, params, cb) => {
    if (typeof params === 'function') params(null, { count: 0 });
    else if (cb) cb(null, { count: 0 });
  });
}
resetDbDefaults();

jest.mock('sqlite3', () => ({
  verbose: jest.fn(() => ({
    Database: jest.fn(function (path, cb) {
      this.run = mockDb.run;
      this.get = mockDb.get;
      this.all = mockDb.all;
      this.exec = jest.fn((sql, cb2) => { if (cb2) cb2(null); });
      this.close = jest.fn((cb2) => { if (cb2) cb2(null); });
      this.serialize = jest.fn(fn => { if (fn) fn(); });
      if (cb) process.nextTick(() => cb(null));
    }),
  })),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(() => '{}'),
}));
jest.mock('../../services/logger', () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));
jest.mock('../../services/feedback-store', () => ({
  recordAlertFired: jest.fn(() => Promise.resolve()),
  recordAlertOutcome: jest.fn(() => Promise.resolve()),
}));

describe('services/insight-store.js', () => {
  let store;

  beforeEach(() => {
    resetDbDefaults();
    store = require('../../services/insight-store');
    store.initialized = false;
    store.db = null;
  });

  // ─── Module Exports ─────────────────────────────────────────────
  describe('module exports', () => {
    it('exports storeInsight, getUnreadInsights, markAsRead, getStats, getRecentInsights, close', () => {
      expect(typeof store.storeInsight).toBe('function');
      expect(typeof store.getUnreadInsights).toBe('function');
      expect(typeof store.markAsRead).toBe('function');
      expect(typeof store.getStats).toBe('function');
      expect(typeof store.getRecentInsights).toBe('function');
      expect(typeof store.close).toBe('function');
    });
  });

  // ─── init() ─────────────────────────────────────────────────────
  describe('init()', () => {
    it('initializes database and sets initialized=true', async () => {
      await store.init();
      expect(store.initialized).toBe(true);
    });

    it('is idempotent — second call is a no-op', async () => {
      await store.init();
      await store.init();
      expect(store.initialized).toBe(true);
    });
  });

  // ─── storeInsight() ─────────────────────────────────────────────
  describe('storeInsight()', () => {
    it('returns a string ID matching insight_* pattern', async () => {
      const id = await store.storeInsight({
        type: 'meeting_prep',
        priority: 'high',
        title: 'Upcoming 1:1 with manager',
        description: 'You have a 1:1 in 30 min',
        confidence: 0.9,
      });

      expect(typeof id).toBe('string');
      expect(id).toMatch(/^insight_/);
    });

    it('calls db.run with INSERT SQL containing correct params', async () => {
      await store.storeInsight({
        type: 'ticket_aging',
        priority: 'urgent',
        title: 'SIM-12345 is 30 days old',
        description: 'This ticket needs attention',
        reasoning: 'No activity for 2 weeks',
        confidence: 0.85,
      });

      const insertCall = mockDb.run.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('INSERT INTO insights')
      );
      expect(insertCall).toBeDefined();

      const params = insertCall[1];
      expect(params[1]).toBe('ticket_aging');
      expect(params[2]).toBe('urgent');
      expect(params[3]).toBe('SIM-12345 is 30 days old');
      expect(params[4]).toBe('This ticket needs attention');
      expect(params[5]).toBe('No activity for 2 weeks');
      expect(params[7]).toBe(0.85);
    });
  });

  // ─── getUnreadInsights() ────────────────────────────────────────
  describe('getUnreadInsights()', () => {
    it('returns parsed insight objects with id and createdAt', async () => {
      const mockRows = [
        {
          id: 'insight_001',
          data: JSON.stringify({ type: 'meeting_prep', title: 'Test', priority: 'high' }),
          created_at: 1700000000000,
          read_at: null,
          dismissed_at: null,
        },
      ];

      mockDb.all.mockImplementation((sql, params, cb) => {
        if (typeof sql === 'string' && sql.includes('read_at IS NULL')) {
          cb(null, mockRows);
        } else if (typeof params === 'function') {
          params(null, []);
        } else if (cb) {
          cb(null, []);
        }
      });

      const insights = await store.getUnreadInsights(10);

      expect(Array.isArray(insights)).toBe(true);
      expect(insights.length).toBe(1);
      expect(insights[0]).toHaveProperty('id', 'insight_001');
      expect(insights[0]).toHaveProperty('createdAt', 1700000000000);
      expect(insights[0]).toHaveProperty('type', 'meeting_prep');
    });

    it('passes limit parameter to SQL query', async () => {
      await store.getUnreadInsights(5);

      const selectCall = mockDb.all.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('read_at IS NULL')
      );
      expect(selectCall).toBeDefined();
      expect(selectCall[1]).toEqual([5]);
    });
  });

  // ─── markAsRead() ──────────────────────────────────────────────
  describe('markAsRead()', () => {
    it('calls db.run with UPDATE setting read_at for the given insight ID', async () => {
      await store.markAsRead('insight_123');

      const updateCall = mockDb.run.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('SET read_at')
      );
      expect(updateCall).toBeDefined();
      expect(typeof updateCall[1][0]).toBe('number');
      expect(updateCall[1][1]).toBe('insight_123');
    });
  });

  // ─── dismissInsight() ──────────────────────────────────────────
  describe('dismissInsight()', () => {
    it('calls db.run with UPDATE setting dismissed_at', async () => {
      await store.dismissInsight('insight_456');

      const updateCall = mockDb.run.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('SET dismissed_at')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1][1]).toBe('insight_456');
    });
  });

  // ─── markAsActed() ─────────────────────────────────────────────
  describe('markAsActed()', () => {
    it('calls db.run with UPDATE setting acted_at, action_type, feedback', async () => {
      await store.markAsActed('insight_789', 'clicked_link', 'useful');

      const updateCall = mockDb.run.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('SET acted_at')
      );
      expect(updateCall).toBeDefined();
      expect(typeof updateCall[1][0]).toBe('number');
      expect(updateCall[1][1]).toBe('clicked_link');
      expect(updateCall[1][2]).toBe('useful');
      expect(updateCall[1][3]).toBe('insight_789');
    });
  });

  // ─── hasRecentSimilarInsight() ─────────────────────────────────
  describe('hasRecentSimilarInsight()', () => {
    it('returns true when count > 0', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        if (typeof sql === 'string' && sql.includes('COUNT(*)')) {
          cb(null, { count: 2 });
        } else if (typeof params === 'function') {
          params(null, { count: 0 });
        } else if (cb) {
          cb(null, { count: 0 });
        }
      });

      const result = await store.hasRecentSimilarInsight('meeting_prep', 'Upcoming 1:1', 24);
      expect(result).toBe(true);
    });

    it('returns false when count is 0', async () => {
      const result = await store.hasRecentSimilarInsight('meeting_prep', 'Something new', 24);
      expect(result).toBe(false);
    });
  });

  // ─── getStats() ───────────────────────────────────────────────
  describe('getStats()', () => {
    it('returns correct shape with computed engagementRate', async () => {
      const mockStatsRows = [
        { total: 10, read: 8, acted: 5, dismissed: 2, type: 'meeting_prep', priority: 'high', avg_confidence: 0.9 },
        { total: 5, read: 3, acted: 1, dismissed: 1, type: 'ticket_aging', priority: 'medium', avg_confidence: 0.75 },
      ];

      mockDb.all.mockImplementation((sql, params, cb) => {
        if (typeof sql === 'string' && sql.includes('GROUP BY type')) {
          cb(null, mockStatsRows);
        } else if (typeof params === 'function') {
          params(null, []);
        } else if (cb) {
          cb(null, []);
        }
      });

      const stats = await store.getStats(30);

      expect(stats).toHaveProperty('total', 15);
      expect(stats).toHaveProperty('engaged', 6);
      expect(stats).toHaveProperty('engagementRate');
      expect(parseFloat(stats.engagementRate)).toBeCloseTo(40.0, 0);

      expect(stats.byType).toHaveProperty('meeting_prep');
      expect(stats.byType.meeting_prep.total).toBe(10);
      expect(stats.byType.meeting_prep.acted).toBe(5);

      expect(stats.byPriority).toHaveProperty('high');
      expect(stats.byPriority).toHaveProperty('medium');
      expect(stats).toHaveProperty('avgConfidence');
    });

    it('handles empty stats gracefully', async () => {
      const stats = await store.getStats(30);
      expect(stats.total).toBe(0);
      expect(stats.engagementRate).toBe(0);
    });
  });

  // ─── getRecentInsights() ──────────────────────────────────────
  describe('getRecentInsights()', () => {
    it('returns insights with readAt, dismissedAt, actedAt fields', async () => {
      const mockRows = [
        {
          id: 'insight_recent_1',
          data: JSON.stringify({ type: 'ticket_aging', title: 'Old ticket' }),
          created_at: 1700000000000,
          read_at: 1700001000000,
          dismissed_at: null,
          acted_at: 1700002000000,
        },
      ];

      mockDb.all.mockImplementation((sql, params, cb) => {
        if (typeof sql === 'string' && sql.includes('created_at >') && !sql.includes('read_at IS NULL')) {
          cb(null, mockRows);
        } else if (typeof params === 'function') {
          params(null, []);
        } else if (cb) {
          cb(null, []);
        }
      });

      const insights = await store.getRecentInsights(7, 50);
      expect(insights.length).toBe(1);
      expect(insights[0]).toHaveProperty('readAt', 1700001000000);
      expect(insights[0]).toHaveProperty('actedAt', 1700002000000);
      expect(insights[0]).toHaveProperty('dismissedAt', null);
    });
  });

  // ─── cleanupOldInsights() ─────────────────────────────────────
  describe('cleanupOldInsights()', () => {
    it('calls DELETE and returns number of rows deleted', async () => {
      mockDb.run.mockImplementation((sql, params, cb) => {
        if (typeof sql === 'string' && sql.includes('DELETE FROM insights')) {
          cb.call({ changes: 7 }, null);
        } else if (typeof params === 'function') {
          params.call({ changes: 0 }, null);
        } else if (cb) {
          cb.call({ changes: 0 }, null);
        }
      });

      const deleted = await store.cleanupOldInsights(90);
      expect(deleted).toBe(7);
    });
  });

  // ─── submitFeedback() ─────────────────────────────────────────
  describe('submitFeedback()', () => {
    it('calls db.run with UPDATE setting feedback_score and feedback_comment', async () => {
      await store.submitFeedback('insight_fb1', 5, 'Very helpful');

      const updateCall = mockDb.run.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('SET feedback_score')
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[1][0]).toBe(5);
      expect(updateCall[1][1]).toBe('Very helpful');
      expect(updateCall[1][2]).toBe('insight_fb1');
    });
  });
});
