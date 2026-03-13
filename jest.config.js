/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/__tests__/services/**/*.test.js',
        '<rootDir>/__tests__/api/**/*.test.js',
        '<rootDir>/__tests__/root/**/*.test.js',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    setupFiles: ['<rootDir>/__tests__/setup-node.js'],
    testPathIgnorePatterns: ['/node_modules/', '/.next/', '/brain/', '/data/', '/__tests__/components/', '/__tests__/pages/'],
    collectCoverageFrom: [
        'services/**/*.js',
        'app/api/**/route.js',
        '!**/node_modules/**',
        '!**/mock-data.js',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'lcov'],
    transform: {
        '^.+\\.js$': 'babel-jest',
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(@modelcontextprotocol)/)',
    ],
};
