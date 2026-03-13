// Auto-generated test for services/slack.js
jest.mock('../../services/mcp-client', () => ({ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }));
jest.mock('../../services/logger', () => ({ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }));
jest.mock('fs');

describe('services/slack.js', () => {
    let mod;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset module between tests
jest.resetModules();
mod = require('../../services/slack');
    });

    it('should export correctly', () => {
        expect(mod).toBeDefined();
    });

    describe('fetchSlackMessages', () => {
        it('should be defined', () => {
            expect(mod.fetchSlackMessages || mod.default?.fetchSlackMessages).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchSlackMessages || mod.default?.fetchSlackMessages;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchChannelMessages', () => {
        it('should be defined', () => {
            expect(mod.fetchChannelMessages || mod.default?.fetchChannelMessages).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchChannelMessages || mod.default?.fetchChannelMessages;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('fetchAllSlackMessages', () => {
        it('should be defined', () => {
            expect(mod.fetchAllSlackMessages || mod.default?.fetchAllSlackMessages).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.fetchAllSlackMessages || mod.default?.fetchAllSlackMessages;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('getWatchChannels', () => {
        it('should be defined', () => {
            expect(mod.getWatchChannels || mod.default?.getWatchChannels).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.getWatchChannels || mod.default?.getWatchChannels;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('sendDM', () => {
        it('should be defined', () => {
            expect(mod.sendDM || mod.default?.sendDM).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.sendDM || mod.default?.sendDM;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('searchSlack', () => {
        it('should be defined', () => {
            expect(mod.searchSlack || mod.default?.searchSlack).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.searchSlack || mod.default?.searchSlack;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('listMyChannels', () => {
        it('should be defined', () => {
            expect(mod.listMyChannels || mod.default?.listMyChannels).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.listMyChannels || mod.default?.listMyChannels;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('postToChannel', () => {
        it('should be defined', () => {
            expect(mod.postToChannel || mod.default?.postToChannel).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.postToChannel || mod.default?.postToChannel;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });

    describe('postToChannelByName', () => {
        it('should be defined', () => {
            expect(mod.postToChannelByName || mod.default?.postToChannelByName).toBeDefined();
        });

        it('should be accessible from module', () => {
            const val = mod.postToChannelByName || mod.default?.postToChannelByName;
            if (typeof val === 'function') {
                expect(typeof val).toBe('function');
            } else {
                expect(val).toBeDefined();
            }
        });
    });
});
