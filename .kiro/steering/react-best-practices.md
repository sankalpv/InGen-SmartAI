---
inclusion: auto
---

# React & Next.js Best Practices (Vercel Engineering v1.0.0)

Source: github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
Full rules with code examples: #[[file:docs/react-best-practices-rules.md]]

When writing, reviewing, or refactoring React/Next.js code, follow these 40+ rules ordered by impact.
Each rule ID maps to the full rule document in `docs/react-best-practices-rules.md`.

## 1. Eliminating Waterfalls — CRITICAL

- 1.1 **Defer Await Until Needed**: Move `await` into the branch that uses the result
- 1.2 **Dependency-Based Parallelization**: Use promise chaining for partial dependencies
- 1.3 **Prevent Waterfall Chains in API Routes**: Start independent promises immediately
- 1.4 **Promise.all() for Independent Operations**: Never sequentially await independent fetches
- 1.5 **Strategic Suspense Boundaries**: Wrap async components in `<Suspense>`

## 2. Bundle Size Optimization — CRITICAL

- 2.1 **Avoid Barrel File Imports**: Import from specific paths, not barrel index files
- 2.2 **Conditional Module Loading**: Load large modules only when feature is activated
- 2.3 **Defer Non-Critical Third-Party Libraries**: Analytics/logging load after hydration
- 2.4 **Dynamic Imports for Heavy Components**: Use `next/dynamic` with `{ ssr: false }`
- 2.5 **Preload Based on User Intent**: Preload on hover/focus before click

## 3. Server-Side Performance — HIGH

- 3.1 **Authenticate Server Actions Like API Routes**: Always verify auth inside each action
- 3.2 **Avoid Duplicate Serialization in RSC Props**: Transform in client, not server
- 3.3 **Cross-Request LRU Caching**: Use LRU cache for data shared across requests
- 3.4 **Hoist Static I/O to Module Level**: Read fonts/configs once at module init
- 3.5 **Minimize Serialization at RSC Boundaries**: Only pass fields client uses
- 3.6 **Parallel Data Fetching with Component Composition**: Sibling RSCs fetch in parallel
- 3.7 **Parallel Nested Data Fetching**: Chain dependent fetches within each item's promise
- 3.8 **Per-Request Deduplication with React.cache()**: Deduplicate DB queries within request
- 3.9 **Use after() for Non-Blocking Operations**: Logging/analytics after response sent

## 4. Client-Side Data Fetching — MEDIUM-HIGH

- 4.1 **Deduplicate Global Event Listeners**: Share listeners across component instances
- 4.2 **Use Passive Event Listeners**: `{ passive: true }` for touch/wheel handlers
- 4.3 **Use SWR for Automatic Deduplication**: Multiple components share one request
- 4.4 **Version and Minimize localStorage Data**: Version prefix, minimal fields, try-catch

## 5. Re-render Optimization — MEDIUM

- 5.1 **Calculate Derived State During Rendering**: Don't store computed values in state
- 5.2 **Defer State Reads to Usage Point**: Read searchParams in callbacks, not subscriptions
- 5.3 **Don't Wrap Simple Expressions in useMemo**: Primitive results don't need memoization
- 5.4 **Don't Define Components Inside Components**: Causes remount every render
- 5.5 **Extract Default Non-primitive Param Values**: Use constants for memo'd component defaults
- 5.6 **Extract to Memoized Components**: Enable early returns before expensive computation
- 5.7 **Narrow Effect Dependencies**: Use `user.id` not `user`; derive booleans from values
- 5.8 **Put Interaction Logic in Event Handlers**: Don't model actions as state + effect
- 5.9 **Split Combined Hook Computations**: Separate useMemo/useEffect with independent deps
- 5.10 **Subscribe to Derived State**: `useMediaQuery` not `useWindowWidth`
- 5.11 **Use Functional setState Updates**: `setItems(curr => [...curr, item])` prevents stale closures
- 5.12 **Use Lazy State Initialization**: `useState(() => expensive())` runs only once
- 5.13 **Use Transitions for Non-Urgent Updates**: `startTransition` for scroll/search
- 5.14 **Use useDeferredValue for Expensive Derived Renders**: Keep input responsive
- 5.15 **Use useRef for Transient Values**: Mouse position, intervals, flags

## 6. Rendering Performance — MEDIUM

- 6.1 **Animate SVG Wrapper Instead of SVG Element**: Enables hardware acceleration
- 6.2 **CSS content-visibility for Long Lists**: Skip layout/paint for off-screen items
- 6.3 **Hoist Static JSX Elements**: Extract static JSX outside components
- 6.4 **Optimize SVG Precision**: Reduce coordinate precision, use SVGO
- 6.5 **Prevent Hydration Mismatch Without Flickering**: Inline script sets DOM before hydration
- 6.6 **Suppress Expected Hydration Mismatches**: `suppressHydrationWarning` for dates/IDs
- 6.7 **Use Activity Component for Show/Hide**: Preserve state/DOM for toggled components
- 6.8 **Use defer or async on Script Tags**: `next/script` with strategy prop
- 6.9 **Use Explicit Conditional Rendering**: Ternary not `&&` when condition can be 0/NaN
- 6.10 **Use React DOM Resource Hints**: prefetchDNS, preconnect, preload, preinit
- 6.11 **Use useTransition Over Manual Loading States**: Built-in isPending

## 7. JavaScript Performance — LOW-MEDIUM

- 7.1 **Avoid Layout Thrashing**: Batch DOM writes, then read once
- 7.2 **Build Index Maps for Repeated Lookups**: `new Map()` instead of repeated `.find()`
- 7.3 **Cache Property Access in Loops**: Extract deep property before loop
- 7.4 **Cache Repeated Function Calls**: Module-level Map for repeated computations
- 7.5 **Cache Storage API Calls**: In-memory cache for localStorage/cookies
- 7.6 **Combine Multiple Array Iterations**: Single loop instead of chained filter/map
- 7.7 **Defer Non-Critical Work with requestIdleCallback**: Analytics, saves, prefetching
- 7.8 **Early Length Check for Array Comparisons**: Check lengths before expensive comparison
- 7.9 **Early Return from Functions**: Return as soon as result is determined
- 7.10 **Hoist RegExp Creation**: Module-level or useMemo, not inside render
- 7.11 **Use flatMap to Map and Filter in One Pass**: Eliminates intermediate arrays
- 7.12 **Use Loop for Min/Max Instead of Sort**: O(n) not O(n log n)
- 7.13 **Use Set/Map for O(1) Lookups**: `new Set()` + `.has()` not `array.includes()`
- 7.14 **Use toSorted() Instead of sort()**: Prevents mutation bugs in React state

## 8. Advanced Patterns — LOW

- 8.1 **Initialize App Once, Not Per Mount**: Module-level guard for one-time init
- 8.2 **Store Event Handlers in Refs**: Stable subscriptions without re-subscribe
- 8.3 **useEffectEvent for Stable Callback Refs**: Latest values without dep array changes
