- [x] Search for "Agent Ux Mocks" string in the codebase
- [x] List contents of `app` and `components` directories
- [x] Locate the file and report to the user

## Local Autonomous Agent Phase 1: Background Ingestion
- [x] Install `node-cron` for background scheduling <!-- id: 3 -->
- [x] Create `scripts/fetch_outlook_incremental.scpt` (AppleScript for incremental fetching) <!-- id: 4 -->
- [x] Create `services/background-agent.js` (Node.js background worker) <!-- id: 5 -->
- [x] Test the background agent independently (Requires macOS Permissions) <!-- id: 6 -->

## Phase 2: Local Knowledge Base (RAG)
- [x] Install dependencies (`hnswlib-node`, `ollama`) <!-- id: 7 -->
- [x] Create `services/vector-store.js` (Vector Database Manager) <!-- id: 8 -->
- [x] Implement `ingestEmail` function in `vector-store.js` <!-- id: 9 -->
- [x] Integrate `vector-store.js` into `background-agent.js` <!-- id: 10 -->

## Phase 3: Agentic Workflows
- [x] Create `services/ai.js` (Contextual Drafting) <!-- id: 11 -->
- [x] Implement `generateDraft` using RAG context <!-- id: 12 -->
- [x] Create `app/api/draft/route.js` endpoint <!-- id: 14 -->
- [x] Update frontend to use new AI service <!-- id: 13 -->

## Phase 4: Frontend "Agent View"
- [x] Create `/api/agent-status` endpoint (reads `sync_state.json`) <!-- id: 15 -->
- [x] Update `Header.js` or `page.js` to show "Auto-Pilot" status <!-- id: 16 -->
- [x] Debug and Fix Outlook Fetch Script (JXA) <!-- id: 18 -->
- [x] Fix "Unknown Sender" in Frontend (switch to JXA) <!-- id: 19 -->
- [x] Add "AI Summary" to Email Card <!-- id: 20 -->
- [x] Fix "AlertTriangle" ReferenceError in WeeklyRetroModal <!-- id: 21 -->
- [x] Implement Local Outlook Calendar Fetch <!-- id: 22 -->
- [x] Fix "attendees" property crash in MeetingCard <!-- id: 23 -->
- [x] Fix "Invalid Date" in MeetingCard (Map Outlook schema to Frontend) <!-- id: 24 -->
- [x] Fix "background-agent" concurrency issues (Added lock & killed duplicates) <!-- id: 25 -->
- [x] Fix Embedding Context Limit (Truncate long emails) <!-- id: 26 -->
- [x] Fix AppleScript "whose" clause for date filtering (ID 432) <!-- id: 27 -->

## Phase 5: Rebranding & Liquid Glass UX (InGen)
- [x] Rename Product to "InGen" (Metadata, Titles) <!-- id: 28 -->
- [x] Implement Liquid Glass Design System (CSS Variables, Backgrounds) <!-- id: 29 -->
- [x] Refactor Cards to Glassmorphism (Meetings, Emails, Slack) <!-- id: 30 -->
- [x] Update Layout and Navigation (Sidebar/Header) <!-- id: 31 -->
- [x] Polish Animations and Interactions <!-- id: 32 -->
- [x] Improve Performance (Outlook Caching + Parallel Frontend Fetch) <!-- id: 27 -->

## Phase 6: Context-Aware Intelligence (Vector RAG)
- [x] Create `scripts/ingest_history.js` (Bulk History Ingestion) <!-- id: 36 -->
- [x] Modify `services/ai.js` to use RAG context for drafts <!-- id: 37 -->
- [x] Implement `vectorStore.search` integration in Draft API <!-- id: 38 -->
- [x] Verify Vector Search accuracy with test queries <!-- id: 39 -->
- [x] Implement RAG for Meeting Briefs (`prepareMeetingBrief`) <!-- id: 40 -->
