---
inclusion: auto
---

# Testing Best Practices — Minimal Mocking Philosophy

## Core Principle

> Mock as little as possible. Exercise as much real code as possible. Every mock is a lie — it replaces real behavior with an assumption about behavior. The fewer lies in your tests, the more confidence they provide.

A test that passes because everything is mocked tells you nothing. A test that exercises real code through real dependencies and only fakes the true external boundary gives you real confidence.

## The Mocking Decision Tree

Before adding `jest.mock()`, ask yourself:

1. **Is this module pure logic with no side effects?** → Do NOT mock it. Use the real thing.
2. **Does this module work in test mode automatically?** (e.g., `:memory:` SQLite, test paths) → Do NOT mock it.
3. **Is this a true external boundary?** (network call, MCP server, AI provider, third-party API) → Mock it.
4. **Is this a side-effect module that auto-starts on import?** (e.g., `mcp-server.js`) → Mock it with `jest.mock('...', () => ({}))`.
5. **Is this the logger?** → Mock it to suppress output. This is the one internal module that's always OK to mock.

If you're unsure, **don't mock it**. Let the test fail and see what happens. A failing test with real code is more valuable than a passing test with fake code.

## The Testing Pyramid

### 1. Lib module tests (unit)

Mock ONLY: `logger`, `mcp-client`, `bedrock-client`, `ollama-client`, `mcp-server`, external HTTP.
Let everything else use real implementations — real SQLite (`:memory:`), real Drizzle, real config, real cache.

### 2. API route tests (integration)

API route tests should exercise the REAL route handler calling REAL lib modules.
Mock ONLY the same external boundaries as lib tests.
This means API tests are true integration tests — they verify the full request→route→lib→db pipeline.

### 3. Component tests (behavioral)

Mock `fetch`/API calls and icon libraries. Render real components. Test what users see and do.

### 4. Hook tests (behavioral)

Test the hook's contract by simulating React lifecycle. Mock only fetch/API calls.

### 5. E2E tests (Playwright)

**ZERO mocking.** E2E tests hit the real running app with real (or VCR-recorded) external responses.
No `jest.mock()`, no fake data, no intercepted modules. If it needs external services, use VCR cassettes.

## What You Must NEVER Mock

These modules work correctly in test mode. Mocking them produces tests that verify fake behavior:

- `db/index.js` — uses `:memory:` SQLite when `NODE_ENV=test`
- `db/kv.js` — thin wrapper over Drizzle, works with `:memory:` DB
- `db/schema.js` — just table definitions, no side effects
- `drizzle-orm` — the real ORM must be exercised
- `unified-cache.js` — uses real SQLite-backed cache in tests
- `path-resolver.js` — returns correct test paths automatically
- `request-coalescer.js` — pure logic, no external deps
- `constants.js` — just constants, no side effects
- `e2e-limits.js` — returns `false` in test mode
- `api-response.js` — pure functions that format responses
- `sse-stream.js` — if you need to test streaming, test the real stream
- `local-store.js` — uses real SQLite in test mode
- `issues-store.js` — uses real SQLite in test mode
- `org-store.js` — uses real SQLite in test mode

## What You SHOULD Mock (the external boundary list)

- `logger` — suppress log output in tests
- `mcp-client` — external MCP server calls over stdio
- `mcp-server` — side-effect module that auto-starts, mock with `() => ({})`
- `bedrock-client` — AWS Bedrock API calls
- `ollama-client` — local Ollama HTTP calls
- `iibs-auth` — AWS credential chain
- `@aws-sdk/*` — AWS SDK calls
- `hnswlib-node` — optional native addon
- `fs` — ONLY when testing missing-file/error paths. Do NOT mock `fs` by default.
- `child_process` — when testing process spawning
- `axios` / `tough-cookie` — when testing HTTP clients (e.g., taskei-client.js)
- `next/server` — NextResponse in API route tests (this is framework plumbing, not business logic)

## Assertion Quality Rules

### Every `it()` block MUST have at least one meaningful assertion

A "meaningful assertion" verifies observable behavior — a return value, a rendered element, a called function with specific arguments, or a status code.

```js
// BAD — tautological
it('should be defined', () => {
  expect(mod.myFunction).toBeDefined();
});

// GOOD — verifies behavior
it('returns analyzed emails with categories', async () => {
  const result = await analyzeEmails([{ id: '1', snippet: 'urgent' }]);
  expect(result[0].category).toBe('urgent');
});
```

### No scaffold tests

Do NOT write tests that only check `toBeDefined()` or that a module exports something. These are tautological — they pass even when the code is completely broken. Every test must verify actual behavior.

### No conditional expects

Never wrap `expect()` in `if/else`, `try/catch`, or conditional loops. Each branch should be a separate test case.

### Exact status code assertions

```js
// BAD
expect(response.status).toBeLessThanOrEqual(500);

// GOOD
expect(response.status).toBe(200);
```

### Always verify response body in API tests

```js
const response = await GET(new Request('http://localhost/api/my-route'));
expect(response.status).toBe(200);
const body = await response.json();
expect(body.items).toEqual(expect.any(Array));
```

## Component Testing Rules

### Never mock the component under test

Always render the real component. Mock only its dependencies (fetch, icon libraries).

### Stable mock references for hooks

When mocking hooks, return a stable object reference — same object every call. New objects per render cause infinite re-render loops.

```js
// GOOD — stable reference
jest.mock('@/hooks/useAbortableFetch', () => {
  const mockFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  const stable = { fetch: mockFetch, abort: jest.fn() };
  return { useAbortableFetch: jest.fn(() => stable) };
});
```

### Use `screen` for all queries — never destructure from `render()`

### Use `@testing-library/user-event` over `fireEvent`

### Never wrap `render()` in try/catch

A crashing component MUST fail the test.

### Query priority (most to least preferred)

1. `getByRole` 2. `getByLabelText` 3. `getByPlaceholderText` 4. `getByText` 5. `getByTestId` (last resort)

### Use `findBy*` for async elements, not `waitFor` + `getBy*`

### Use `queryBy*` ONLY for asserting non-existence

### No side-effects inside `waitFor`

### Single assertion per `waitFor` callback

## Mock Quality Rules

### Mocks must match the module's interface

```js
// BAD — bare jest.fn()
jest.mock('@/lib/insight-store', () => jest.fn());

// GOOD — matches the real module's API
jest.mock('@/lib/insight-store', () => ({
  __esModule: true,
  default: {
    getUnreadInsights: jest.fn(() => Promise.resolve([])),
    markAsRead: jest.fn(() => Promise.resolve({ success: true })),
  },
}));
```

### One `jest.mock()` per module path per file

### Always `jest.resetModules()` + re-require in `beforeEach`

```js
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mod = require('../../src/lib/my-service');
});
```

### Clean up fake timers

```js
afterEach(() => {
  jest.useRealTimers();
});
```

## Test Structure Rules

### Test the three paths: happy, error, edge

```js
describe('analyzeEmails', () => {
  it('returns categorized emails on success', async () => { ... });
  it('returns fallback values when AI fails', async () => { ... });
  it('handles empty email array', async () => { ... });
});
```

### Describe blocks should mirror the module's public API

### Test names should describe expected behavior, not implementation

```js
// BAD
it('calls bedrock.generate with correct params', ...);

// GOOD
it('returns AI analysis for valid emails', ...);
```

## Lib Test Pattern

```js
// Mock ONLY external boundaries
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
// Everything else uses REAL implementations

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

  it('handles dependency failure gracefully', async () => {
    const mcpClient = require('../../src/lib/mcp-client');
    mcpClient.callTool.mockRejectedValueOnce(new Error('MCP timeout'));
    const fn = mod.myFunction || mod.default?.myFunction;
    const result = await fn(validInput);
    expect(result).toEqual(fallbackValue);
  });
});
```

## API Route Test Pattern

API tests are integration tests. They exercise the real route handler calling real lib modules.
Mock only the same external boundaries as lib tests.

```js
// Mock ONLY external boundaries — same as lib tests
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
// Do NOT mock lib modules like eng-metrics, local-store, issues-store, etc.
// Let the real code run through real SQLite.

describe('API: /api/my-route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('returns 200 with expected data shape', async () => {
    // Set up real data in the real DB if needed
    const { GET } = require('../../src/app/api/my-route/route');
    const response = await GET(new Request('http://localhost/api/my-route'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('ok', true);
  });
});
```

## What NOT to Do

- DO NOT use `describe.each` or `test.each`
- DO NOT introduce `fast-check` or property-based testing libraries
- DO NOT use `enzyme` or shallow rendering
- DO NOT test implementation details (internal state, private methods)
- DO NOT use `container.querySelector` — use `screen` queries
- DO NOT add `eslint-disable` comments to suppress test lint rules
- DO NOT write scaffold tests (toBeDefined-only checks)
- DO NOT mock lib modules in API tests — exercise real code
- DO NOT mock internal infrastructure (db, drizzle, path-resolver, constants, cache)
- DO NOT mock `fs` by default — only mock it for error-path testing
- DO NOT mock `api-response.js` or `sse-stream.js` — these are internal utilities

## ESLint Enforcement

Jest plugin: `jest/expect-expect`, `jest/no-conditional-expect`, `jest/no-identical-title`, `jest/no-disabled-tests`, `jest/no-focused-tests`, `jest/no-standalone-expect`, `jest/no-duplicate-hooks`

Testing Library plugin: `testing-library/prefer-screen-queries`, `testing-library/no-unnecessary-act`, `testing-library/prefer-find-by`, `testing-library/no-debugging-utils`, `testing-library/no-dom-import`
