// Node test setup - mock common dependencies
process.env.NODE_ENV = 'test';
process.env.USE_MOCK_DATA = 'true';

// Suppress console noise in tests
const originalConsole = { ...console };
global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
};

// Mock fetch globally
global.fetch = jest.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
}));
