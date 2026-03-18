// Auto-generated test for services/background-agent-windows.js
// Note: background-agent-windows.js has no module.exports - it runs side effects on import.

jest.mock('node-cron', () => ({ schedule: jest.fn() }));
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/local-store', () => ({ getEmails: jest.fn(() => ({ exists: true, data: [] })), getCalendar: jest.fn(() => ({ exists: true, data: [] })), getIssues: jest.fn(() => ({ exists: false })), fullSync: jest.fn(() => Promise.resolve({ success: true, emails: 0, calendar: 0, elapsed: 0 })) }));
jest.mock('../../services/outlook-windows', () => ({ syncOutlookWindows: jest.fn(() => Promise.resolve({ emails: [], calendar: [] })) }));

describe('services/background-agent-windows.js', () => {
    it('should load without throwing', () => {
        expect(() => {
            require('../../services/background-agent-windows');
        }).not.toThrow();
    });
});
