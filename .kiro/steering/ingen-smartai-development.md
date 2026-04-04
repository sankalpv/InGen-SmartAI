---
inclusion: auto
---

# InGen-SmartAI Development Guide

## Project Overview

InGen is a Next.js 16 app (React 19) that serves as an intelligent agent dashboard for Amazon engineering directors. It integrates with Outlook, Taskei/SIM, Slack, and AWS Bedrock to provide email briefings, goal tracking, team health, and AI-powered insights. It runs entirely on the user's laptop — no cloud deployment.

## Tech Stack

- Next.js 16.1.6 with App Router (src/app/ directory)
- React 19.2.3
- Node.js backend lib modules (src/lib/ directory — ESM `import`/`export`)
- SQLite via Drizzle ORM for local data (data/{env}/smartai.db)
- AWS Bedrock (Claude Sonnet 4) as primary AI provider
- Ollama (qwen3:latest) as local fallback AI
- MCP (Model Context Protocol) for tool integrations (builder-mcp, slack-mcp, amzn-mcp, outlook-mcp)
- Direct Taskei GraphQL API via Midway cookie auth (taskei-client.js)
- Direct GitHub Enterprise API via PAT auth (github-metrics.js)
- Jest 29 for testing
- ESLint 9 flat config with next/core-web-vitals
- hnswlib-node for vector similarity search (optional native addon)

## Directory Structure

```
InGen-SmartAI/
├── src/                    # Application source code
│   ├── app/                # Next.js App Router pages & API routes
│   │   ├── api/            # API routes (route.js files) — 40 endpoints
│   │   ├── wbr/            # WBR dashboard page
│   │   ├── eng-metrics/    # Code metrics page
│   │   ├── ticket-health/  # Ticket health page
│   │   ├── leadership/     # Leadership analytics page
│   │   ├── my-team/        # Team health (WBR goals) page
│   │   ├── org-pulse/      # Org pulse page
│   │   ├── team-pulse/     # Team pulse page
│   │   ├── week-ahead/     # Week ahead page
│   │   ├── agent/          # Agent workspace page
│   │   ├── settings/       # Settings page
│   │   └── ...             # Other pages
│   ├── components/         # React components (all client-side, 'use client')
│   ├── hooks/              # React hooks
│   ├── lib/                # Backend lib modules (61 modules, all ESM)
│   └── utils/              # Shared utility functions
├── config/                 # Configuration files
│   ├── settings.json       # User-configurable runtime settings (hot-reloadable)
│   └── prompts.json        # AI prompt templates (hot-reloadable via prompt-loader)
├── brain/                  # AI cache, embeddings, ECD history, vector index
├── data/                   # SQLite database (data/{env}/smartai.db) + vector store files
├── scripts/                # Utility & diagnostic scripts
└── __tests__/              # Jest test suites
    ├── lib/                # Lib module unit tests (29 suites)
    ├── api/                # API route integration tests (to be rewritten with minimal mocking)
    ├── components/         # Component tests (20 suites, jsdom)
    ├── hooks/              # Hook behavioral tests (4 suites — exemplary patterns)
    ├── integration/        # Integration tests (boundary-only mocking, real service composition)
    └── properties/         # Property-based correctness tests (15 properties)
```

## Code Conventions

### Module System Standard: ESM Everywhere

All application code uses ES Modules (`import`/`export`). This is the Next.js recommended standard.

- Services, API routes, pages, and components all use ESM syntax
- `import X from 'Y'` for default imports, `import { a, b } from 'Y'` for named imports
- `export function`, `export default`, or `export { fn1, fn2 }` for exports
- Add `.js` extension to local imports: `import logger from './logger.js'`
- No `.js` extension for npm packages or Node built-ins: `import fs from 'fs'`
- Use `@/` alias for cross-directory imports: `import logger from '@/lib/logger.js'`
- Tests remain CJS (`require`/`jest.mock`) — the Babel transform handles ESM→CJS conversion for Jest
- Do NOT use dynamic `require()` in application code — use top-level `import` or `await import()` for conditional loading

### Lib Modules (src/lib/\*.js)

- ES modules (`import`/`export`) — all 61 lib modules use ESM
- Logger pattern: `import loggerModule from './logger.js'; const logger = loggerModule.child('MODULE_NAME');`
- NEVER use raw `console.log/error` — always use the structured logger (exception: `path-resolver.js` which cannot import logger due to circular dependency)
- Read config via: `const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));`
- Use `path.join(process.cwd(), 'config', 'settings.json')` for config path (NOT `__dirname`)
- MCP tool calls: `await mcpClient.callTool('server-name', 'ToolName', params)`
- Always handle MCP response parsing: `import { parseMCPResponse } from './mcp-response-parser.js'`
- Rate limit Taskei calls (2s between calls, 5s base exponential backoff with jitter — see rate-limiter.js)
- Singleton pattern for stateful services: `insight-store.js`, `vector-store.js`, `ollama-client.js` use `export default new MyClass()`
- Side-effect modules (auto-start on import): `mcp-server.js` — avoid creating new ones
- Background jobs run via Inngest functions in `src/inngest/functions/` — served through `/api/inngest` route
- Lazy initialization for SQLite: single consolidated `data/{env}/smartai.db` via Drizzle ORM — see `drizzle-sqlite-best-practices.md`
- All database access through Drizzle `db` instance — never raw `sqlite.prepare()` in domain modules
- PRAGMA settings configured once in `db/connection.js`: `journal_mode=WAL; busy_timeout=5000; foreign_keys=ON;`

### API Routes (src/app/api/\*/route.js)

- ES modules (`import`/`export`)
- Use `NextResponse.json()` for responses
- Export named functions: `export async function GET(req)` / `export async function POST(req)`
- Always return proper error responses with status codes
- Import lib modules directly with ESM: `import { chatWithData } from '@/lib/ai.js';`
- Use `@/` alias for ALL lib module imports — no relative `../../../` paths
- ALL lib module imports should be top-level static `import` statements — do NOT use dynamic `require()` or lazy loading inside handlers (Node.js caches modules after first load, so there's zero performance benefit)
- The only exception for dynamic loading is truly optional native modules — use `await import()` for those, never `require()`
- Do NOT use `createRequire` — it's a CJS pattern that bypasses the bundler's static analysis
- Set `export const runtime = 'nodejs';` for routes using Node.js APIs
- Set `export const dynamic = 'force-dynamic';` for routes that must not be cached
- Set `export const maxDuration = N;` for long-running routes (agent: 300s, wbr: 300s, morning-briefing: 120s)
- Use the `view` query parameter pattern for multi-view endpoints (switch statement)
- Keep routes thin — delegate business logic to lib modules, don't inline it

### Components (src/components/\*.js)

- Client components: `'use client';` directive at top
- Use `lucide-react` for icons (import individually: `import { X, Send } from 'lucide-react'`)
- Use `@/` path alias for imports (maps to src/ via jsconfig.json)
- Theme via `useTheme()` from `@/components/ThemeProvider`
- Fetch data from API routes, never import lib modules directly
- Use CSS variables for colors (defined in globals.css) — NOT hardcoded rgba values
- Wrap pages in `<div className="dark-inline-page">` if using inline styles (enables light mode overrides)
- Persist user preferences to `localStorage` with `ingen-` prefix

### Configuration (config/settings.json)

- All user-configurable values live here — hot-reloadable (no restart needed)
- Settings API (`/api/settings/config`) reads and merges settings
- Never hardcode team-specific values in service code — always read from config
- New settings should have sensible defaults when the key is missing
- Key sections: `wbr`, `bedrock`, `engMetrics`, `quip`, `mcpServers`, `rateLimiter`, `telemetry`

### AI Provider Pattern

- Always use Bedrock as primary, Ollama as fallback — never Ollama-only
- Use `bedrock-client.js` for all AI calls (it handles the cascade internally)
- For streaming: `bedrockClient.streamGenerate(prompt, onChunk, options)`
- For completion: `bedrockClient.generate(prompt, options)`
- For embeddings: `bedrockClient.embed(text, options)` (Titan V2, 1024 dims)
- Check availability: `bedrockClient.isAvailable()` before attempting
- Respect `settings.llmProvider` — if set to `'ollama'`, skip Bedrock
- Default model: `us.anthropic.claude-sonnet-4-20250514-v1:0`

## Testing

### Running Tests

```bash
npm test                  # All tests (services + API + integration)
npm run test:lib          # Lib module tests only
npm run test:api          # API tests only
npm run test:components   # Component tests only (jsdom)
npm run test:integration  # Integration tests only (__tests__/integration/)
npm run test:coverage     # With coverage
npm run test:generate     # Auto-generate test stubs for new modules
npm run test:e2e          # Playwright end-to-end tests
```

### Test Structure

- Test files: `__tests__/{services,api,components,hooks,integration}/*.test.js`
- Integration tests: `__tests__/integration/` — mock only external boundaries, real service composition
- Use `jest-babel-transform.js` for ESM/CJS interop (replaces `import.meta.url` → `__filename`)
- Setup file: `__tests__/setup-node.js` — sets `NODE_ENV=test`, `USE_MOCK_DATA=true`, suppresses console, mocks global `fetch`
- Test environment: `node` (configured in jest.config.js, NOT jsdom for service/API tests)
- Component tests are included in the default test match and use `/** @jest-environment jsdom */` pragma for browser DOM simulation
- Module name mapper: `@/` → `src/` (mirrors jsconfig.json)
- Transform ignore: MCP SDK packages are ESM that must be transpiled

### Test Patterns — Minimal Mocking

All tests follow the minimal mocking philosophy. See #[[file:.kiro/steering/testing-best-practices.md]] for the complete guide.

#### Lib Module Tests (`__tests__/lib/*.test.js`)

Mock ONLY external boundaries. Let real DB, cache, config, and internal modules work.

```js
jest.mock('../../src/lib/logger', () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));
jest.mock('../../src/lib/mcp-client', () => ({
  callTool: jest.fn(),
  listTools: jest.fn(),
  getClient: jest.fn(),
  closeAll: jest.fn(),
  isConnected: jest.fn(),
  getConnectionStatus: jest.fn(),
  getMCPConfig: jest.fn(),
}));
jest.mock('../../src/lib/mcp-server', () => ({}));

describe('lib/my-service.js', () => {
  let mod;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mod = require('../../src/lib/my-service');
  });

  it('returns expected output for valid input', async () => {
    const fn = mod.myFunction || mod.default?.myFunction;
    const result = await fn(validInput);
    expect(result).toEqual(expectedOutput);
  });
});
```

#### API Route Tests (`__tests__/api/*.test.js`)

API tests are integration tests. They exercise real route handlers calling real lib modules. Mock ONLY the same external boundaries as lib tests — never mock lib modules.

```js
jest.mock('../../src/lib/logger', () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));
jest.mock('../../src/lib/mcp-client', () => ({
  callTool: jest.fn(),
  listTools: jest.fn(),
  getClient: jest.fn(),
  closeAll: jest.fn(),
  isConnected: jest.fn(),
  getConnectionStatus: jest.fn(),
  getMCPConfig: jest.fn(),
}));
jest.mock('../../src/lib/mcp-server', () => ({}));
jest.mock('../../src/lib/bedrock-client', () => ({
  generate: jest.fn(),
  streamGenerate: jest.fn(),
  isAvailable: jest.fn(() => true),
}));
// Do NOT mock lib modules — let real code run through real SQLite

describe('API: /api/my-route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });
  it('returns 200 with expected data', async () => {
    const { GET } = require('../../src/app/api/my-route/route');
    const response = await GET(new Request('http://localhost/api/my-route'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('ok', true);
  });
});
```

#### Component Tests (`__tests__/components/*.test.js`)

```js
/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

jest.mock('lucide-react', () => {
  const R = require('react');
  return new Proxy(
    {},
    {
      get: (_, name) => {
        if (name === '__esModule') return true;
        return (props) => R.createElement('span', { 'data-testid': 'icon-' + name, ...props });
      },
    }
  );
});

describe('MyComponent', () => {
  it('renders expected content', () => {
    render(<MyComponent items={['Alpha', 'Beta']} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();
    render(<MyComponent onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: /submit/i }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
```

### Key Testing Rules

For the complete testing guide, see #[[file:.kiro/steering/testing-best-practices.md]].

- Mock as little as possible — only external boundaries (MCP, Bedrock, Ollama, HTTP)
- NEVER mock lib modules in API tests — exercise real code
- NEVER mock internal infrastructure (db, drizzle, path-resolver, constants, cache, api-response, sse-stream)
- NEVER write scaffold tests (toBeDefined-only checks) — every test must verify behavior
- All tests MUST use exact status code assertions (`toBe(200)`, not range matchers)
- Always use `jest.resetModules()` in `beforeEach` and re-require the module under test
- Always use `mod.functionName || mod.default?.functionName` pattern for accessing exports
- Mock `fs` only when testing missing-file/error paths
- E2E tests (Playwright) must have ZERO mocking — use VCR cassettes for external services
- For behavioral test exemplars, see `__tests__/hooks/useAbortableFetch.test.js` and `__tests__/lib/issues-store.test.js`

## Linting & Formatting (Mandatory Gate)

A feature is NOT complete until both ESLint and Prettier pass with zero errors and zero warnings.

### Commands

```bash
npm run lint              # ESLint — must exit 0 with no errors or warnings
npm run format:check      # Prettier — must exit 0 (all files formatted)
npm run lint:fix          # Auto-fix ESLint issues
npm run format            # Auto-fix Prettier formatting
```

### Rules

- After implementing any code changes, run `npm run lint` and `npm run format:check` before considering the work done
- ALL ESLint errors and warnings must be resolved — zero tolerance, no `eslint-disable` comments
- ALL files must pass Prettier formatting checks — no unformatted files
- If lint or format checks fail, fix the issues before moving on to the next task
- When fixing lint issues, address the root cause — do not suppress rules or add ignores
- The pre-commit hook (`lint-staged`) enforces this on git commit, but you must also verify during development — do not rely solely on the commit hook
- For spec-driven development: a task is not "complete" until `npm run lint` and `npm run format:check` both pass cleanly

### Workflow

1. Implement the feature or fix
2. Run `npm run lint` — fix any errors/warnings
3. Run `npm run format:check` — run `npm run format` if needed
4. Run `npm test` — ensure tests pass
5. Only then is the work considered done

## Build & Run

```bash
npm run dev               # Development (port 3001, with background agent)
npm run build             # Production build
npm start                 # Start production server (Next.js only, no background agent)
node scripts/launcher.js          # Full app with background agent (dev mode)
node scripts/launcher.js --production  # Full app with background agent (prod mode)
npm run lint              # ESLint
npm run format:check      # Prettier check
```

## Key Patterns

### MCP Tool Integration

Services call external tools via the MCP client:

```js
import { parseMCPResponse } from './mcp-response-parser.js';

const result = await mcpClient.callTool('builder-mcp', 'TaskeiListTasks', {
  roomId: config.roomId,
  folderId: config.folderId,
  status: 'ALL',
  pagination: { maxResults: 100 },
});
const data = parseMCPResponse(result);
```

MCP servers used:

- `builder-mcp`: TaskeiListTasks, TaskeiGetTask, ReadInternalWebsites, TicketingReadActions, OncallReadActions, InternalCodeSearch
- `amzn-mcp`: read_internal_website (Phonetool, Quip)
- `slack-mcp`: post_message, get_messages, search, list_my_channels, get_thread, download_file
- `outlook-mcp`: email_inbox, email_search, email_read, calendar_view, calendar_shared_list

### Direct API Integrations (non-MCP)

- `taskei-client.js`: Direct Taskei GraphQL API via Midway cookie auth (faster than MCP for goal queries)
- `github-metrics.js`: Direct GitHub Enterprise API via PAT auth

### Bedrock Auth Cascade (5 methods, in priority order)

1. IIBS + Midway cookie (zero-config — just run `mwinit`)
2. Bearer token (`AWS_BEARER_TOKEN_BEDROCK` env var)
3. AWS profile (`AWS_PROFILE` env var)
4. AWS access keys from env (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`)
5. Default credential chain

### Background Agent

`scripts/launcher.js` spawns the Next.js app + background agent. The agent runs cron jobs:

- Email sync: every 60 minutes via MCP `email_search` (battery-optimized)
- Insight generation: 9 AM + 1 PM weekdays only
- Slack DM polling: every 60 seconds
- Local store sync: every 60 minutes via `localStore.fullSync()` (fetches from Outlook MCP, writes to SQLite)

### Platform

- macOS only — `.toolbox/bin/` for MCP binaries, `~/.aim/mcp-servers/` as fallback
- `outlook-local.js` handles all Outlook access via the `outlook-mcp` MCP server (no AppleScript/osascript)

## Important Notes

- The app runs locally on the user's laptop — no cloud deployment
- All data is read-only from external sources (Outlook, Taskei, Slack)
- Local caches in brain/ and data/ can be cleared from Settings
- MCP servers (builder-mcp, slack-mcp, outlook-mcp) must be running for Taskei/Slack/Outlook features
- The app should be team-agnostic — any Amazon team should be able to configure it for their goals
- Port 3001 is used (not default 3000)
- `hnswlib-node` is optional — vector search degrades gracefully if the native addon isn't built
