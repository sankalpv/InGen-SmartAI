---
inclusion: auto
---

# Git Worktrees — Required Workflow for Spec-Driven Work

All spec-driven code changes (tasks from `.kiro/specs/`) MUST be made in a git worktree, not directly on the main working copy. Quick ad-hoc edits outside of specs do not require a worktree.

## Why Worktrees

- The main checkout stays on a stable branch at all times — no half-finished work, no stashes to remember.
- Multiple features, fixes, or experiments can run in parallel, each in its own isolated directory with its own branch.
- AI agents can work in a dedicated worktree without interfering with the developer's active work (or vice versa).
- All worktrees share the same `.git` history, so commits are immediately visible across trees and merging works normally.

## Pre-Flight Check for Spec Work

Before executing ANY task from a `.kiro/specs/` spec, the agent MUST:

1. Detect the spec name from the task file path (e.g., `.kiro/specs/e2e-vcr-recording/tasks.md` → `e2e-vcr-recording`).
2. Check if the current working directory is already a worktree for this spec (branch name contains the spec name).
3. If NOT in a matching worktree, auto-create one before modifying any files:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
SPEC_NAME="<spec-name>"  # extracted from the spec path
BRANCH="feat/${SPEC_NAME}"
WORKTREE_DIR="${REPO_ROOT}/../${REPO_NAME}-${SPEC_NAME}"

git worktree add "$WORKTREE_DIR" -b "$BRANCH" 2>/dev/null || git worktree add "$WORKTREE_DIR" "$BRANCH"
cd "$WORKTREE_DIR"
npm install --ignore-scripts
```

4. All subsequent file edits, builds, and tests for that spec happen inside the worktree.
5. The agent MUST NOT modify files in the main checkout when executing spec tasks.

## Naming Conventions

- Worktree directory: `../<repo-name>-<spec-name>` (sibling of the main repo)
- Branch name: `feat/<spec-name>` (derived from the spec directory name)
- Examples:
  - Spec: `.kiro/specs/e2e-vcr-recording/` → branch `feat/e2e-vcr-recording`, dir `../InGen-SmartAI-e2e-vcr-recording`
  - Spec: `.kiro/specs/code-quality-cleanup/` → branch `feat/code-quality-cleanup`, dir `../InGen-SmartAI-code-quality-cleanup`

## When the Work Is Done

1. Commit and push from the worktree as normal.
2. Return to the main repo and clean up:

```bash
git worktree remove ../InGen-SmartAI-e2e-vcr-recording
```

3. If the branch was merged, delete it:

```bash
git branch -d feat/e2e-vcr-recording
```

### Listing active worktrees

```bash
git worktree list
```

## Rules

- Spec-driven work MUST happen in a worktree — the agent must auto-create one if not already in one.
- Each worktree gets its own branch — do not check out the same branch in two worktrees.
- Run `npm install --ignore-scripts` inside a new worktree (node_modules is not shared).
- Keep worktree count manageable. Remove worktrees promptly after merging.
- Ad-hoc edits (not from a spec) may be made directly in the main checkout.
