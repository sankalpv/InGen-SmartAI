# InGen SmartAI: Local Autonomous Productivity Agent

**InGen SmartAI** is a privacy-first, local-only productivity dashboard that acts as your executive assistant. Unlike cloud-based tools, InGen runs entirely on your machine, accessing your Outlook data via local AppleScript bridges and processing intelligence using local LLMs (Ollama) and Vector Stores.

---

## Getting Started

### Prerequisites
- **macOS** (or Windows, see below) with Microsoft Outlook installed
- **Ollama** running locally with `llama3` and `nomic-embed-text` models pulled
- **Node.js 18+**

### Mac
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local  # fill in GEMINI_API_KEY etc.

# 3. Launch everything (app + background agent + startup checks)
node launcher.js
```

Or, if the dev server is already running, launch just the background agent:
```bash
node services/background-agent.js
```

### Windows
```bat
setup_windows.bat    :: install dependencies & check PowerShell execution policy
start_windows.bat    :: launch the app + Windows background agent
```

### Environment Variables (`.env.local`)
| Variable | Required | Description |
|---|---|---|
| `GITHUB_GIST_TOKEN` | Optional | GitHub token with `gist` scope — enables log upload from Settings |
| `OLLAMA_BASE_URL` | Optional | Defaults to `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Optional | Defaults to `llama3` |
| `LOG_LEVEL` | Optional | `DEBUG` / `INFO` / `WARN` / `ERROR` (default: `INFO`) |

---

## The Development Journey

### Phase 1: Foundation & The "Local-Only" Constraint
We started with a clear goal: **Privacy**. Instead of using the Microsoft Graph API (which requires cloud consent), we built a custom bridge using **AppleScript (JXA)** to talk directly to the local Outlook application.
- **Challenge:** Fetching data locally without blocking the UI.
- **Solution:** Implemented `node-cron` for background ingestion and decoupled the frontend from the data fetching layer.

### Phase 2: Building the Brain (Local RAG)
To make the agent "smart", we needed it to remember past context. We implemented **Retrieval-Augmented Generation (RAG)** entirely locally.
- **Stack:** `hnswlib-node` for the vector database and `ollama` (llama3/gemma) for embeddings.
- **Feature:** We ingested your "Sent Items" to teach the agent your writing style.

### Phase 3: Agentic Workflows
We moved beyond "passive display" to "active assistance".
- **Context-Aware Drafting:** The `generateDraft` function searches the vector DB for similar past emails and mimics your tone.
- **Meeting Briefs:** The meeting view automatically searches for email threads related to the meeting title, generating "Pre-Meeting Briefs" so you're always prepared.

### Phase 4: "InGen" & The Liquid Glass UI
The interface was overhauled to match the sophisticated backend.
- **Design System:** "Liquid Glass" aesthetic (Glassmorphism) for a premium, futuristic look.
- **UX:** Fluid animations, skeleton loading states, and a dedicated "Auto-Pilot" status indicator.

### Phase 5: Optimization & Robustness
- **Calendar Bottleneck Fix:** Fetch time reduced from 25s+ to <1s by targeting Calendar ID directly.
- **Concurrency:** File locking on the background agent prevents multiple sync processes colliding.

### Phase 6: Context-Aware Intelligence (Vector RAG)
- **Local Vector Store:** `hnswlib-node` stores email embeddings for AI context retrieval.
- **RAG for Meeting Briefs:** `prepareMeetingBrief` searches the vector store to summarize what happened and surface open questions.
- **Enhanced Daily Briefing:** 2000-char context window per email for detailed, actionable morning summaries.

### Phase 7: Dive Deep Assistant (Chat with Data)
- **RAG + LLM:** `chatWithData` retrieves relevant context from the vector store for any query.
- **Liquid UI:** Floating, glassmorphic chat interface (`AIChat.js`).
- **Citations:** The agent cites specific emails and meetings in its responses.

### Phase 8: Intelligent Scheduling Assistant
- **Constraint Extraction:** AI reads incoming emails to understand scheduling intent.
- **Slot Finding:** Scans your local Outlook calendar for free slots — zero external API calls.
- **Action:** "Find Time" button appears on relevant emails to copy a perfect reply with one click.

### Phase 9: System Hardening & Windows Support

#### 🪵 Structured Logging (`services/logger.js`)
All services now use a centralized, structured logger:
- **Levels:** `DEBUG` / `INFO` / `WARN` / `ERROR` (controlled by `LOG_LEVEL` env var)
- **Format:** `[TIMESTAMP] [LEVEL] [MODULE] message`
- **Output:** Colorized console + `smartai.log` file (auto-created)
- **Child loggers:** Each service has its own namespace (e.g. `[AI]`, `[Agent]`, `[VectorStore]`)

#### 🔧 Centralized Prompts (`services/prompt-loader.js` + `config/prompts.json`)
- All AI prompts are defined in `config/prompts.json` — no hardcoded strings in code.
- **30-second hot-reload cache** — push a new prompt from a remote URL via Settings and it takes effect on the next AI call without a restart.
- Remote update endpoint: `POST /api/settings/update-prompts`

#### 🚀 Launcher + Startup Checks (`launcher.js` + `services/startup-checks.js`)
`node launcher.js` now:
1. Runs pre-flight checks and prints a formatted report:
   ```
   ✅  Ollama service reachable
   ✅  Ollama model: llama3
   ⚠️  Ollama model: nomic-embed-text  → Run: ollama pull nomic-embed-text
   ✅  osascript available
   ❌  Env var: GEMINI_API_KEY  → Add to .env.local
   ✅  hnswlib-node native module
   ✅  config/settings.json valid
   ```
2. Spawns the Next.js app and background agent as child processes.
3. Prefixes all output with `[App]` / `[Agent]` for easy log filtering.

#### 📤 Remote Log Upload (Settings → Diagnostics & Logs)
- One-click upload of `smartai.log` to a **secret GitHub Gist**.
- Requires `GITHUB_GIST_TOKEN` in `.env.local` (needs `gist` scope only).
- The "View Gist →" link appears inline after a successful upload.

#### 🪟 Windows Support
- `services/background-agent-windows.js` — Windows-native background agent using PowerShell.
- `services/outlook-windows.js` — Outlook COM automation via PowerShell scripts.
- `scripts/windows/` — PowerShell scripts for fetching emails, calendar events, and calendars.
- `setup_windows.bat` / `start_windows.bat` — one-click setup and launch.

---

## Technical Architecture

### Core Stack
| Layer | Technology | Reason |
|---|---|---|
| **UI + API** | Next.js 16 (App Router) | Unified full-stack, React frontend + API routes |
| **AI / LLM** | Ollama (llama3 / gemma2) | Local-only, fully private, zero cost |
| **Vector DB** | `hnswlib-node` | Local-only, in-process vector search |
| **Embeddings** | Ollama `nomic-embed-text` | Privacy-first, no cloud |
| **Scheduler** | `node-cron` | Incremental email sync every 15 min |
| **Mac Bridge** | AppleScript / JXA (`osascript`) | Direct local Outlook access, no Graph API |
| **Windows Bridge** | PowerShell + COM automation | Equivalent local Outlook access on Windows |

### Key Services
| File | Purpose |
|---|---|
| `services/ai.js` | All AI functions: analyze, draft, brief, chat, schedule |
| `services/vector-store.js` | Local email vector DB (HNSWLib) |
| `services/background-agent.js` | Mac incremental email sync (cron) |
| `services/background-agent-windows.js` | Windows incremental email sync (cron) |
| `services/outlook-local.js` | Mac Outlook bridge (JXA) |
| `services/outlook-windows.js` | Windows Outlook bridge (PowerShell) |
| `services/logger.js` | Structured logging with levels, timestamps, file output |
| `services/prompt-loader.js` | Hot-reloadable prompts from `config/prompts.json` |
| `services/startup-checks.js` | Pre-flight environment validation |
| `launcher.js` | Cross-platform launcher (Mac/Windows) |

### API Routes
| Route | Method | Description |
|---|---|---|
| `/api/outlook-local` | GET | Fetch emails from local Outlook |
| `/api/calendar` | GET | Fetch calendar events + pre-generate meeting briefs |
| `/api/meeting-brief` | GET | On-demand meeting brief (RAG) |
| `/api/draft` | POST | Generate email draft reply (RAG) |
| `/api/ask` | POST | Ask a question about a specific email |
| `/api/agent-status` | GET | Background agent status |
| `/api/settings/config` | GET/POST | Read/write `config/settings.json` |
| `/api/settings/calendars` | GET | List available Outlook calendars |
| `/api/settings/update-prompts` | POST | Fetch and hot-reload prompts from remote URL |
| `/api/logs/upload` | POST | Upload `smartai.log` to a secret GitHub Gist |

### Data Flow
```
Outlook (local app)
    │
    ▼ AppleScript / PowerShell
background-agent.js  ──►  data/emails.json  ──►  vector-store.js
                                                        │
                                                        ▼
                                                 HNSWLib index
                                                        │
                                              ┌─────────┴──────────┐
                                              ▼                     ▼
                                          ai.js                 chat UI
                                       (RAG context)        (citations)
                                              │
                                              ▼
                                      Gemini / Ollama
```
