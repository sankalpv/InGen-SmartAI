// Auto-generated test for services/mcp-client.js
jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: jest.fn(() => ({ connect: jest.fn(), callTool: jest.fn(), listTools: jest.fn(), close: jest.fn() })),
    StdioClientTransport: jest.fn(),
}));
jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    Client: jest.fn(() => ({ connect: jest.fn(), callTool: jest.fn(), listTools: jest.fn(), close: jest.fn() })),
    StdioClientTransport: jest.fn(),
}));
jest.mock('fs');
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));

describe('services/mcp-client.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/mcp-client');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('callTool', () => {
        it('should be defined', () => {
            expect(mod.callTool || mod.default?.callTool).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.callTool || mod.default?.callTool;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('listTools', () => {
        it('should be defined', () => {
            expect(mod.listTools || mod.default?.listTools).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.listTools || mod.default?.listTools;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getClient', () => {
        it('should be defined', () => {
            expect(mod.getClient || mod.default?.getClient).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getClient || mod.default?.getClient;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('closeClient', () => {
        it('should be defined', () => {
            expect(mod.closeClient || mod.default?.closeClient).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.closeClient || mod.default?.closeClient;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('closeAll', () => {
        it('should be defined', () => {
            expect(mod.closeAll || mod.default?.closeAll).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.closeAll || mod.default?.closeAll;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('isConnected', () => {
        it('should be defined', () => {
            expect(mod.isConnected || mod.default?.isConnected).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.isConnected || mod.default?.isConnected;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getConnectionStatus', () => {
        it('should be defined', () => {
            expect(mod.getConnectionStatus || mod.default?.getConnectionStatus).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getConnectionStatus || mod.default?.getConnectionStatus;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getMCPConfig', () => {
        it('should be defined', () => {
            expect(mod.getMCPConfig || mod.default?.getMCPConfig).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getMCPConfig || mod.default?.getMCPConfig;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    // ─── parseMCPResponse() — Behavioral Tests ────────────────────────
    describe('parseMCPResponse()', () => {
        it('should be exported as a function', () => {
            expect(typeof mod.parseMCPResponse).toBe('function');
        });

        it('parses string content (raw JSON)', () => {
            const result = { content: JSON.stringify({ data: { tickets: [1, 2] } }) };
            expect(mod.parseMCPResponse(result)).toEqual({ data: { tickets: [1, 2] } });
        });

        it('parses array content with text item', () => {
            const result = {
                content: [
                    { type: 'text', text: JSON.stringify({ data: { groups: ['A'] } }) },
                ],
            };
            expect(mod.parseMCPResponse(result)).toEqual({ data: { groups: ['A'] } });
        });

        it('returns object content as-is', () => {
            const data = { data: { count: 5 } };
            const result = { content: data };
            expect(mod.parseMCPResponse(result)).toBe(data);
        });

        it('returns empty object for null/undefined result', () => {
            expect(mod.parseMCPResponse(null)).toEqual({});
            expect(mod.parseMCPResponse(undefined)).toEqual({});
            expect(mod.parseMCPResponse({})).toEqual({});
        });

        it('returns empty object for invalid JSON string', () => {
            const result = { content: 'not-valid-json{{{' };
            expect(mod.parseMCPResponse(result)).toEqual({});
        });

        it('returns empty object for array with no text item', () => {
            const result = { content: [{ type: 'image', data: 'base64...' }] };
            expect(mod.parseMCPResponse(result)).toEqual({});
        });
    });
});
