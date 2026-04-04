---
inclusion: manual
---

# Mainline Feature Sync

## Purpose

Systematically identify new features and fixes on the `mainline` branch that don't exist on the current working branch (`ahs`), evaluate whether each is team-specific or universally useful, and create Kiro specs to re-implement the useful ones.

The branches have diverged significantly — direct cherry-picks or rebases are not viable. Instead, this skill performs a "understand → evaluate → spec → implement" workflow for each mainline change.

## When to Use

- Periodically (weekly or bi-weekly) to stay current with mainline improvements
- After being notified that mainline has new commits
- When you want to audit what mainline has that your branch doesn't

## Architecture Context

Before implementing any changes, read and follow the project's steering files:

- `#[[file:.kiro/steering/ingen-smartai-architecture.md]]` — layer responsibilities, design patterns, module catalog
- `#[[file:.kiro/steering/ingen-smartai-development.md]]` — code conventions, ESM standard, testing patterns
- `#[[file:.kiro/steering/react-best-practices.md]]` — component patterns
- `#[[file:.kiro/steering/ingen-smartai-anti-patterns.md]]` — what NOT to do

## Configuration

The skill uses a tracking file at `config/mainline-sync-state.json` to remember which commits have already been evaluated, so subsequent runs only process new commits.

### Team-Specific Indicators (Skip Criteria)

These patterns indicate a change is specific to another team and should be skipped unless the underlying capability is generalizable:

- References to `cpp` team (case-insensitive) in commit messages, code, config keys, variable names
- References to specific team member aliases: `sankalpv` and any others configured below
- Hardcoded team-specific Taskei room IDs, folder IDs, or goal prefixes that aren't configurable
- Team-branded route names, page titles, or UI text that reference a specific team

### Configurable Filters

Edit `#[[file:config/mainline-sync-config.json]]` to customize:

- `sourceBranch` / `targetBranch` — which branches to compare
- `teamSpecificPatterns` — regex patterns that indicate team-specific code (all matched case-insensitively)
- `teamSpecificAliases` — Amazon aliases whose changes are likely team-specific
- `alwaysRelevantPatterns` — regex patterns that signal universally useful changes (perf, security, cache, etc.)
- `patternMatchMode` — always `case-insensitive`; all patterns are matched with the `i` flag
- `skipCommits` — commit hashes to permanently skip (already evaluated and rejected)
- `maxCommitsPerRun` — limit how many commits to process in one session

## Workflow

### Phase 1: Discovery

1. Fetch the latest state of the source branch:

   ```bash
   git fetch origin <sourceBranch>
   ```

2. Load `config/mainline-sync-state.json` to find previously evaluated commits.

3. Identify new commits on the source branch that are NOT on the target branch:

   ```bash
   git -P log --format="%H %s" <sourceBranch> --not <targetBranch>
   ```

4. Filter out commits already recorded in the sync state file or in `skipCommits`.

5. If no new commits, report "Already up to date" and stop.

6. Reverse the list so we process oldest-first (chronological order).

### Phase 2: Analysis (Per Commit)

For each new commit, starting from the oldest:

1. **Read the full commit message and diff:**

   ```bash
   git -P show <hash> --stat
   git -P show <hash> -- '*.js' '*.json' '*.md' '*.css' ':!package-lock.json' ':!node_modules'
   ```

2. **Classify the commit** into one of these categories:
   - **SKIP_TEAM_SPECIFIC**: The change is entirely specific to another team. Examples:
     - Hardcoded team config values (specific room IDs, folder IDs, aliases)
     - Team-branded UI text or routes that aren't configurable
     - Fixes for bugs caused by team-specific code patterns
   - **ADOPT_AS_IS**: The change is universally useful and can be adopted directly. Examples:
     - Performance improvements to shared infrastructure
     - Bug fixes in shared libraries (caching, streaming, API response handling)
     - New shared utilities or patterns
   - **ADOPT_GENERALIZED**: The change has a useful capability buried in team-specific code. The capability should be extracted and made configurable. Examples:
     - A feature that hardcodes team values but the underlying functionality is useful
     - A fix that addresses a real bug but also includes team-specific config changes
     - A commit that mixes universal improvements with team-specific config — extract the universal parts
   - **ASK_USER**: The classification is ambiguous. Present the commit summary, affected files, and your reasoning to the user and ask for direction. **When in doubt, always use this category.**

3. **Apply classification heuristics:**

   a. Scan the diff for team-specific patterns from `teamSpecificPatterns` in the config.

   b. Scan the diff for always-relevant patterns from `alwaysRelevantPatterns` in the config.

   c. Check the commit author against `teamSpecificAliases`.

   d. Analyze the files changed:
   - Changes only to `config/settings.json` with team-specific values → likely SKIP_TEAM_SPECIFIC
   - Changes to `src/lib/*.js` shared modules → likely ADOPT_AS_IS or ADOPT_GENERALIZED
   - Changes to test files only → evaluate based on what they test
   - New files → evaluate the capability they provide

   e. Read the commit message for intent signals:
   - "CPP", team names, specific aliases → team-specific signal
   - "perf", "fix", "security", "refactor" → universal signal
   - Feature additions → evaluate if the feature concept is universal even if implementation is team-specific

   f. **Handle mixed commits**: If a commit contains BOTH team-specific and universal changes, classify as ADOPT_GENERALIZED. In the spec, clearly separate what to adopt vs. what to replace with configurable alternatives.

4. **For ADOPT_GENERALIZED commits**, identify:
   - What is the core capability being added?
   - What parts are team-specific and need to be made configurable?
   - What config keys or settings would make this generic?
   - What hardcoded values need to move to `config/settings.json`?

### Phase 2.5: Grouping Related Commits

Before creating specs, check if multiple commits are part of the same logical feature:

- Same files modified across commits
- Commit messages reference the same feature area
- Sequential commits that build on each other (e.g., "feat: Add X" followed by "fix: Fix X edge case")

Group related commits into a single spec. The spec should reference all source commit hashes.

### Phase 3: Spec Creation

For each commit (or group) classified as ADOPT_AS_IS or ADOPT_GENERALIZED:

1. **Check if the feature already exists** on the target branch:
   - Search for similar function names, module names, or patterns in the current codebase
   - If the feature already exists (perhaps implemented differently), note this in the state file with status `already-exists` and skip spec creation
   - If it partially exists, create a spec for the delta only

2. **Create a Kiro spec** in `.kiro/specs/mainline-sync-<short-description>/`:

   The spec MUST follow the project's existing spec format (see `.kiro/specs/team-agnostic-wbr/` for reference) with:
   - `requirements.md` — What the feature does, acceptance criteria, user stories
   - `design.md` — How to implement it on our branch, noting divergences from mainline
   - `tasks.md` — Implementation tasks with checkboxes

3. **In the requirements**, include:
   - Source commit hash(es) and message(s) for traceability
   - The original intent of the change
   - How it should be adapted for our branch (if ADOPT_GENERALIZED)
   - Any team-specific patterns that must be replaced with configurable alternatives
   - Acceptance criteria following the project's `WHEN...SHALL` format

4. **In the design**, include:
   - Which files on our branch need to be modified (check actual current file paths, not mainline paths — they may differ due to divergence)
   - How our branch's version of those files differs from mainline's
   - The specific code patterns to implement, following ESM conventions
   - Any new config keys needed in `config/settings.json`
   - How to reference the mainline diff: `git -P show <hash> -- <relevant-files>`

5. **In the tasks**, include:
   - Concrete implementation steps with file paths
   - A test verification step
   - A step to update the sync state file

### Phase 4: State Tracking

After processing each commit (regardless of classification):

1. Update `#[[file:config/mainline-sync-state.json]]` with the evaluation result:

   Each entry in `evaluatedCommits` should have:
   - `message` — commit subject line
   - `classification` — one of: `SKIP_TEAM_SPECIFIC`, `ADOPT_AS_IS`, `ADOPT_GENERALIZED`, `ASK_USER`
   - `reason` — brief explanation of why this classification was chosen
   - `specPath` — path to the created spec directory (null if no spec created)
   - `evaluatedAt` — ISO timestamp
   - `status` — one of: `skipped`, `spec-created`, `implemented`, `already-exists`, `deferred`, `ask-user`

2. Present a summary to the user:
   - Total commits evaluated
   - Skipped (team-specific) — list with one-line reasons
   - Specs created — list with spec paths and brief descriptions
   - Needs user input (ASK_USER) — list with the ambiguity explanation
   - Already exists on our branch — list with what was found

### Phase 5: Implementation (On Demand)

When the user asks to implement a spec created by this skill:

1. Read the spec's requirements and design documents
2. Reference the original mainline commit diff for implementation guidance:
   ```bash
   git -P show <source-commit-hash> -- <relevant-files>
   ```
3. Compare the mainline version of affected files with our branch's version to understand divergence:
   ```bash
   git -P diff <targetBranch>...<sourceBranch> -- <specific-file>
   ```
4. Implement the changes on the current branch following the project's architecture patterns from the steering files
5. Run tests to verify: `npm test`
6. Run lint to verify: `npm run lint`
7. Update the sync state to mark the commit as `implemented`

## Important Rules

- **Never cherry-pick or merge** from mainline — always re-implement based on understanding the intent
- **Always check if a capability already exists** on our branch before creating a spec
- **When in doubt, ASK the user** — don't guess on classification. Present your reasoning and let them decide
- **Idempotent**: Running the skill twice must not create duplicate specs — check the state file first
- **Follow project conventions**: ESM imports, structured logger, API response envelope, testing patterns (see steering files)
- **Generalize team-specific code**: When adopting, always make hardcoded values configurable via `config/settings.json`
- **Traceability**: Every spec must include the source commit hash(es) so changes can be traced back to mainline
- **File path awareness**: Our branch uses `src/lib/` for lib modules while mainline uses `services/`. Our branch uses `src/app/` for pages/routes while mainline uses `app/`. Always map mainline paths to our branch's paths when writing specs:
  - Mainline `services/*.js` → Our branch `src/lib/*.js`
  - Mainline `app/api/*/route.js` → Our branch `src/app/api/*/route.js`
  - Mainline `app/*/page.js` → Our branch `src/app/*/page.js`
  - Mainline `config/` → Our branch `config/` (same)
- **Don't blindly copy**: Understand WHY a change was made on mainline, then implement the right solution for our branch's current state
