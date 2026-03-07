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

The installer automatically handles:
- ✅ Homebrew (if needed)
- ✅ Node.js 20+ (if needed)
- ✅ Ollama AI engine (if needed)
- ✅ AI models (~10 GB one-time download)
- ✅ Desktop shortcut

### Launch

Double-click **"InGen"** on your Desktop, then open **http://localhost:3000**

---

## First-Time Setup (After Install)

### Step 1: Allow macOS Permissions

When InGen starts for the first time, macOS will show a dialog:
> *"Terminal wants to control Microsoft Outlook"*

Click **OK** to allow. This only happens once. InGen uses AppleScript to read your local Outlook data — no internet connection is needed.

### Step 2: Select Your Calendar

The app needs to know which Outlook calendar to read. Find your calendar ID:

```bash
cd ~/InGen
node -e "const {getCalendarList} = require('./services/outlook-local'); getCalendarList().then(c => console.log(JSON.stringify(c, null, 2)))"
```

This prints a list like:
```json
[
  { "id": "123", "name": "Calendar", "isDefault": true },
  { "id": "456", "name": "Team Events", "isDefault": false }
]
```

Copy the `id` of your main calendar (usually "Calendar"), then edit:

```bash
nano ~/InGen/config/settings.json
```

Change this line:
```json
"outlookCalendarId": "YOUR_NUMBER_HERE"
```

Save and restart InGen.

### Step 3: Verify Your Phonetool Alias

1. Open http://localhost:3000/settings
2. Under **Team Settings**, verify your Phonetool alias is correct
3. Click **Save Alias & Fetch Team**

The installer auto-detects your alias from your macOS username, but some users' unix username differs from their Amazon alias.

### Step 4: Set Up Your Quip API Token

InGen can automatically read Quip documents linked in your emails and include them in AI briefings. Each user needs their own Quip API token.

1. Go to https://quip-amazon.com/dev/token
2. Click **Generate Token**
3. Copy the token
4. In Terminal, run:

```bash
mkdir -p ~/.amazon-internal-mcp-server
echo "QUIP_API_TOKEN=paste_your_token_here" > ~/.amazon-internal-mcp-server/.env
```

5. Restart InGen

**Don't use Quip?** Go to Settings → Document Context → uncheck **Enabled**.

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
- **AI Goal Health Summary** — Ollama-powered executive summary with goal classification (On Track, Needs Attention, Completed, Stale)
- **Status color cards** — Green/Yellow/Red/Total at a glance
- **ECD tracking** — Missed ECDs, upcoming ECDs (3-day warning), ECD drift detection with slipped/pulled-in comparison
- **Deep scan** — On-demand recursive scan (depth-3) for missed ECDs in child/grandchild tasks
- **Goal sections** — Goals organized by workflow status (Started, Blocked, In Planning, etc.)
- **Child task expansion** — Drill down into subtasks with recursive expand

**Data flow:** Taskei (SIM) via `builder-mcp` → `wbr-report.js` (goal parsing + ECD snapshots) → React dashboard

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
- **Backfill** — One-click backfill for historical weekly data (52-week retention)

**Data flow:** Org roster (Phonetool → `org-store.js`) → per-engineer code search (`builder-mcp` → `ReadInternalWebsites`) → SQLite weekly snapshots (`data/eng-metrics.db`) → React dashboard

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
| AI/LLM | Ollama (qwen3:latest, 8.2B params) |
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
| `/insights/analytics` | Insights | Proactive AI insight analytics |
| `/settings` | Settings | Calendar, alias, Quip, theme, AI preferences |

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

The uninstaller:
- Prompts before deleting anything
- Removes `~/InGen/` and Desktop shortcut
- Does NOT remove Node.js, Ollama, or AI models
- Tells you how to reclaim disk space (~10 GB for models)

### Rebuild Distribution Package (for developers)
```bash
bash scripts/package-ingen.sh
```
Creates `~/Desktop/InGen.tar.gz` (< 3 MB) ready to share via Slack.

---

## Troubleshooting

### App won't start
- Ensure Ollama is running: `ollama serve`
- Check Node.js version: `node -v` (needs 20+)
- Check logs: `cat ~/InGen/smartai.log`

### Calendar shows 0 events
- Verify calendar ID in `config/settings.json`
- Run the calendar list command from Step 2 above
- Ensure Outlook is open and signed in

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

- **100% local** — No data ever leaves your MacBook
- **No cloud APIs** — All AI runs locally via Ollama
- **No accounts** — No sign-ups, no subscriptions
- **No telemetry** — Zero tracking or analytics
- **Your data stays yours** — Emails, calendar, and AI responses are stored only in `~/InGen/data/`

---

## License

Internal Amazon tool — See company policies for usage guidelines.