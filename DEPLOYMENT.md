# SmartAI Deployment Guide

## Overview

SmartAI now features a **fully standalone Quip document integration** using a server-side MCP client. The app works independently on any Mac or Windows machine without requiring Cline or VS Code.

## Architecture

```
┌─────────────────────────────────────────┐
│   SmartAI Next.js App                   │
│   ┌───────────────────────────────┐     │
│   │ MCP Client Library            │     │
│   │ (@modelcontextprotocol/sdk)   │     │
│   └───────────┬───────────────────┘     │
│               │                         │
│               ↓                         │
│   ┌───────────────────────────────┐     │
│   │ amzn-mcp Server               │     │
│   │ (local stdio process)         │     │
│   └───────────┬───────────────────┘     │
└───────────────┼─────────────────────────┘
                │
                ↓
         Amazon Internal Sites
         (quip-amazon.com, etc.)
```

## New Features

### 1. Server-Side MCP Integration
- Direct communication with local MCP servers
- No dependency on Cline or VS Code
- Production-ready connection management
- Automatic reconnection and error handling

### 2. Quip Document Context
- **Automatic URL Detection**: Scans emails for Quip links
- **Parallel Fetching**: Fetches up to 5 documents concurrently
- **Smart Caching**: 1-hour in-memory cache to reduce API calls
- **Metadata Extraction**: Automatically extracts title, author, and date
- **Prompt-Based Citations**: AI responses cite documents with proper formatting

### 3. Settings UI
- Toggle Quip document reading on/off
- Configure base URL
- Set max documents per email (1-20)
- Configure timeout (5-120 seconds)
- Live save with feedback

## Installation on New Machines

### Prerequisites
- Node.js 18+ installed
- `amzn-mcp` server installed (see Amazon internal docs)
- Quip API token (get from https://quip-amazon.com/dev/token)

### Mac Installation

1. **Clone the repository**
   ```bash
   cd ~/projects
   git clone <repository-url>
   cd smartai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure MCP server**
   Edit `config/settings.json`:
   ```json
   {
     "mcpServers": {
       "amzn-mcp": {
         "command": "/Users/YOUR_USERNAME/.toolbox/bin/amzn-mcp",
         "args": [],
         "env": {}
       }
     }
   }
   ```

4. **Set up Quip API token**
   ```bash
   mkdir -p ~/.amazon-internal-mcp-server
   echo "QUIP_API_TOKEN=your-token-here" > ~/.amazon-internal-mcp-server/.env
   ```

5. **Configure environment (optional)**
   Create `.env.local`:
   ```bash
   NEXTAUTH_SECRET=$(openssl rand -base64 32)
   AUTH_SECRET=$(openssl rand -base64 32)
   GEMINI_API_KEY=your-gemini-key
   ```

6. **Start the application**
   ```bash
   node launcher.js
   ```

7. **Access the app**
   Open http://localhost:3000

### Windows Installation

1. **Clone the repository**
   ```cmd
   cd C:\projects
   git clone <repository-url>
   cd smartai
   ```

2. **Install dependencies**
   ```cmd
   npm install
   ```

3. **Configure MCP server**
   Edit `config/settings.json`:
   ```json
   {
     "mcpServers": {
       "amzn-mcp": {
         "command": "C:\\Users\\YOUR_USERNAME\\.toolbox\\bin\\amzn-mcp.exe",
         "args": [],
         "env": {}
       }
     }
   }
   ```

4. **Set up Quip API token**
   ```cmd
   mkdir %USERPROFILE%\.amazon-internal-mcp-server
   echo QUIP_API_TOKEN=your-token-here > %USERPROFILE%\.amazon-internal-mcp-server\.env
   ```

5. **Start the application**
   ```cmd
   node launcher.js
   ```

6. **Access the app**
   Open http://localhost:3000

## Configuration

### MCP Servers

Edit `config/settings.json` to add or modify MCP servers:

```json
{
  "mcpServers": {
    "amzn-mcp": {
      "command": "/path/to/amzn-mcp",
      "args": [],
      "env": {}
    },
    "another-server": {
      "command": "/path/to/another-server",
      "args": ["--option", "value"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

### Quip Settings

Settings can be configured via:
1. **UI**: Navigate to Settings → Document Context
2. **File**: Edit `config/settings.json`:

```json
{
  "quip": {
    "enabled": true,
    "baseUrl": "https://quip-amazon.com",
    "maxDocsPerEmail": 5,
    "timeoutSeconds": 30
  }
}
```

## Testing

### Test MCP Connection

```bash
node test-mcp-connection.js
```

Expected output:
```
✅ MCP connection test PASSED!
Successfully connected to amzn-mcp
Found 3 tools
Tool call successful!
Content fetched: "CPP Drift Detection Mental Model..."
```

### Verify Quip Integration

1. Open the app: http://localhost:3000
2. Look for an email with a Quip link
3. Generate a draft reply
4. Check logs for:
   ```
   [QuipFetcher] Found 1 Quip URLs, fetching documents...
   [QuipFetcher] Successfully fetched: Document Title
   [AI] Successfully fetched 1 Quip documents for draft context
   ```

## Troubleshooting

### MCP Connection Issues

**Error**: `MCP server 'amzn-mcp' not configured`
- **Fix**: Add server configuration to `config/settings.json`

**Error**: `Failed to connect to MCP server`
- **Fix**: Verify the command path is correct
- **Fix**: Ensure the MCP server is installed and executable

### Quip API Token Issues

**Error**: `Unable to access Quip document because API token is missing`
- **Fix**: Create `~/.amazon-internal-mcp-server/.env` with your token
- **Fix**: Restart the application after adding the token

**Error**: `API token is invalid`
- **Fix**: Get a new token from https://quip-amazon.com/dev/token
- **Fix**: Update the `.env` file with the new token

### Performance Issues

**Slow document fetching**:
- Reduce `maxDocsPerEmail` in settings
- Increase `timeoutSeconds` if documents are timing out
- Check network connectivity to quip-amazon.com

## Features in Production

### Daily Briefing
- Scans all emails for Quip URLs
- Fetches and caches documents
- AI references documents in priorities:
  > "Review 'CPP Drift Detection Mental Model' (shared by Verma, last updated Feb 19, 2024)"

### Draft Replies
- Detects Quip links in incoming emails
- Fetches document content
- AI cites documents naturally:
  > "Thanks for sharing the 'API Design Doc'. I reviewed Section 3 about..."

### Meeting Briefs
- Coming soon: Quip documents linked from meeting invites

## System Requirements

### Minimum
- Node.js 18+
- 2GB RAM
- 1GB disk space

### Recommended
- Node.js 20+
- 4GB RAM
- 2GB disk space
- SSD for faster vector store operations

## Security Notes

1. **API Tokens**: Store in `~/.amazon-internal-mcp-server/.env` (not in repo)
2. **MCP Servers**: Run locally, never expose to network
3. **Document Cache**: Cleared on restart, 1-hour TTL
4. **Network**: All MCP communication is local stdio, no external connections

## Support

For issues or questions:
1. Check logs in `smartai.log`
2. Run test script: `node test-mcp-connection.js`
3. Verify MCP server installation
4. Contact your team's technical support

## Changelog

### v2.0.0 - Server-Side MCP Integration
- Added `@modelcontextprotocol/sdk` for local MCP connections
- Created `services/mcp-client.js` for connection management
- Updated `services/quip-fetcher.js` to use local MCP
- Added MCP server configuration to `config/settings.json`
- Added Quip settings UI at `/settings`
- Full cross-platform support (Mac/Windows)
- No dependency on Cline or VS Code
- Production-ready deployment

## License

Internal Amazon tool - See company policies for usage guidelines.