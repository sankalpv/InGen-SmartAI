---
inclusion: auto
---

# InGen-SmartAI: Architecture Patterns & Design Decisions

Reference guide for the established architecture patterns. Follow these when building new features.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  React Pages (src/app/*/page.js) — all 'use client'    │
│  ↕ fetch() to API routes                                │
├─────────────────────────────────────────────────────────┤
│  API Routes (src/app/api/*/route.js) — thin orchestrat. │
│  ↕ import lib modules                                   │
├─────────────────────────────────────────────────────────┤
│  Lib (src/lib/*.js) — business logic (61 modules)       │
│  ↕ MCP client, SQLite, Bedrock, file I/O, GraphQL      │
├─────────────────────────────────────────────────────────┤
│  Utils (src/utils/*.js) — shared client/server helpers  │
│  date-utils, tool-aliases, sse-reader, config-utils,    │
│  storage-cache, status-colors, session-cache, etc.      │
├─────────────────────────────────────────────────────────┤
│  External: Outlook (MCP)         │ Taskei (MCP+GraphQL) │
│            Slack (MCP)           │ Bedrock (AWS SDK)     │
│            Phonetool (MCP)       │ Ollama (HTTP)         │
│            GitHub (REST API)     │ CloudWatch (AWS SDK)  │
└─────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### Pages (src/app/\*/page.js)

- Client-side rendering only (all `'use client'`)
- Fetch data from API routes via `fetch()`
- Manage local UI state (`useState`, `useEffect`)
- Consume SSE streams for progressive loading
- Never import lib modules directly

### API Routes (src/app/api/\*/route.js)

- Thin HTTP layer — parse request, call lib modules, format response
- Handle SSE streaming setup (ReadableStream + TextEncoder)
- Set route config exports (`runtime`, `dynamic`, `maxDuration`)
- Return `NextResponse.json()` for JSON, `new Response(stream)` for SSE
- Delegate ALL business logic to lib modules

### Lib Modules (src/lib/\*.js)

- Own all business logic, data access, and external integrations
- 61 modules total — all ESM (`import`/`export`)
- Each module owns one domain (AI, email, calendar, goals, tickets, etc.)
- Use structured logger (`import loggerModule from './logger.js'; const logger = loggerModule.child('ModuleName');`)
- Read config from `config/settings.json` on each call
- Handle errors gracefully with safe defaults

### Utils (src/utils/\*.js)

- Shared client/server utility modules importable from both pages and lib
- `date-utils.js` — date parsing, formatting, and comparison helpers (`parseDateFromQuery`, `isEcdPast`)
- `tool-aliases.js` — canonical `TOOL_ALIASES` map for agent tool name resolution
- `sse-reader.js` — client-side SSE stream reader for progressive data consumption
- `storage-cache.js` — localStorage-backed cache with TTL support
- `config-utils.js` — config directory helpers (`ensureConfigDir`)
- `status-colors.js` — shared status color mappings for components
- `session-cache.js` — session-scoped caching utilities
- `insight-utils.js` — shared insight formatting helpers
- `sound-effects.js`, `tts-voice.js` — audio/voice utilities
- `sync-gating.js` — sync gating logic for background operations
- `markdown-renderer.js` — markdown rendering helpers

## Service Catalog (61 modules)

### Core Infrastructure

`logger.js`, `local-store.js`, `prompt-loader.js`, `rate-limiter.js`, `api-metrics.js`, `startup-checks.js`, `constants.js`, `path-resolver.js`, `unified-cache.js`, `request-coalescer.js`

### AI Providers

`bedrock-client.js`, `ollama-client.js` (singleton), `ai.js` (ESM), `ai-stream.js` (ESM), `iibs-auth.js`

### MCP Integration

`mcp-client.js`, `mcp-server.js` (side-effect), `tool-registry.js`

### Shared Utilities

`ai-cascade.js` — `callAIWithFallback()` for Bedrock → Ollama cascade with structured error handling
`mcp-response-parser.js` — `parseMCPResponse()` for safe extraction of MCP tool call results
`sse-stream.js` — `createSSEStream()` for standardized SSE response construction in API routes
`api-response.js` — `okResponse()`, `viewResponse()`, `errorResponse()` for consistent API response envelopes
`briefing-service.js` — morning briefing data aggregation (extracted from route)
`week-ahead-service.js` — week-ahead planning logic (extracted from route)
`analysis-service.js` — AI analysis orchestration (extracted from route)
`org-pulse-service.js` — org pulse data collection (extracted from route)
`team-service.js` — team data aggregation (extracted from route)
`chat-engine.js` — conversational AI engine with tool integration (extended)

### Data Stores — SQLite (Consolidated)

Single database `data/{env}/smartai.db` via Drizzle ORM (`db/connection.js` + `db/schema.js`). Domain modules: `org-store.js`, `issues-store.js`, `eng-metrics.js`, `insight-store.js`, `local-store.js`, `prompt-store.js`, `unified-cache.js`

### Data Stores — Vector/File

`vector-store.js` (singleton), `agent-memory.js`

### Email & Calendar

`outlook-local.js` (ESM, primary), `email-search.js`, `scheduling.js` (ESM), `issues-parser.js`

### Agent System

`agent-executor.js` (ESM), `sub-agents.js`, `slack-agent.js`, Inngest functions (`src/inngest/functions/`)

### External Integrations

`phonetool.js`, `slack.js`, `quip-fetcher.js`, `taskei-client.js` (direct GraphQL), `ticketing.js`, `oncall.js`, `github-metrics.js` (direct REST)

### AI-Powered Analysis

`ai-insights.js`, `proactive-agent.js`, `leadership-analytics.js`, `person-insights.js`, `chat-engine.js`

### Reporting

`wbr-report.js`, `team-wbr-report.js`, `goal-narrative-tools.js`

### Specialized

`sde3-focus.js`, `ticket-health.js`, `mock-data.js` (ESM)

## Key Design Patterns

### 1. ESM Standard

All services and API routes use ES Modules. All imports are top-level static `import` statements:

```js
import loggerModule from '@/lib/logger.js';
const logger = loggerModule.child('MyModule');
import { getDataDir } from '@/lib/path-resolver.js';
import * as engMetrics from '@/lib/eng-metrics.js';
```

No `createRequire`, no dynamic `require()`. The only exception is `await import()` for truly optional native modules.

### 2. View-Based Sub-Routing

Multi-view endpoints use a `view` query parameter with switch statement:

```js
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'default';
    switch (view) {
        case 'dashboard': { ... }
        case 'detail': { ... }
        default: return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
    }
}
```

### 3. SSE Streaming (10+ endpoints)

Progressive data delivery for long-running operations. Use `createSSEStream()` from `sse-stream.js`:

```js
import { createSSEStream } from '@/lib/sse-stream.js';

export async function GET(request) {
  return createSSEStream(async (send) => {
    send({ type: 'phase', message: 'Starting...' });
    await doWork(send);
    send({ type: 'done' });
  });
}
```

### 4. Stale-While-Revalidate

`local-store.js` serves cached data instantly from SQLite, refreshes in background:

- Dedicated SQLite tables (`emails`, `calendar_events`, `slack_messages`) with `sync_meta` for staleness tracking
- 60-minute staleness threshold (`MAX_STALE_MS`)
- Sync coalescing via `request-coalescer.js`
- Background agent refreshes on cron schedule

### 5. AI Provider Cascade

Bedrock (cloud) → Ollama (local) → hardcoded fallback. Use `callAIWithFallback()` from `ai-cascade.js`:

```js
import { callAIWithFallback } from '@/lib/ai-cascade.js';

const result = await callAIWithFallback(prompt, {
  systemPrompt: 'You are a helpful assistant.',
  maxTokens: 1024,
});
```

The cascade handles provider selection, error fallback, and structured logging automatically.

### 6. MCP Tool Integration

External tools accessed via Model Context Protocol. Use `parseMCPResponse()` from `mcp-response-parser.js` for safe result extraction:

```js
import { parseMCPResponse } from '@/lib/mcp-response-parser.js';

const result = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
  taskId: goalId,
  includeCustomAttributes: true,
  commentLimit: 1,
});
const data = parseMCPResponse(result);
```

### 7. Direct GraphQL Integration (Taskei)

`taskei-client.js` bypasses MCP for faster goal queries using Midway cookie auth:

```js
import * as taskeiClient from './taskei-client.js';
if (taskeiClient.isAuthenticated()) {
  const goals = await taskeiClient.listGoalTasks(roomId);
}
```

Uses axios + tough-cookie for Midway redirect handling, with throttle detection and exponential backoff.

### 8. SQLite + Drizzle ORM Pattern

Single consolidated database (`data/{env}/smartai.db`) accessed exclusively through Drizzle ORM. See `drizzle-sqlite-best-practices.md` for the full rules.

```js
import { db } from './db/connection.js';
import { issues } from './db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

// Query builder for standard CRUD
const open = db.select().from(issues)
  .where(notInArray(issues.status, ['Resolved', 'Closed']))
  .orderBy(desc(issues.updatedAt))
  .all();

// sql template for SQLite-specific functions
const aged = db.select({
  ...getTableColumns(issues),
  ageDays: sql<number>`CAST(julianday('now') - julianday(${issues.createdAt}) AS INTEGER)`,
}).from(issues).all();

// Transactions for bulk writes
db.transaction((tx) => {
  tx.delete(emails).run();
  for (const e of list) tx.insert(emails).values({...}).run();
});
```

### 9. Tool Registry (Agent System)

Central registry for agent tools with name, description, icon, parameters, and execute function:

```js
register({
  name: 'my_tool',
  description: 'What this tool does',
  icon: '🔧',
  parameters: { query: { type: 'string', description: '...' } },
  async execute({ query }) {
    return { data: results, summary: `Found ${results.length} items.`, count: results.length };
  },
});
```

### 10. Hot-Reloadable Config

- `config/settings.json`: read via `fs.readFileSync()` on each call — no restart needed
- `config/prompts.json`: read via `prompt-loader.js` with 30s TTL cache
- Template variables use `{{VARIABLE}}` syntax in prompts

### 11. macOS-Only Platform

The app runs exclusively on macOS. Outlook integration uses the Outlook MCP server (`outlook-mcp`) via `mcp-client.js`.

### 12. API Response Envelope

All API routes use standardized response helpers from `api-response.js`:

```js
import { okResponse, viewResponse, errorResponse } from '@/lib/api-response.js';

// Action endpoints (POST, mutations)
return okResponse({ items, count: items.length });
// → { ok: true, items: [...], count: N }

// View-based GET endpoints
return viewResponse(view, data);
// → { ok: true, view: 'dashboard', ...data }

// Error responses
return errorResponse('Invalid input', 400);
// → { error: 'Invalid input' } with status 400
```

Never construct response envelopes inline — always use these helpers for consistency.

## Data Flow Patterns

### Email Pipeline

```
Outlook (MCP) → mcp-client → local-store.js (SQLite) → Vector Store (hnswlib)
                                                      → AI Analysis (Bedrock/Ollama)
                                                      → Dashboard (React)
```

### WBR Goals Pipeline

```
Taskei (GraphQL or MCP) → taskei-client.js / wbr-report.js
                        → unified-cache (SQLite kv_cache, 6-day TTL)
                        → React dashboard (SSE streaming)
```

### Engineering Metrics Pipeline

```
Org roster (Phonetool → org-store.js)
→ Per-engineer code search (builder-mcp → ReadInternalWebsites)
→ CR enrichment (titles + comments from code.amazon.com)
→ SQLite weekly snapshots (data/{env}/smartai.db)
→ React dashboard
```

### Agent Execution Pipeline

```
User task → LLM planning (tool selection) → Parallel tool execution
          → Evidence collection → LLM synthesis (streaming) → Response
```

## Performance Patterns

### Battery & CPU Optimization

- 60-minute sync interval (was 15 — 4× fewer MCP calls)
- Weekday-only AI insights (9 AM + 1 PM only)
- Deferred startup work (no insight gen or Slack sync on boot)
- Staggered cron offsets (email at :00, Slack at :15)
- Ollama `keep_alive: '2m'` (model unloads after 2min idle)
- 5-minute sync timeout (kills hung MCP calls)

### Memory & I/O Optimization

- In-memory caching with TTL (calendar 5min, tickets 5min, phonetool 24h)
- Double-checked locking on calendar cache (mutex with pre/post-lock verification)
- MCP connection caching (outlook-mcp reuses existing connection)
- Lazy-loaded vector store (dynamic `import()` only when RAG is needed)
- Incremental email sync (delta-only via MCP `email_search` with date filter)
- Batch concurrency control for MCP calls (configurable `maxConcurrent`)

## Adding a New Feature Checklist

1. **Lib Module**: Create `src/lib/my-feature.js` (ESM, with logger, config reading, error handling)
2. **API Route**: Create `src/app/api/my-feature/route.js` (ESM, thin, imports lib module with `@/` alias)
3. **Page**: Create `src/app/my-feature/page.js` (`'use client'`, fetches from API route)
4. **Sidebar**: Add navigation link in `src/components/Sidebar.js`
5. **Settings**: Add any config keys to `config/settings.json` with defaults
6. **Tests**: Write behavioral tests following the minimal mocking philosophy (see testing-best-practices.md)
7. **Lint & Format**: `npm run lint` and `npm run format:check` must both pass with zero errors/warnings
8. **Verify**: `npm test` passes — feature is not complete until steps 7 and 8 are green
