---
inclusion: auto
---

# Email Data Flow — InGen SmartAI

## Data Sources

### 1. MCP `email_inbox` (Primary — via aws-outlook-mcp)
- Called with `limit` parameter (not `maxResults` — MCP ignores maxResults)
- Returns emails with **full body text** (typically 5K-30K chars per email)
- Body is decoded from MIME/multipart on the server side (`normalizeEmail()` in outlook-mcp.js)
- VML/CSS artifacts are stripped server-side
- Returns: `{ id, from, subject, date, body, conversationId, ... }`

### 2. MCP `email_read` (Thread view — per conversationId)
- Returns individual messages (ConversationNodes) for a conversation thread
- ⚠️ May return 0 messages for some emails due to Exchange ConversationNode bugs
- When successful: returns per-message `{ sender, body, receivedAt }` objects
- Called on-demand when user expands an email card

### 3. Cache: `data/emails.json`
- **Format**: `{ updatedAt: ISO_DATE, count: NUMBER, data: [...emails] }`
- Emails are in `.data` array, NOT at root level
- Each email has full body text (NOT a 255-char preview — that was a past misconception)
- Typical body sizes: 0 chars (notifications), 5K-30K chars (conversations)
- Cache is rebuilt by `/api/outlook-local` route (merge strategy: keeps existing + adds new)

## Frontend Email Card (components/EmailCard.js)

### What the user sees:
1. **Collapsed**: sender, subject, category badge, time ago
2. **Expanded**: Thread messages (from `email_read`) OR fallback body (from cache)

### What AI features receive:

| Feature | Data Source | Content |
|---------|------------|---------|
| **Draft Reply** | Thread (if loaded) → fallback to `email.body` from cache | Full content, capped at 50K chars |
| **Ask a Question** | `email.body` from cache + thread if available | Full content |
| **Email Triage AI** | `email.body` from cache (during tagging) | Full content |

### Important Rules:
- `email.body` from cache IS the full body (5K-30K chars) — NOT a 255-char preview
- Thread content (from `email_read`) provides individual per-message bodies — cleaner for multi-party conversations
- Both Draft Reply and Ask Question should use thread content when available, with `email.body` as fallback
- Always cap content before sending to LLM: 4K per message, 50K total (prevents Claude input overflow)
- The `bodyHtml` field preserves raw HTML for iframe rendering — separate from the plain-text `body`

## API Route: `/api/outlook-local`
- Serves emails to dashboard
- Strategy: read cache first (instant), then fetch fresh from MCP in background, merge into cache
- Returns: `{ emails: [...] }` — the data array, not the cache wrapper

## API Route: `/api/email-thread`
- Fetches conversation thread via `email_read` MCP tool
- Filters out empty Exchange nodes (no sender AND no body)
- Returns: `{ success, messages: [...], total }`
