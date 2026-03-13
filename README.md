# 🧬 InGen — Local AI Productivity Dashboard

**InGen** is a privacy-first, local-only AI productivity dashboard that acts as your executive assistant. It runs entirely on your MacBook — your emails, calendar, and AI processing never leave your machine.

> **100% local. Zero cloud. Full privacy.**

---

## Quick Install (macOS)

### Prerequisites
- macOS (Apple Silicon or Intel)
- Microsoft Outlook installed and signed in

### One-Command Install

1. Download `InGen.tar.gz`
2. Open Terminal and run:

```bash
mkdir -p ~/InGen-install && cd ~/InGen-install
tar xzf ~/Downloads/InGen.tar.gz
bash */scripts/install-ingen.sh
```

The installer (v2.0) automatically handles everything — **no manual configuration needed**:

**Infrastructure:**
- ✅ Disk space check (15 GB recommended)
- ✅ Xcode Command Line Tools
- ✅ Homebrew (if needed)
- ✅ Node.js 20+ (if needed)
- ✅ Ollama AI engine (if needed)
- ✅ AI models (~10 GB one-time download)
- ✅ MCP tooling (`amzn-mcp`, `builder-mcp` via Amazon Toolbox)

**Configuration (prompted during install):**
- ✅ **Outlook calendar selection** — auto-detects available calendars, lets you pick
- ✅ **Amazon alias** — auto-detects from macOS username, confirms with you
- ✅ **Quip API token** — prompts for your token (get it from https://quip-amazon.com/dev/token)
- ✅ **AWS Bedrock API key** — optional, for Claude Sonnet AI on WBR/Team Health pages
- ✅ **SIM/Taskei goals folder** — paste your Taskei URL to enable Team Health tracking
- ✅ **Org tree fetch** — auto-fetches your team hierarchy from Phonetool

**Post-install:**
- ✅ Desktop shortcut
- ✅ Health verification (native modules, startup checks)
- ✅ **Resume support** — if install fails, re-run and it picks up where it left off

> **All settings are collected interactively during installation.** You can skip any optional setting and configure it later from the Settings page (http://localhost:3000/settings).

### Launch

Double-click **"InGen"** on your Desktop, then open **http://localhost:3000**

---

## First-Time Launch

### Allow macOS Permissions

When InGen starts for the first time, macOS will show a dialog:
> *"Terminal wants to control Microsoft Outlook"*

Click **OK** to allow. This only happens once. InGen uses AppleScript to read your local Outlook data — no internet connection is needed.

> **Note:** The installer already configured your calendar, Amazon alias, Quip token, Bedrock key, and SIM goals folder during installation. If you need to change any of these later, go to **http://localhost:3000/settings**.

---

## Features

### 📊 AI Daily Briefing
AI-generated executive summary of your day — top priorities, urgent emails, key meetings, and linked Quip documents. Streams word-by-word (ChatGPT-style) on first generation, then cached for instant loads. Dashboard shows today's email count, urgent count, and meeting count.

### 📧 Email Triage
Emails organized into priority swim lanes: 🔴 Respond Now, 🟡 Respond Today, 🟢 FYI. Filter by date range (Today, 7/14/30 days) with pagination.

### 📅 Week Ahead
7-day calendar view with meeting load indicators, deep work slots, 1:1 detection, and AI coaching brief.

### 💬 Dive Deep Chat
ChatGPT-style AI chat that searches your email and calendar data (RAG). Ask questions like "What did I discuss with Surbhi last week?" with cited sources.

### 📝 Smart Draft Replies
AI-generated email drafts that mimic your writing style using past sent emails (RAG). References Quip documents when linked.

### 📊 Leadership Analytics
Time audit, relationship health scores, action item extraction, blocker detection, and decision tracking.

### 🔔 Proactive Insights
AI-generated meeting prep insights, email priority alerts, and weekly reports delivered as toast notifications.

### 🏥 Team Health (WBR Goals)
Weekly Business Review dashboard showing goal status across your org. Features:

- **Dynamic WBR title** — Shows "Classification and Policy Platform - 2026 Goals and Projects Status" with current week and date range
- **AI Goal Health Summary** — Bedrock-powered (Claude Sonnet) executive summary with Ollama fallback; goal classification (On Track, Needs Attention, Completed, Stale)
- **Status color cards** — Green/Yellow/Red/Total at a glance
- **ECD tracking** — Missed ECDs, upcoming ECDs (3-day warning), ECD drift detection with slipped/pulled-in comparison
- **Deep scan** — On-demand recursive scan (depth-3) for missed ECDs in child/grandchild tasks
- **Goal sections** — Goals organized by workflow status (Started, Blocked, In Planning, etc.)
- **Child task expansion** — Drill down into subtasks with recursive expand
- **Stale announcement detection** — Announcements older than threshold (default 6 days) highlighted amber with ⚠️
- **Smart goal discovery** — TaskeiListTasks with pagination + gap-fill (replaces prefix enumeration), sequential fetch with throttle handling and retry

**Data flow:** Taskei (SIM) via `builder-mcp` (`TaskeiListTasks` + `TaskeiGetTask`) → `wbr-report.js` (goal parsing + ECD snapshots) → React dashboard

### 📊 Engineering Metrics (Code Metrics)
Per-engineer code review dashboard powered by `code.amazon.com` via `builder-mcp`. Features:

- **Org-level summary** — Total CRs created/reviewed, P50 turnaround, stale CRs
- **Engineer table** — Sortable by CRs Created, CRs Reviewed, Review Ratio (click headers to sort)
- **Week-over-week trends** — ▲/▼ delta indicators per engineer vs last week
- **3-week declining streak** — Amber row highlighting for engineers with 3 consecutive weeks of declining output
- **Mini sparklines** — 8-week CR creation trend per engineer
- **Weekly velocity chart** — Horizontal bar chart showing CR created vs reviewed over 8 weeks
- **Year-to-date trend** — Full year line chart with 4-week rolling average
- **Stale CR alerts** — Org-wide count of CRs open >5 days
- **Engineer drill-down** — Slide-out panel with 12-week history and recent CRs
- **CR detail enrichment** — Full titles, descriptions, and human comments fetched from code.amazon.com (bot comments filtered out)
- **Heatmap visualization** — Larger cells, wider engineer names, bigger sparklines with smart tooltip positioning
- **Backfill** — One-click backfill for historical weekly data (52-week retention) with CR enrichment pass

**Data flow:** Org roster (Phonetool → `org-store.js`) → per-engineer code search (`builder-mcp` → `ReadInternalWebsites`) → CR enrichment (titles + comments) → SQLite weekly snapshots (`data/eng-metrics.db`) → React dashboard

### 🎫 Ticket Health
Resolver group ticket dashboard showing open/aging/SLA status across your teams. Features:

- **Summary cards** — Total open, assigned to you, aging >14d, aging >30d, resolved (30d), baseline overdue
- **Status distribution** — Visual bar showing ticket status breakdown
- **Resolver group table** — Role, open count, resolved, status breakdown, oldest ticket age, baseline status
- **Aging tickets tab** — Tickets older than 7 days sorted by age
- **My tickets tab** — Tickets assigned to you across all resolver groups
- **Group detail panel** — Slide-out showing all tickets for a specific resolver group

**Data flow:** `builder-mcp` → `TicketingReadActions` → `ticket-health.js` (caching) → React dashboard

### 🌗 Dark/Light Theme
Toggle between dark and light mode from the sidebar or Settings page. Preference persists in localStorage with anti-flash script for instant theme application on page load.

### 📐 Collapsible Sidebar
Sidebar collapses to icon-only mode (72px) for more content space. State persists in localStorage. Expand/collapse via button at bottom of sidebar.

---

## Architecture

```
Outlook (local) → AppleScript → Local Data Store (JSON)
                                        ↓
                                  Vector Store (HNSWLib)
                                        ↓
                                    AI Engine (Ollama qwen3)
                                        ↓
                                  Dashboard (Next.js React)
```

All processing happens locally. No data leaves your machine.

| Component | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Liquid Glass UI |
| AI/LLM | Ollama (qwen3:latest, 8.2B params); optional Amazon Bedrock (Claude Sonnet) for WBR summaries + key page chats |
| Embeddings | qwen3-embedding (4096 dimensions) |
| Vector DB | hnswlib-node (local, in-process) |
| Data Bridge | AppleScript/JXA → local JSON cache |
| Background | node-cron (hourly sync) |
| MCP Integration | `builder-mcp` for Phonetool, code.amazon.com, Taskei, Quip |
| Data Storage | JSON files + SQLite (eng-metrics, issues, org-store, insights) |

---

## Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | AI briefing, email triage, meeting prep, AI chat |
| `/week-ahead` | Week Ahead | 7-day calendar with AI coaching |
| `/leadership` | Leadership | Time audit, relationships, action items, blockers |
| `/my-team` | Team Health | WBR goal status with AI summary |
| `/eng-metrics` | Code Metrics | Per-engineer CR dashboard |
| `/ticket-health` | Ticket Health | Resolver group ticket dashboard |
| `/wbr-prep` | WBR Prep | Weekly Business Review preparation document |
| `/insights/analytics` | Insights | Proactive AI insight analytics |
| `/settings` | Settings | Calendar, alias, Quip, WBR config, org sync, AI temperature, Bedrock, theme |

---

## Manage InGen

### Update to Latest Version
```bash
~/InGen/scripts/update-ingen.sh
```

### Uninstall
```bash
~/InGen/scripts/uninstall-ingen.sh
```

The updater (v2.0):
- Pulls latest code, rebuilds native modules
- Updates MCP tooling (`amzn-mcp`, `builder-mcp`) via Toolbox
- Clears Next.js cache and stale databases

The uninstaller (v2.0):
- Prompts before deleting anything
- Removes `~/InGen/`, Desktop shortcut, and install progress file
- Does NOT remove Node.js, Ollama, AI models, MCP tools, or Quip token
- Tells you how to reclaim disk space (~10 GB for models)

### Rebuild Distribution Package (for developers)
```bash
bash scripts/package-ingen.sh
```
Creates `~/Desktop/InGen.tar.gz` (< 3 MB) ready to share via Slack. The packager (v2.0) auto-cleans `settings.json` of user-specific values before archiving, then restores your local settings.

---

## Troubleshooting

### App won't start
- Ensure Ollama is running: `ollama serve`
- Check Node.js version: `node -v` (needs 20+)
- Check logs: `cat ~/InGen/smartai.log`

### Calendar shows 0 events
- Verify calendar ID in Settings (http://localhost:3000/settings) or `config/settings.json`
- Ensure Outlook is open and signed in (Classic Outlook required — New Outlook does not support AppleScript)
- Re-run the installer to re-select your calendar: `bash ~/InGen/scripts/install-ingen.sh`

### AI briefing takes too long
- First briefing after restart takes 30-60 seconds (Ollama model loading)
- Subsequent briefings are cached for 30 minutes
- Check if Ollama is running: `curl http://127.0.0.1:11434/api/tags`

### Quip documents not loading
- Verify your token: `cat ~/.amazon-internal-mcp-server/.env`
- Ensure `amzn-mcp` is installed: `which amzn-mcp` or `~/.toolbox/bin/amzn-mcp --version`
- Disable Quip in Settings if you don't need it

### High battery/CPU usage
- InGen syncs from Outlook every 60 minutes (battery-optimized)
- Ollama model unloads after 2 minutes of idle
- For maximum battery savings, stop InGen when not in use

---

## Privacy & Security

- **Local-first** — All core AI runs locally via Ollama; email and calendar data never leave your MacBook
- **Optional Bedrock** — If configured, WBR summaries and key page chats use Amazon Bedrock (Claude Sonnet) over your corporate AWS credentials. No data is sent to third parties.
- **No accounts** — No sign-ups, no subscriptions
- **No telemetry** — Zero tracking or analytics
- **Your data stays yours** — Emails, calendar, and AI responses are stored only in `~/InGen/data/`

---

## License

Internal Amazon tool — See company policies for usage guidelines.