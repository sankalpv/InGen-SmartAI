// Auto-generated test for services/platform-detector.js
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('../../services/outlook-windows', () => (jest.fn()));
jest.mock('../../services/outlook-local', () => (jest.fn()));
jest.mock('../../services/background-agent-windows', () => (jest.fn()));
jest.mock('../../services/background-agent', () => (jest.fn()));

describe('services/platform-detector.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/platform-detector');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

});
