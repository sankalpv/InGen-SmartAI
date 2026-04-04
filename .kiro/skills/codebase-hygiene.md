---
inclusion: manual
---

# Codebase Hygiene Audit

## Purpose

Systematically scan the codebase for dead code, outdated comments, stale documentation, and obsolete steering docs. Produce a prioritized report of findings and optionally clean them up.

## When to Use

- Before a major release or milestone to reduce cruft
- After significant refactors to catch orphaned references
- Periodically (monthly) as general hygiene
- When onboarding new team members and wanting a clean codebase

## Architecture Context

Before auditing, read the project's steering files to understand what's current:

- `#[[file:.kiro/steering/ingen-smartai-architecture.md]]` — module catalog, layer responsibilities
- `#[[file:.kiro/steering/ingen-smartai-development.md]]` — code conventions, tech stack
- `#[[file:.kiro/steering/ingen-smartai-anti-patterns.md]]` — known issues, testing rules
- `#[[file:.kiro/steering/react-best-practices.md]]` — component patterns

## Scope

The audit covers four categories:

1. **Dead Code** — unreachable functions, unused exports, orphaned files
2. **Outdated Comments** — comments that contradict the current code
3. **Stale Documentation** — README sections, inline docs referencing removed features
4. **Obsolete Steering Docs** — steering rules that no longer match the codebase

---

## Workflow

### Phase 1: Dead Code Detection

#### 1A. Unused Exports in Lib Modules (`src/lib/*.js`)

For each module in `src/lib/`:

1. Extract all named exports and default exports
2. Search the entire codebase for import references to each export:
   ```
   Search for: import.*{.*<exportName>.*}.*from.*'<modulePath>'
   Search for: <moduleName>.<exportName>
   ```
3. Check API routes, components, other lib modules, utils, tests, and scripts
4. An export is "dead" if it has ZERO import references outside its own file AND its test file
5. Exception: exports used by the tool registry (`tool-registry.js`) may be dynamically referenced — check `register()` calls

**Classification:**

- `DEAD_EXPORT` — exported function/constant with zero consumers
- `DEAD_INTERNAL` — non-exported function defined but never called within its own module
- `DEAD_FILE` — entire module with zero imports from any other module (excluding tests)

#### 1B. Unused Components (`src/components/**/*.js`)

1. For each component file (including subdirectories like `src/components/agent/`, `src/components/wbr/`, etc.), search for imports across all page files (`src/app/*/page.js`) and other components
2. A component is dead if no page or parent component imports it
3. Check for dynamic imports too: `next/dynamic` or `await import()`
4. Check component subdirectory index files — if a subdirectory has an index that re-exports, trace through to actual consumers

#### 1C. Unused API Routes (`src/app/api/*/route.js`)

1. For each API route directory, search for `fetch('/api/<route-name>')` or ``fetch(`/api/<route-name>`)`` across all client code
2. Also check for references in `src/lib/` modules (some routes are called server-side)
3. A route is dead if no client code or lib module references it

#### 1D. Unused Utils (`src/utils/*.js`)

1. For each util module, search for imports across the entire `src/` directory
2. A util is dead if nothing imports it outside its own test file

#### 1E. Unused Hooks (`src/hooks/*.js`)

1. For each hook file, search for imports across all components and pages
2. A hook is dead if no component or page imports it
3. Check for re-exports through barrel files or index files

#### 1F. Unused Inngest Functions (`src/inngest/functions/`)

1. For each function file, check if it's registered in `src/inngest/client.js` or referenced by the `/api/inngest` route
2. An Inngest function is dead if it's not registered or referenced

#### 1G. Unused Test Helpers and Fixtures

1. Check `__tests__/helpers/` — are all helpers imported by at least one test?
2. Check `__tests__/fixtures/` — are all fixture files loaded by at least one test?

### Phase 2: Outdated Comments

#### 2A. CJS/Require References in ESM Code

The project migrated to ESM. Search for comments that still reference CJS patterns:

```
Search for: // require\(|// module\.exports|// const .* = require
Search for: /* require|/* module.exports
```

These are outdated if the surrounding code uses `import`/`export`.

#### 2B. eslint-disable Comments

The project prohibits `eslint-disable` comments. Search for any occurrences:

```
Search for: eslint-disable
```

Each one should be removed and the underlying lint issue fixed instead.

#### 2C. TODO/FIXME/HACK Audit

1. Search for all `TODO`, `FIXME`, `HACK`, `XXX`, `TEMP`, `TEMPORARY` comments
2. For each, check if the referenced issue still exists:
   - Does the code still have the problem described?
   - Is there a linked ticket/issue? If so, is it resolved?
   - Has the "temporary" code been in place for 3+ months?
3. Classify as:
   - `STALE_TODO` — the issue has been fixed but the comment remains
   - `VALID_TODO` — the issue still exists
   - `ANCIENT_TODO` — no linked ticket, been there 3+ months, unclear if still relevant

#### 2D. Function/Parameter Documentation Drift

For functions with JSDoc or inline parameter comments:

1. Check if documented parameters still exist in the function signature
2. Check if the function's described behavior matches what it actually does
3. Check if `@returns` documentation matches the actual return type/shape
4. Focus on `src/lib/` modules since they have the most documentation

#### 2E. Commented-Out Code

Search for blocks of commented-out code (3+ consecutive commented lines that look like code, not documentation):

```
Search for multi-line patterns like:
// const x = ...
// if (condition) {
// function oldThing() {
```

Commented-out code should be removed — it's in git history if needed.

#### 2F. Raw console.log/error in Lib Modules

The project requires structured logging via `logger.child()`. Search `src/lib/` for raw console usage:

```
Search for: console\.(log|error|warn|info|debug)
```

Exception: `path-resolver.js` is allowed to use `console.error` due to circular dependency with `logger.js`. All other lib modules must use the structured logger.

### Phase 3: Stale Documentation

#### 3A. README.md Audit

1. Read `README.md`
2. Check each section against reality:
   - Are listed features still present?
   - Are setup instructions still accurate?
   - Are listed dependencies still in `package.json`?
   - Are listed scripts still in `package.json`?
   - Are referenced file paths still valid?

#### 3B. Inline Documentation in Config Files

1. Check `config/settings.json` — are all documented keys still read by the codebase?
2. Check `config/prompts.json` — are all prompt templates still referenced?
3. Check `jest.config.js` — are all configured paths and patterns still valid?
4. Check `next.config.js` / `next.config.mjs` — are all settings still relevant?

#### 3C. Package.json Script Audit

1. For each script in `package.json`, verify:
   - The referenced command/file still exists
   - The script still works (check for obvious path issues)
   - The script is still referenced somewhere (README, CI, steering docs)

### Phase 4: Steering Doc Audit

For each file in `.kiro/steering/`:

#### 4A. Architecture Doc (`ingen-smartai-architecture.md`)

1. Verify the module catalog matches actual files in `src/lib/`
   - Are all listed modules still present?
   - Are there new modules not listed?
2. Verify the architecture diagram layers match the current directory structure
3. Check that code examples use current patterns (ESM, current function signatures)
4. Verify external integration list is current

#### 4B. Development Guide (`ingen-smartai-development.md`)

1. Verify tech stack versions match `package.json`
2. Verify directory structure matches reality
3. Check that build/run commands still work
4. Verify test commands and patterns are current

#### 4C. Anti-Patterns Doc (`ingen-smartai-anti-patterns.md`)

1. Check if any "known violators" mentioned have been fixed
2. Check if any anti-patterns described are no longer relevant
3. Verify mock patterns match what tests actually use
4. Check if referenced file paths are still valid

#### 4D. React Best Practices (`react-best-practices.md`)

1. Verify the referenced rules doc exists: `docs/react-best-practices-rules.md`
2. Check if the patterns described are still followed in components

#### 4E. Other Steering Docs

1. Check `composition-patterns.md` — are described patterns still in use?
2. For any steering doc, verify all `#[[file:...]]` references point to existing files

---

## Output Format

### Report Structure

Present findings grouped by category and sorted by severity:

```
## 🔴 High Priority (should fix now)
- [DEAD_FILE] src/lib/unused-module.js — zero imports across entire codebase
- [STALE_STEERING] Architecture doc lists 61 modules but 65 exist

## 🟡 Medium Priority (fix when touching these files)
- [DEAD_EXPORT] src/lib/ai.js::legacyAnalyze — no consumers found
- [STALE_TODO] src/lib/scheduling.js:42 — "TODO: remove after migration" (migration completed)
- [OUTDATED_COMMENT] src/lib/mcp-client.js:15 — references require() but file uses ESM

## 🟢 Low Priority (nice to clean up)
- [COMMENTED_CODE] src/components/Header.js:120-135 — 15 lines of commented-out JSX
- [ANCIENT_TODO] src/lib/local-store.js:88 — "FIXME: optimize later" with no ticket
```

### Per-Finding Details

Each finding should include:

- **Category**: DEAD_CODE | OUTDATED_COMMENT | STALE_DOC | STALE_STEERING
- **Severity**: HIGH | MEDIUM | LOW
- **File**: exact path and line number(s)
- **Description**: what's wrong and why
- **Suggested Action**: delete, update, or investigate
- **Confidence**: HIGH (definitely dead/stale) | MEDIUM (likely but check) | LOW (might have dynamic usage)

---

## Cleanup Mode

When the user asks to clean up findings:

1. Start with HIGH confidence, HIGH severity items
2. For dead code: remove the export/function/file, then verify no tests break
3. For outdated comments: update or remove the comment
4. For stale docs: update the documentation to match reality
5. For steering docs: update the steering file content
6. After each batch of changes, run:
   ```bash
   npm test 2>&1 | tail -20
   npm run lint 2>&1 | tail -20
   ```
7. Commit cleanup changes with message format:
   ```
   chore: Remove dead code in <module>
   chore: Update stale comments in <module>
   docs: Update steering doc <filename>
   ```

## Important Rules

- **Never remove code that's dynamically referenced** — check for string-based lookups, `eval`, dynamic imports, and tool registry entries before classifying as dead
- **Never remove test-only exports** — some functions are exported solely for testability. If the only consumer is a test file, mark as `TEST_ONLY_EXPORT` (informational, not a problem)
- **Check git blame for TODO age** — use `git -P log -1 --format="%ai" -S "TODO" -- <file>` to determine when a TODO was added
- **Steering docs are high-value** — outdated steering docs actively mislead development. Prioritize these fixes
- **Be conservative with LOW confidence findings** — present them but don't auto-delete. Dynamic usage patterns (tool registry, config-driven imports, MCP tool names) can make code appear dead when it isn't
- **Batch related cleanups** — group related dead code removals into single commits (e.g., all dead exports from one module together)
- **Preserve git history** — don't squash cleanup commits with feature work. Keep them as separate `chore:` or `docs:` commits for clean history
