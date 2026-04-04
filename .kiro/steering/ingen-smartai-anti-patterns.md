---
inclusion: auto
---

# InGen-SmartAI: Known Anti-Patterns & Rules to Follow

This document captures established anti-patterns in the codebase that you MUST avoid when developing new features, and patterns you MUST follow instead.

## API Route Rules

### Response Envelope

The codebase has inconsistent response envelopes. When creating new routes, use this standard:

- Success: `NextResponse.json({ view, data })` for GET with `view` param, or `NextResponse.json({ ok: true, ...result })` for actions
- Error: `NextResponse.json({ error: error.message }, { status: CODE })`
- Do NOT invent new envelope shapes (`success`, `result`, flat objects, etc.)

### Keep Routes Thin

Routes have been decomposed into focused modules (team: ~105 lines, chat: ~90 lines after extracting services). When adding a new `view` case:

- If the route already has 10+ views, consider creating a sub-route instead (e.g., `/api/eng-metrics/heatmap/route.js`)
- Business logic belongs in services, not route handlers
- Do NOT inline .docx generation, date parsing, intent detection, or AI prompt construction in route files

### SSE Streaming

Use `createSSEStream()` from `src/lib/sse-stream.js` for all new streaming endpoints. It handles the ReadableStream setup, encoder, and `data: {JSON}\n\n` formatting. Do NOT duplicate SSE boilerplate inline.

```js
import { createSSEStream } from '@/lib/sse-stream.js';

export async function GET(req) {
  return createSSEStream(async (send) => {
    await send({ type: 'progress', message: 'Loading...' });
    const result = await doWork();
    await send({ type: 'result', data: result });
  });
}
```

### Import Consistency

- ALL code uses ESM (`import`/`export`) — this is the project standard
- Use `@/lib/...` alias paths for all lib module imports in API routes
- Add `.js` extension to local imports: `@/lib/logger.js`
- No `.js` extension for npm packages or Node built-ins
- ALL service imports must be top-level static `import` — no dynamic `require()` inside handlers
- Do NOT use `createRequire` — it bypasses the bundler's static analysis and tree-shaking
- The only exception for dynamic loading is truly optional native modules — use `await import()` for those
- Do NOT mix ES `import` and `require()` for the same service in the same file
- API test mocks use the same paths as lib test mocks (`../../src/lib/` relative paths)

### No Hardcoded User Values

`src/app/api/week-ahead/route.js` has `sankalp` hardcoded in meeting filtering logic. NEVER hardcode user-specific values. Read the user's alias from `config/settings.json` via `phonetool.getAlias()`.

## Service Rules

### AI Provider Cascade

Always use Bedrock → Ollama fallback. Use the shared cascade helper for all new AI-powered features:

```js
import { callAIWithFallback } from '@/lib/ai-cascade.js';

const result = await callAIWithFallback(prompt, { maxTokens: 2000 });
```

`callAIWithFallback()` handles Bedrock availability checks, Ollama fallback, and `settings.llmProvider` respect. Do NOT reimplement the cascade inline — use `ai-cascade.js` directly.

For streaming, use `bedrock-client.js` directly: `bedrockClient.streamGenerate(prompt, onChunk, options)`.

### Logging

Always use the structured logger, never raw `console.log/error`:

```js
import loggerModule from './logger.js';
const logger = loggerModule.child('MyModule');
logger.info('message');
```

Known violators have been fixed. All lib modules now use the structured logger. Do NOT introduce raw `console.log/error` — always use `logger.child('ModuleName')`. Exception: `path-resolver.js` uses `console.error` directly due to circular dependency with `logger.js`.

**Client-side pages** (`'use client'` components) must NOT use the structured logger (it is server-side only). Instead, replace `console.error` with error state display:

```js
const [error, setError] = useState(null);

// In catch blocks:
catch (err) { setError('Failed to load data. Please try again.'); }

// In JSX:
{error && <div className="error-banner" role="alert">{error}</div>}
```

### Settings Reading

~15+ services independently read `config/settings.json` synchronously on every call. This is the established pattern — follow it for consistency, but be aware of the performance cost. Do NOT create a new settings caching layer without refactoring all existing consumers.

Config path: Always use `path.join(process.cwd(), 'config', 'settings.json')`. Do NOT use `path.join(__dirname, '../config/settings.json')` (rate-limiter.js does this — it's inconsistent).

### SQLite Access

Always use the dedicated store modules (`issues-store.js`, `org-store.js`, `eng-metrics.js`, `insight-store.js`). Do NOT open new SQLite connections inline (like `tool-registry.js` does for people_lookup). Use the existing store's query methods.

### Error Handling

- Always wrap MCP calls in try/catch
- Log errors via `logger.error()`, not `console.error()`
- Return safe defaults on failure (empty arrays, null, etc.)
- Do NOT silently swallow errors with empty catch blocks — at minimum log a warning via `logger.warn()`
- For throttle errors from Taskei, detect `'Throttl'` in the message and add backoff delays
- All catch blocks must log at minimum a warning — no exceptions

### Module Exports

- Named export services: `export { fn1, fn2, ... }` — import with `import * as mod from` or `import { fn1 } from`
- Singleton services (stateful): `export default new MyClass()` — used by `insight-store.js`, `vector-store.js`, `ollama-client.js`, `cache-registry.js`
- Side-effect modules (auto-start on import): `mcp-server.js` — avoid creating new ones
- Background jobs: Inngest functions in `src/inngest/functions/` — do not add new `node-cron` or side-effect background modules

### Process Signal Handlers

`mcp-client.js` registers SIGINT/SIGTERM handlers that call `process.exit(0)`. Do NOT add more signal handlers that call `process.exit()` — they can interfere with graceful shutdown in other modules.

### Duplicate Code

These utilities have been consolidated into shared modules. Always import from the shared location — do NOT create local copies:

- `parseDateFromQuery()` — use `import { parseDateFromQuery } from '@/utils/date-utils.js'`
- `TOOL_ALIASES` map — use `import { TOOL_ALIASES } from '@/utils/tool-aliases.js'`
- SSE streaming — use `import { createSSEStream } from '@/lib/sse-stream.js'`
- AI cascade — use `import { callAIWithFallback } from '@/lib/ai-cascade.js'`

## Frontend Rules

### Styling

- Use CSS variables from `globals.css` for colors — NOT hardcoded `rgba()` values
- If you must use inline styles, wrap the page in `<div className="dark-inline-page">` so light mode CSS overrides work
- Do NOT add Tailwind classes — the project does not have Tailwind installed (some legacy classes exist but are non-functional)
- Define animation keyframes in `globals.css`, not in component-level `<style>` tags (they're duplicated across 5+ components currently)

### State Management

- No global state library — all state is local `useState`
- Theme is the only React Context (`ThemeProvider`)
- Persist user preferences to `localStorage` with `ingen-` prefix
- Do NOT introduce Redux, Zustand, or similar without team discussion

### Data Fetching

- All data fetching is client-side via `fetch()` in `useEffect` or `useCallback`
- For streaming endpoints, use the SSE reader pattern (getReader → TextDecoder → parse `data:` lines)
- For progressive loading, use the two-phase pattern: fast data first (`?skipAI=true`), then AI analysis

### Accessibility

The codebase has minimal accessibility. When adding new UI:

- Add `aria-label` to icon-only buttons
- Use semantic HTML (`<button>` not `<div onClick>`)
- Add `role` attributes to interactive non-semantic elements
- Do NOT use `zoom` CSS property (non-standard, breaks Firefox)
- Keyboard focus states required for any element with hover-only visual feedback — add `onFocus`/`onBlur` handlers or use the `:focus-visible` CSS pseudo-class
- `cursor: 'pointer'` on non-button elements requires `role="button"`, `tabIndex={0}`, and `onKeyDown` handler — or convert the element to a `<button>`
- Use `content-visibility: auto` with `contain-intrinsic-size` for scrollable lists with 50+ items to improve rendering performance
- All interactive elements must be reachable via Tab key navigation

### Code Quality

- Zero `eslint-disable` comments allowed in any form — this includes `eslint-disable-next-line`, `eslint-disable-line`, block `/* eslint-disable */`, and file-level disables. NEVER suppress a lint rule. Always fix the underlying code to satisfy the rule. If the code cannot be restructured to pass the rule, the code is wrong and needs a different approach
- No outdated comments referencing CJS patterns (`require()`, `module.exports`) in ESM modules — remove or update them when converting to ESM
- Component files should not exceed 400 lines — extract sub-components into separate files
- No inline style objects when the same pattern repeats 15+ times in a component — extract to CSS classes in `globals.css`
- Pure helper functions that don't depend on component state/props must be hoisted to module level (not defined inside the render body)
- Prefer CSS `:hover` pseudo-classes over `onMouseEnter`/`onMouseLeave` for visual feedback styling

## Security Rules

- API routes must validate input types and ranges before passing to lib modules
- Settings API must redact sensitive values (keys matching `token`, `key`, `secret`, `password`, `apiKey`) in GET responses
- `mcp/use-tool` route must validate `server_name` and `tool_name` against an allowlist of known MCP servers and tools
- API error responses must not expose stack traces or internal file paths in production mode

## Testing Rules

For the complete testing guide, see #[[file:.kiro/steering/testing-best-practices.md]].

### The One Rule

Mock as little as possible. Only mock true external boundaries. Let real code exercise real code.

### Absolute Rules

- NEVER mock lib modules in API tests — API tests are integration tests
- NEVER mock internal infrastructure (db, drizzle, path-resolver, constants, cache, api-response, sse-stream, local-store, issues-store, org-store)
- NEVER write scaffold tests (toBeDefined-only checks) — every test must verify behavior
- DO NOT introduce `fast-check` or any property-based testing library
- DO NOT use `describe.each` or `test.each`
- Always `jest.resetModules()` + re-require in `beforeEach`
- Always use the dual access pattern: `mod.fn || mod.default?.fn`
- For deep behavioral tests (rate-limiter, Header polling), use `afterEach` for timer cleanup and state reset
- E2E tests must have ZERO mocking

### Mock Patterns (EXACT — do not deviate)

These are the ONLY mocks you should need in most test files:

- Logger: `{ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }`
- MCP client: `{ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }`
- MCP server: `jest.mock('...mcp-server', () => ({}))`
- Bedrock client: `{ generate: jest.fn(), streamGenerate: jest.fn(), isAvailable: jest.fn(() => true) }`
- Ollama client: `{ generate: jest.fn(), isAvailable: jest.fn(() => false) }`
- lucide-react (component tests): Use Proxy with `require('react')` inside factory

### Known Test Anti-Patterns (do not replicate)

- **Over-mocking lib modules in API tests**: Never use `jest.mock('@/lib/eng-metrics', ...)` or similar to replace the lib module an API route imports. This produces tests that only verify the route handler's if/else logic with fake data. If the lib module is broken, the test still passes. Exercise real lib code.
- **Self-mocking the component under test**: Never use `jest.mock('../../src/components/X', ...)` to replace the component you are testing. Always render the real component.
- **Scaffold tests**: Tests that only check `toBeDefined()` or `expect(mod).toBeDefined()` are tautological. They pass even when the code is completely broken. Delete them.
- **Mocking path-resolver**: `path-resolver.js` works correctly in test mode. Do not mock it.
- **Mocking constants**: `constants.js` is just constants. Do not mock it.
- **Mocking api-response or sse-stream**: These are internal utilities. Do not mock them.
- **Tautological error handling tests**: `expect(response).toBeDefined()` always passes. Error tests must assert exact status codes and response body shapes.
- **Unstable hook mock references**: When mocking hooks, return a stable object reference (same object every call). New objects per render cause infinite re-render loops.
- **Component render try/catch**: Do NOT wrap `render()` in try/catch — a crashing component must fail the test.

### Test Quality Checklist

- [ ] At least one `expect()` assertion per `it()` block — no assertion-free tests
- [ ] No conditional expects — use separate test cases
- [ ] Error paths tested — mock external deps to throw/reject and verify graceful handling
- [ ] No `render()` wrapped in try/catch
- [ ] Exact status code assertions (`toBe(200)`)
- [ ] Response body verified in API tests
- [ ] `jest.resetModules()` + re-require in `beforeEach`
- [ ] Fake timers cleaned up in `afterEach`
- [ ] No mocking of internal infrastructure
- [ ] API tests exercise real lib modules
