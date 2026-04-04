---
inclusion: manual
---

# Best Practices Audit & Refactor Planner

## Purpose

Perform a comprehensive, multi-pass audit of the entire codebase against all established best practices from the steering files, React/Next.js best practices, and composition patterns. Identify every violation, present findings interactively, answer questions, and produce a prioritized spec plan to refactor the codebase into clean, delightful code.

## When to Use

- When you want a full health check of the codebase against best practices
- Before a major refactor cycle to know exactly what needs fixing
- When onboarding and wanting to understand the gap between current code and ideal code
- When the codebase feels messy and you want a systematic cleanup plan

## Architecture Context

Read ALL steering files before auditing — these define "best practices" for this project:

- `#[[file:.kiro/steering/ingen-smartai-architecture.md]]` — architecture patterns, layer responsibilities, design patterns
- `#[[file:.kiro/steering/ingen-smartai-development.md]]` — code conventions, tech stack, testing rules
- `#[[file:.kiro/steering/ingen-smartai-anti-patterns.md]]` — anti-patterns to avoid, known issues, testing patterns
- `#[[file:.kiro/steering/react-best-practices.md]]` — 40+ React/Next.js rules by impact level
- `#[[file:.kiro/steering/composition-patterns.md]]` — component composition patterns

Also reference the full rules documents:

- `#[[file:docs/react-best-practices-rules.md]]` — detailed React rules with code examples
- `#[[file:docs/composition-patterns-rules.md]]` — detailed composition rules with code examples

---

## Workflow

This skill runs as a multi-phase audit. Each phase acts as a "sub-agent" focused on one domain. After all phases complete, findings are consolidated, presented to the user, and a refactor spec plan is generated.

**IMPORTANT**: After presenting findings from each phase, PAUSE and ask the user:

1. Any questions about the findings so far?
2. Any areas they want to drill deeper into?
3. Any findings they disagree with or want to skip?

---

### Phase 1: Architecture & Layer Violations

Audit every file against the architecture layer rules from `ingen-smartai-architecture.md`.

#### 1A. Page Layer Violations (`src/app/*/page.js`)

For each page file:

1. Check for direct lib module imports (pages must ONLY use `fetch()` to API routes)
2. Check for server-side code in `'use client'` components (fs, path, sqlite3, etc.)
3. Check for business logic that should be in a lib module or API route
4. Check file size — pages over 400 lines should have sub-components extracted
5. Check for proper `'use client'` directive at top

**Report format per violation:**

```
[ARCH-PAGE] src/app/my-team/page.js (62,875 bytes — MASSIVE)
  - File is 62KB — far exceeds 400-line component limit
  - Should extract sub-components into src/components/my-team/
```

#### 1B. API Route Layer Violations (`src/app/api/*/route.js`)

For each API route:

1. Check for inlined business logic (routes must be thin orchestrators — no .docx generation, date parsing, intent detection, or AI prompt construction inline)
2. Check for missing `api-response.js` helpers (should use `okResponse`, `viewResponse`, `errorResponse` — never construct response envelopes inline)
3. Check for inline SSE boilerplate (should use `createSSEStream()`)
4. Check for missing route config exports (`runtime`, `dynamic`, `maxDuration`) — specifically `maxDuration` on known long-running routes (agent: 300s, wbr: 300s, morning-briefing: 120s)
5. Check for relative imports instead of `@/lib/` alias
6. Check for dynamic `require()` instead of static `import`
7. Count lines — routes over 100 lines likely have inlined logic
8. Check view-based routes for missing `default:` case that returns 400 error for unknown views
9. Check routes with 10+ view cases — should consider creating sub-routes (e.g., `/api/eng-metrics/heatmap/route.js`)
10. Check for `.js` extension incorrectly added to npm package or Node built-in imports (should only be on local imports)

#### 1C. Lib Module Layer Violations (`src/lib/*.js`)

For each lib module:

1. Check for raw `console.log/error` instead of structured logger (exception: `path-resolver.js`)
2. Check for missing logger child creation pattern
3. Check for hardcoded config values instead of reading from `settings.json`
4. Check for `__dirname` usage for config paths (should use `process.cwd()`)
5. Check for inline AI cascade instead of using `callAIWithFallback()`
6. Check for inline MCP response parsing instead of using `parseMCPResponse()`
7. Check for `createRequire` or dynamic `require()`
8. Check for empty catch blocks (must at minimum log a warning)
9. Check for missing `.js` extensions on local imports
10. Check for inline SQLite connections instead of using dedicated store modules (`issues-store.js`, `org-store.js`, `eng-metrics.js`, `insight-store.js`) — e.g., `tool-registry.js` opens its own connection for `people_lookup`
11. Check for missing Taskei throttle detection (`'Throttl'` in error message) and backoff delays on Taskei-calling code
12. Check SQLite store modules for missing PRAGMA settings (`journal_mode=WAL; foreign_keys=ON;`)
13. Check for `.js` extension incorrectly added to npm package or Node built-in imports

#### 1D. Utils Layer Violations (`src/utils/*.js`)

1. Check that utils are truly shared (used by both client and server code)
2. Check for server-only code in utils (would break client imports)
3. Check for duplicated utility logic that should be consolidated here

**→ PAUSE: Present Phase 1 findings. Ask user for questions before continuing.**

---

### Phase 2: React & Component Best Practices

Audit all components against the React best practices rules.

#### 2A. Critical: Waterfall Detection (Rules 1.1–1.5)

For each page and component that fetches data:

1. Check for sequential `await` calls that could be parallelized with `Promise.all()`
2. Check for waterfall chains in `useEffect` (fetch A, then fetch B, then fetch C)
3. Check for missing `Promise.all()` on independent operations
4. Check API routes for waterfall chains — independent promises should be started immediately (Rule 1.3)

#### 2B. Bundle Size Optimization (Rules 2.1–2.5)

For each page and component:

1. **2.1** Check for barrel file imports (importing from index files instead of specific paths)
2. **2.2** Check for large modules loaded unconditionally that should use conditional `await import()`
3. **2.3** Check for non-critical third-party libraries (analytics, logging) loaded eagerly instead of deferred after hydration
4. **2.4** Check for heavy components that should use `next/dynamic` with `{ ssr: false }`
5. **2.5** Check for navigation links/buttons that could preload on hover/focus before click

#### 2C. Re-render Optimization (Rules 5.1–5.15)

For each component:

1. **5.1** Check for derived state stored in `useState` that should be calculated during render
2. **5.2** Check for state reads (searchParams, context values) subscribed eagerly instead of deferred to the callback that uses them
3. **5.3** Check for simple expressions wrapped in `useMemo` that don't need memoization
4. **5.4** Check for components defined inside other components (causes remount every render)
5. **5.5** Check for non-primitive default parameter values that should be extracted as constants
6. **5.6** Check for components that could extract expensive subtrees into memoized sub-components to enable early returns
7. **5.7** Check for broad effect dependencies (passing entire objects instead of specific fields)
8. **5.8** Check for state+effect patterns that should be event handlers
9. **5.9** Check for combined useMemo/useEffect with independent deps that should be split
10. **5.10** Check for subscribing to raw values (window width) instead of derived state (media query boolean)
11. **5.11** Check for non-functional `setState` updates that could cause stale closures
12. **5.12** Check for expensive initial state that should use lazy initialization `useState(() => ...)`
13. **5.13** Check for non-urgent updates that should use `startTransition`
14. **5.14** Check for expensive derived renders that should use `useDeferredValue` to keep input responsive
15. **5.15** Check for values in `useState` that should be `useRef` (mouse position, intervals, flags)

#### 2D. Component Size & Structure

For each component file:

1. Check line count — flag anything over 400 lines
2. Check for inline style objects repeated 15+ times (should extract to CSS classes)
3. Check for helper functions defined inside the render body that don't depend on state/props (should be hoisted to module level)
4. Check for animation keyframes in component `<style>` tags (should be in `globals.css`)
5. Check for hardcoded `rgba()` values instead of CSS variables

#### 2E. Accessibility Violations

For each component:

1. Check for `<div onClick>` instead of `<button>` (semantic HTML)
2. Check for icon-only buttons missing `aria-label`
3. Check for `cursor: 'pointer'` on non-button elements without `role="button"`, `tabIndex={0}`, `onKeyDown`
4. Check for hover-only visual feedback without keyboard focus states (`:focus-visible` or `onFocus`/`onBlur`)
5. Check for `zoom` CSS property usage (non-standard, breaks Firefox)
6. Check for scrollable lists with 50+ items missing `content-visibility: auto` with `contain-intrinsic-size`
7. Check that all interactive elements are reachable via Tab key navigation

#### 2F. State Management Patterns

1. Check for prop drilling that could use composition or context (composition-patterns 2.3)
2. Check for boolean prop proliferation (composition-patterns 1.1) — components with 3+ boolean props that customize behavior should use explicit variant components instead (3.1)
3. Check for complex components that could benefit from compound component pattern (composition-patterns 1.2) — `Component.Sub` with shared context
4. Check for missing error state handling in data-fetching components
5. Check for `localStorage` usage without `ingen-` prefix
6. Check for `forwardRef` usage — unnecessary in React 19, `ref` is now a regular prop (composition-patterns 4.1)
7. Check for `useContext()` that could use React 19's `use()` API (composition-patterns 4.1)
8. Check for `renderX` props that should use `children` composition instead (composition-patterns 3.2)
9. Check for tightly coupled state+UI that should decouple state management from UI via providers (composition-patterns 2.1, 2.2)

#### 2G. Rendering Performance (Rules 6.1–6.11)

For each component:

1. **6.2** Check for long lists (50+ items) missing `content-visibility: auto` (also in 2D.6)
2. **6.3** Check for static JSX elements defined inside components that should be hoisted to module level
3. **6.9** Check for `&&` conditional rendering where condition could be `0` or `NaN` — should use ternary
4. **6.11** Check for manual loading state (`isLoading` useState) that should use `useTransition`'s `isPending`

#### 2H. Client-Side Data Fetching (Rules 4.1–4.4)

1. **4.1** Check for duplicate global event listeners (window resize, scroll) across component instances
2. **4.2** Check for touch/wheel event listeners missing `{ passive: true }`
3. **4.4** Check for localStorage data without version prefix, or missing try-catch around localStorage access

#### 2I. JavaScript Performance (Rules 7.1–7.14)

For each file with significant logic:

1. **7.1** Check for layout thrashing — interleaved DOM reads and writes that should be batched
2. **7.2** Check for repeated `.find()` calls that should use a `Map` index
3. **7.3** Check for deep property access inside loops that should be cached before the loop
4. **7.4** Check for repeated function calls with same args that should use a module-level cache Map
5. **7.5** Check for repeated `localStorage.getItem()`/`cookies` calls that should use in-memory cache
6. **7.6** Check for chained `.filter().map()` that could be a single loop or `flatMap` in one pass
7. **7.7** Check for non-critical work (analytics, saves, prefetching) that should use `requestIdleCallback`
8. **7.8** Check for array comparisons missing early length check
9. **7.9** Check for functions that could early-return but don't
10. **7.10** Check for RegExp creation inside render/loops (should be hoisted to module level)
11. **7.12** Check for `array.sort()` to find min/max — should use a single O(n) loop instead
12. **7.13** Check for `array.includes()` in loops that should use `Set`
13. **7.14** Check for `array.sort()` that mutates state — should use `toSorted()` in React

**→ PAUSE: Present Phase 2 findings. Ask user for questions before continuing.**

---

### Phase 3: Anti-Pattern Violations

Audit against every rule in `ingen-smartai-anti-patterns.md`.

#### 3A. Known Anti-Patterns Check

1. Check for hardcoded user values (the `sankalp` pattern — search all files)
2. Check for `eslint-disable` comments (zero allowed)
3. Check for Tailwind classes (project doesn't use Tailwind)
4. Check for `onMouseEnter`/`onMouseLeave` for styling that should be CSS `:hover`
5. Check for new `node-cron` or side-effect background modules
6. Check for additional `process.exit()` signal handlers beyond `mcp-client.js`
7. Check for Redux/Zustand/global state library imports
8. Check for outdated comments referencing CJS patterns (`require()`, `module.exports`) in ESM modules
9. Check for client-side components (`'use client'`) using `console.error` instead of error state display (`useState` + error banner with `role="alert"`)
10. Check for pages with inline styles missing `<div className="dark-inline-page">` wrapper for light mode CSS overrides
11. Check for components not using the two-phase progressive loading pattern where applicable (`?skipAI=true` for fast data first, then AI analysis)

#### 3B. Error Handling Audit

For each lib module and API route:

1. Check for empty catch blocks (must at minimum log via `logger.warn()`)
2. Check for `console.error` instead of `logger.error()` in lib modules
3. Check for missing try/catch around MCP calls
4. Check for error responses exposing stack traces or internal paths in production
5. Check for missing input validation in API routes (types and ranges)
6. Check for silently swallowed errors — every catch must log at minimum a warning

#### 3C. Import Consistency

Across all files:

1. Check for mixed `import`/`require()` in the same file
2. Check for missing `.js` extensions on local imports
3. Check for relative paths in API routes instead of `@/lib/` alias
4. Check for barrel file imports (should import from specific paths)

#### 3D. Security Audit

1. Check settings API for proper redaction of sensitive values
2. Check `mcp/use-tool` route for server/tool name allowlist validation
3. Check for exposed stack traces in production error responses
4. Check for unvalidated input in API route handlers

**→ PAUSE: Present Phase 3 findings. Ask user for questions before continuing.**

---

### Phase 4: Code Quality & Maintainability

#### 4A. File Size Analysis

Generate a report of all files sorted by size, flagging:

- Pages over 400 lines (CRITICAL — must extract components)
- Components over 400 lines (HIGH — should extract sub-components)
- Lib modules over 500 lines (MEDIUM — consider splitting)
- API routes over 100 lines (MEDIUM — likely has inlined logic)
- CSS file size (globals.css at 92KB — check for dead/duplicate rules, duplicated animation keyframes)

#### 4B. Duplication Detection

1. Check for duplicated utility functions across files (especially `parseDateFromQuery`, `TOOL_ALIASES`, SSE boilerplate, AI cascade logic — these should use shared modules)
2. Check for duplicated style patterns across components
3. Check for duplicated error handling patterns that should be centralized
4. Check for duplicated fetch/SSE patterns that should use shared hooks
5. Check for animation keyframes duplicated across component `<style>` tags (steering says 5+ components have this — should be in `globals.css`)

#### 4C. Naming Consistency

1. Check for inconsistent file naming (kebab-case vs camelCase vs PascalCase)
2. Check for inconsistent export naming patterns
3. Check for inconsistent API route naming

#### 4D. TODO/FIXME/HACK Audit

1. Search for all `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, `TEMPORARY` comments
2. Classify each as stale, valid, or ancient
3. Flag any that reference completed work

#### 4E. Commented-Out Code

Search for blocks of commented-out code (3+ consecutive lines) that should be removed.

#### 4F. Advanced Patterns (Rules 8.1–8.3)

1. **8.1** Check for initialization code that runs per-mount instead of once at module level (e.g., event listener setup, SDK init)
2. **8.2** Check for event handler subscriptions that re-subscribe on every render — should store handlers in refs
3. **3.4** Check lib modules for static I/O (fonts, configs, constants) that could be hoisted to module level instead of read on every call (note: `settings.json` is intentionally read per-call for hot-reload, but truly static data should be hoisted)

**→ PAUSE: Present Phase 4 findings. Ask user for questions before continuing.**

---

### Phase 5: Testing Best Practices

#### 5A. Test Coverage Gaps

1. Check which lib modules lack test files in `__tests__/lib/`
2. Check which API routes lack test files in `__tests__/api/`
3. Check which components lack test files in `__tests__/components/`
4. Check which hooks lack test files in `__tests__/hooks/`
5. Check for test files with only scaffold tests (no behavioral `describe('behavior', ...)` blocks)
6. Identify high-priority services that should have behavioral tests (from steering: `ai.js`, `bedrock-client.js`, `ai-insights.js`, `ai-stream.js`, `mcp-client.js`, `outlook-local.js`, `taskei-client.js`, `quip-fetcher.js`, `insight-store.js`, `local-store.js`, `vector-store.js`, `org-store.js`, `prompt-loader.js`, `rate-limiter.js`, `startup-checks.js`, `scheduling.js`, `eng-metrics.js`, `ticket-health.js`, `wbr-report.js`)

#### 5B. Test Anti-Patterns

1. Check for `render()` wrapped in try/catch that asserts `expect(e).toBeDefined()` on failure (crashing component still passes)
2. Check for assertion-free `it()` blocks (every `it()` must have at least one `expect()`)
3. Check for conditional expects (`if/else` around `expect()`) — should be separate test cases
4. Check for range status code assertions (`toBeLessThanOrEqual(500)`, `toBeGreaterThanOrEqual(200)`) instead of exact (`toBe(200)`)
5. Check for duplicate `jest.mock()` declarations for the same module path in the same file
6. Check for bare `jest.fn()` module mocks without method stubs matching the module's interface
7. Check for missing `jest.resetModules()` in `beforeEach` (service and API tests)
8. Check for `fast-check`, `describe.each`, or `test.each` usage (all prohibited)
9. Check for missing `afterEach(() => jest.useRealTimers())` in tests that use fake timers
10. Check for missing `jest.clearAllMocks()` in `beforeEach`
11. Check for service tests of config-reading modules that don't mock `fs` at the top level

#### 5C. Mock Pattern Compliance

1. Verify logger mocks match the exact pattern: `{ child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) }`
2. Verify MCP client mocks match the exact pattern: `{ callTool: jest.fn(), listTools: jest.fn(), getClient: jest.fn(), closeAll: jest.fn(), isConnected: jest.fn(), getConnectionStatus: jest.fn(), getMCPConfig: jest.fn() }`
3. Verify NextResponse mocks match the exact pattern: `{ json: jest.fn((data, opts) => ({ status: opts?.status || 200, json: async () => data, headers: new Map() })) }`
4. Check for API tests using relative paths instead of `@/lib/` alias for mocks
5. Check for service tests using `@/lib/` alias instead of `../../src/lib/` relative paths
6. Check for component tests not using the Proxy pattern for `lucide-react` mocks
7. Verify API route tests require routes via `../../src/app/api/` relative paths
8. Verify SQLite3 mocks match the exact pattern: `{ verbose: jest.fn(() => ({ Database: jest.fn((path, cb) => { ... }) })) }`
9. Check API tests for missing response body verification via `await response.json()` assertions

**→ PAUSE: Present Phase 5 findings. Ask user for questions before continuing.**

---

## Consolidated Report

After all phases, produce a consolidated report:

### Summary Dashboard

```
╔══════════════════════════════════════════════════════════╗
║  BEST PRACTICES AUDIT SUMMARY                           ║
╠══════════════════════════════════════════════════════════╣
║  🔴 Critical Violations:    XX                          ║
║  🟠 High Priority:          XX                          ║
║  🟡 Medium Priority:        XX                          ║
║  🟢 Low Priority:           XX                          ║
║  ────────────────────────────────────────────────────── ║
║  Total Findings:             XX                          ║
║  Files Audited:              XX                          ║
║  Clean Files:                XX                          ║
╚══════════════════════════════════════════════════════════╝
```

### Findings by Category

Group all findings by:

1. **Architecture violations** — wrong layer, wrong pattern
2. **React anti-patterns** — waterfalls, re-render issues, accessibility
3. **Code quality** — oversized files, duplication, naming
4. **Security** — input validation, error exposure
5. **Testing** — coverage gaps, anti-patterns

### Severity Definitions

- 🔴 **Critical**: Actively causes bugs, security issues, or severe performance problems. Fix immediately.
- 🟠 **High**: Violates core architecture patterns, makes code hard to maintain. Fix in next sprint.
- 🟡 **Medium**: Deviates from best practices but works. Fix when touching the file.
- 🟢 **Low**: Style/consistency issues. Nice to fix but not urgent.

---

## Refactor Spec Plan Generation

After presenting findings and answering questions, generate a refactor spec plan:

### Plan Structure

For each group of related findings, create a refactor task:

```markdown
## Task [N]: [Title]

**Priority**: 🔴/🟠/🟡/🟢
**Effort**: S/M/L/XL
**Files affected**: [list]
**Findings addressed**: [finding IDs]

### What to change

[Specific description of the refactor]

### How to verify

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] [specific behavioral verification]

### Dependencies

- Depends on Task [X] (if any)
- Can be done in parallel with Task [Y]
```

### Task Ordering

1. Group related findings into single tasks (e.g., "Extract sub-components from my-team/page.js" covers multiple findings)
2. Order by: Critical → High → Medium → Low
3. Within same priority: order by effort (smallest first for quick wins)
4. Note dependencies between tasks
5. Identify tasks that can be parallelized

### Final Output

Save the refactor plan to `.kiro/specs/best-practices-refactor/` with:

- `requirements.md` — all findings as requirements
- `design.md` — the refactor approach for each task group
- `tasks.md` — ordered task list with checkboxes

---

## Execution Rules

### How to Audit Each File

For each source file:

1. Read the full file content
2. Check against EVERY applicable rule from the steering files
3. Record each violation with: file path, line number(s), rule violated, severity, suggested fix
4. Be specific — don't say "has issues", say exactly what the issue is and where

### Thoroughness Requirements

- **Every `.js` file** in `src/` must be checked (including `src/inngest/functions/`)
- **Every API route** must be checked for thin-route compliance
- **Every component** must be checked for React best practices
- **Every lib module** must be checked for architecture compliance
- **Every hook** in `src/hooks/` must be checked
- **Every util** in `src/utils/` must be checked
- **Every test file** in `__tests__/` must be checked for testing anti-patterns
- **`globals.css`** must be checked for dead rules, duplication, and size
- Do NOT skip files because they're large — those are often the worst offenders
- Do NOT assume a file is clean because it was recently modified

### Confidence Levels

- **HIGH**: Clear violation of an explicit rule (e.g., `console.log` in a lib module)
- **MEDIUM**: Likely violation but could have a valid reason (e.g., large file that might be justified)
- **LOW**: Possible improvement but debatable (e.g., could use `flatMap` instead of `filter().map()`)

### Interactive Mode

After each phase:

1. Present findings in a clear, scannable format
2. Ask: "Any questions about these findings? Anything you want me to dig deeper into?"
3. Wait for user response before proceeding to next phase
4. If user asks to drill into a specific finding, show the exact code and explain the violation in detail
5. If user disagrees with a finding, note it as "SKIPPED — user decision" in the final report

### What NOT to Do

- Do NOT auto-fix anything — this skill is audit + plan only
- Do NOT modify test files unless explicitly asked
- Do NOT skip phases — run all 5 even if early phases find many issues
- Do NOT present findings without file paths and line numbers
- Do NOT be vague — every finding must have a specific, actionable fix
