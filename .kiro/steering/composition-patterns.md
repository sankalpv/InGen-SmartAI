---
inclusion: auto
---

# React Composition Patterns (Vercel Engineering v1.0.0)

Source: github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns
Full rules with code examples: #[[file:docs/composition-patterns-rules.md]]

Composition patterns for building flexible, maintainable React components.
Avoid boolean prop proliferation by using compound components, lifting state, and composing internals.

## 1. Component Architecture — HIGH

- 1.1 **Avoid Boolean Prop Proliferation** (CRITICAL): Don't add boolean props like `isThread`, `isEditing` to customize behavior. Each boolean doubles possible states. Use composition — create explicit variant components that compose shared internals.
- 1.2 **Use Compound Components** (HIGH): Structure complex components with shared context. Each subcomponent accesses shared state via context, not props. Export as `Component.Sub` pattern. Consumers compose exactly what they need.

## 2. State Management — MEDIUM

- 2.1 **Decouple State Management from UI** (MEDIUM): Provider is the only place that knows how state is managed. UI components consume the context interface — they don't know if state comes from useState, Zustand, or server sync. Swap the provider, keep the UI.
- 2.2 **Define Generic Context Interfaces for Dependency Injection** (HIGH): Define a generic interface with three parts: `state`, `actions`, `meta`. Any provider can implement this contract. Same UI components work with completely different state implementations.
- 2.3 **Lift State into Provider Components** (HIGH): Move state into dedicated providers so sibling components outside the main UI can access/modify state without prop drilling. Components that need shared state just need to be within the same provider, not visually nested.

## 3. Implementation Patterns — MEDIUM

- 3.1 **Create Explicit Component Variants** (MEDIUM): Instead of one component with many boolean props, create explicit variant components (`ThreadComposer`, `EditComposer`, `ForwardComposer`). Each variant composes the pieces it needs. Self-documenting, no hidden conditionals.
- 3.2 **Prefer Composing Children Over Render Props** (MEDIUM): Use `children` for composition instead of `renderX` props. Children are more readable and compose naturally. Use render props only when parent needs to pass data back to child.

## 4. React 19 APIs — MEDIUM

- 4.1 **React 19 API Changes** (MEDIUM): `ref` is now a regular prop (no `forwardRef` needed). `use()` replaces `useContext()` and can be called conditionally.
