/**
 * Outlook MCP Service — works on Mac, Windows, and AgentSpaces
 *
 * Wraps the `aws-outlook-mcp` MCP server to provide the same interface as
 * `outlook-local.js` (AppleScript) and `outlook-windows.js` (PowerShell).
 *
 * Install: aim mcp install aws-outlook-mcp
 * Docs:    https://code.amazon.com/packages/AWSOutlookMCP
 *
 * aws-outlook-mcp tool names (v0.3.1):
 *   email_inbox, email_read, email_send, email_reply, email_forward,
 *   email_search, email_folders, email_draft, email_attachments,
 *   email_contacts, email_move, email_categories, email_update,
 *   email_list_folders, calendar_view, calendar_meeting,
 *   calendar_availability, calendar_room_booking, calendar_search,
 *   calendar_shared_list, todo_lists, todo_tasks, todo_checklist
 *
 * Response envelope (double-wrapped):
 *   MCP result.content[0].text  →  JSON.parse  →  outer.content[0].text
 *   →  JSON.parse  →  { success, content: { emails/events/... } }
 */

const mcpClient = require('./mcp-client');
const logger = require('./logger').child('Outlook-MCP');

const SERVER = 'aws-outlook-mcp';

// ─── Email ────────────────────────────────────────────────────────────────────

/**
 * Fetch emails via aws-outlook-mcp.
 * Returns normalized email objects matching the outlook-local.js format.
 */
async function fetchOutlookEmails(count = 20) {
    logger.info(`[MCP] Fetching ${count} emails via ${SERVER}`);
    try {
        const result = await mcpClient.callTool(SERVER, 'email_inbox', {
            maxResults: count,
        });

        const data = extractContent(result);
        const emails = data?.emails || data?.value || (Array.isArray(data) ? data : []);

        return emails.map(normalizeEmail).filter(Boolean);
    } catch (error) {
        logger.error('Failed to fetch emails via MCP:', error.message);
        return [{
            id: 'mcp-error',
            source: 'outlook',
            from: { name: 'System', email: 'error' },
            subject: `MCP email fetch failed: ${error.message}`,
            snippet: 'aws-outlook-mcp may not be installed or configured.',
            body: '',
            date: new Date().toISOString(),
            labels: [],
        }];
    }
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

/**
 * Fetch calendar events via aws-outlook-mcp.
 * Returns normalized event objects matching the outlook-local.js format.
 */
async function fetchOutlookCalendar(calendarId, lookbackDays = 30, forwardDays = 3) {
    logger.info(`[MCP] Fetching calendar events via ${SERVER} (${lookbackDays}d back, ${forwardDays}d forward)`);
    try {
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - lookbackDays);
        const end = new Date(now);
        end.setDate(end.getDate() + forwardDays);

        const result = await mcpClient.callTool(SERVER, 'calendar_view', {
            start_date: start.toISOString(),
            end_date: end.toISOString(),
            max_results: 100,
        });

        const data = extractContent(result);
        const events = data?.events || data?.value || (Array.isArray(data) ? data : []);

        const normalized = events.map(normalizeCalendarEvent).filter(Boolean);

        // Deduplicate by title + startTime
        const seen = new Set();
        return normalized.filter(evt => {
            const key = `${evt.title}_${evt.startTime}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    } catch (error) {
        logger.error('Failed to fetch calendar via MCP:', error.message);
        return [];
    }
}

/**
 * Clear calendar cache (no-op for MCP — no local cache maintained).
 */
function clearCalendarCache() {
    // MCP calls are stateless; nothing to clear
}

/**
 * Get list of available calendars via aws-outlook-mcp.
 */
async function getCalendarList() {
    logger.info(`[MCP] Fetching calendar list via ${SERVER}`);
    try {
        const result = await mcpClient.callTool(SERVER, 'calendar_shared_list', {});
        const data = extractContent(result);
        const calendars = data?.calendars || data?.value || (Array.isArray(data) ? data : []);
        return calendars.map(c => ({
            id: c.id || c.calendarId || '',
            name: c.name || c.displayName || 'Unknown',
        }));
    } catch (error) {
        logger.error('Failed to get calendar list via MCP:', error.message);
        return [];
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the actual data payload from an aws-outlook-mcp response.
 *
 * The response is double-wrapped:
 *   result  (MCP SDK CallToolResult)
 *     .content[0].text  →  JSON string  →  outer
 *       outer.content[0].text  →  JSON string  →  inner
 *         inner.content  →  { emails: [...] }  or  { events: [...] }  etc.
 *
 * Falls back gracefully at each layer.
 */
function extractContent(result) {
    if (!result) return null;

    try {
        // Layer 1: MCP SDK envelope  {content: [{type:'text', text:'...'}]}
        let text1 = null;
        if (result.content && Array.isArray(result.content)) {
            for (const item of result.content) {
                if (item.type === 'text' && item.text) { text1 = item.text; break; }
            }
        } else if (typeof result === 'string') {
            text1 = result;
        }

        if (!text1) return result;

        const outer = JSON.parse(text1);

        // Layer 2: aws-outlook-mcp may itself be an MCP relay wrapping another envelope
        if (outer.content && Array.isArray(outer.content)) {
            for (const item of outer.content) {
                if (item.type === 'text' && item.text) {
                    try {
                        const inner = JSON.parse(item.text);
                        // inner = { success: true, content: { emails: [...] } }
                        if (inner.content && typeof inner.content === 'object' && !Array.isArray(inner.content)) {
                            return inner.content;
                        }
                        // aws-outlook-mcp v0.3.1 returns a numeric-keyed object for calendar_view
                        // e.g. { '0': {...event}, '1': {...event} } — convert to array
                        if (typeof inner === 'object' && !Array.isArray(inner) && Object.keys(inner).every(k => !isNaN(k))) {
                            return Object.values(inner);
                        }
                        return inner;
                    } catch {
                        return item.text;
                    }
                }
            }
        }

        // outer itself is the payload (some tool versions return unwrapped)
        if (outer.success && outer.content) return outer.content;
        // outer is a numeric-keyed object — convert to array
        if (typeof outer === 'object' && !Array.isArray(outer) && Object.keys(outer).every(k => !isNaN(k))) {
            return Object.values(outer);
        }
        return outer;
    } catch {
        return result;
    }
}

/**
 * Normalize a raw aws-outlook-mcp inbox conversation/email object to InGen's internal format.
 *
 * email_inbox returns conversation objects:
 *   { conversationId, topic, senders[], lastDeliveryTime, preview, unreadCount, hasAttachments }
 * email_read returns full message objects:
 *   { id, subject, from, toRecipients, ccRecipients, body, receivedDateTime, isRead, ... }
 */
function normalizeEmail(raw) {
    if (!raw) return null;
    try {
        // email_inbox returns conversations; email_read returns full messages
        const isConversation = raw.topic !== undefined || raw.senders !== undefined;

        const subject = raw.subject || raw.topic || '(No Subject)';
        const dateStr = raw.receivedDateTime || raw.lastDeliveryTime || raw.date || new Date().toISOString();
        const isUnread = isConversation
            ? (raw.unreadCount > 0)
            : (raw.isRead === false || raw.isUnread === true);

        // Senders can be a string array (conversation) or email address object (message)
        let from = { name: 'Unknown', email: '' };
        if (isConversation && Array.isArray(raw.senders) && raw.senders.length > 0) {
            from = { name: raw.senders[0], email: '' };
        } else if (raw.from) {
            from = parseAddress(raw.from?.emailAddress || raw.from);
        } else if (raw.sender) {
            from = parseAddress(raw.sender);
        }

        const toRecipients = (raw.toRecipients || raw.to || []).map(r =>
            parseAddress(r.emailAddress || r)
        );
        const ccRecipients = (raw.ccRecipients || raw.cc || []).map(r =>
            parseAddress(r.emailAddress || r)
        );

        // Determine folder — try explicit field, fallback to isSent heuristic
        const folder = raw.parentFolderName || raw.folder ||
            (raw.isSent ? 'Sent Items' : 'Inbox');

        // Importance label
        const importance = raw.importance || 'normal';
        const labels = importance === 'high' ? ['important'] : [];

        return {
            id:             raw.id || raw.messageId || raw.conversationId || String(Math.random()),
            source:         'outlook',
            subject,
            snippet:        raw.bodyPreview || raw.preview || raw.snippet || '',
            body:           raw.body?.content || raw.bodyContent || raw.bodyPreview || raw.preview || '',
            date:           dateStr,
            isUnread,
            labels,
            importance,
            isSent:         raw.isSent || false,
            folder,
            from,
            to:             toRecipients,
            cc:             ccRecipients,
            conversationId: raw.conversationId || raw.id || '',
            hasAttachments: raw.hasAttachments || false,
        };
    } catch (e) {
        logger.warn('Failed to normalize email:', e.message);
        return null;
    }
}

/**
 * Normalize a raw aws-outlook-mcp calendar event to InGen's internal format.
 *
 * aws-outlook-mcp v0.3.1 calendar_view returns:
 *   { meetingId, subject, start (ISO string), end (ISO string), location (string),
 *     status ('Free'|'Busy'|'Tentative'|...), organizer: {name, email},
 *     isAllDay, isCanceled, isRecurring, response, categories, attendees? }
 */
function normalizeCalendarEvent(raw) {
    if (!raw) return null;
    try {
        // startTime: prefer nested dateTime, then plain string fields
        const startTime = raw.start?.dateTime || raw.startDateTime || raw.startTime ||
            (typeof raw.start === 'string' ? raw.start : null) || new Date().toISOString();
        const endTime = raw.end?.dateTime || raw.endDateTime || raw.endTime ||
            (typeof raw.end === 'string' ? raw.end : null) || new Date().toISOString();

        // busyStatus: aws-outlook-mcp uses 'status' field with values like 'Free', 'Busy'
        const busyStatus = (raw.showAs || raw.busyStatus || raw.status || 'busy').toLowerCase();

        // attendees: may be absent in calendar_view; normalize if present
        const attendees = (raw.attendees || raw.requiredAttendees || []).map(a => ({
            name: a.emailAddress?.name || a.name || '',
            email: a.emailAddress?.address || a.email || '',
        }));

        // organizer: aws-outlook-mcp returns { name, email } directly (not nested in emailAddress)
        const organizer = {
            name: raw.organizer?.emailAddress?.name || raw.organizer?.name || '',
            email: raw.organizer?.emailAddress?.address || raw.organizer?.email || '',
        };

        return {
            id: raw.meetingId || raw.id || raw.eventId || String(Math.random()),
            title: raw.subject || raw.title || 'Untitled',
            startTime,
            endTime,
            location: raw.location?.displayName || (typeof raw.location === 'string' ? raw.location : '') || '',
            description: raw.bodyPreview || raw.description || '',
            busyStatus,
            isAllDay: raw.isAllDay || false,
            isCanceled: raw.isCanceled || raw.isCancelled || false,
            isRecurring: raw.isRecurring || false,
            attendees,
            organizer,
            source: 'outlook-mcp',
        };
    } catch (e) {
        logger.warn('Failed to normalize calendar event:', e.message);
        return null;
    }
}

/**
 * Parse an address from various aws-outlook-mcp formats.
 */
function parseAddress(addr) {
    if (!addr) return { name: 'Unknown', email: '' };
    if (typeof addr === 'string') {
        const match = addr.match(/^(.*?)\s*<(.+)>$/);
        if (match) return { name: match[1].trim(), email: match[2] };
        return { name: addr, email: addr.includes('@') ? addr : '' };
    }
    return {
        name: addr.name || addr.displayName || '',
        email: addr.address || addr.email || '',
    };
}

// ─── Thread & Sent Mail ───────────────────────────────────────────────────────

/**
 * Fetch the full thread for a given conversation or message ID.
 * Returns an array of normalized email objects (all messages in the thread).
 *
 * Used by: richer thread summarization, follow-up detection.
 */
async function fetchEmailThread(messageOrConversationId) {
    logger.info(`[MCP] Fetching thread for ${messageOrConversationId}`);
    try {
        const result = await mcpClient.callTool(SERVER, 'email_read', {
            message_id: messageOrConversationId,
        });
        const data = extractContent(result);
        // email_read may return a single message or an array of messages
        const messages = data?.messages || data?.value ||
            (Array.isArray(data) ? data : (data ? [data] : []));
        return messages.map(normalizeEmail).filter(Boolean);
    } catch (error) {
        logger.error(`Failed to fetch thread ${messageOrConversationId}:`, error.message);
        return [];
    }
}

/**
 * Fetch sent emails from the Sent Items folder.
 * Used by follow-up detection to find sent emails with no reply.
 *
 * @param {number} count     - Max emails to fetch (default 50)
 * @param {number} daysBack  - How many days back to search (default 14)
 */
async function fetchSentEmails(count = 50, daysBack = 14) {
    logger.info(`[MCP] Fetching ${count} sent emails (${daysBack}d back) via ${SERVER}`);
    try {
        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        const result = await mcpClient.callTool(SERVER, 'email_search', {
            folder: 'Sent Items',
            maxResults: count,
            after: since.toISOString(),
        });
        const data = extractContent(result);
        const emails = data?.emails || data?.value || (Array.isArray(data) ? data : []);
        return emails.map(e => normalizeEmail({ ...e, isSent: true, folder: 'Sent Items' })).filter(Boolean);
    } catch (error) {
        logger.error('Failed to fetch sent emails via MCP:', error.message);
        return [];
    }
}

// ─── In-memory inbox cache (5-minute TTL) ────────────────────────────────────

let _inboxCache = null;
let _inboxCachedAt = 0;
const INBOX_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch inbox with TTL caching — avoids redundant MCP calls within 5 minutes.
 */
async function fetchOutlookEmailsCached(count = 20) {
    const now = Date.now();
    if (_inboxCache && (now - _inboxCachedAt) < INBOX_CACHE_TTL_MS) {
        logger.info(`[MCP] Returning cached inbox (${Math.round((now - _inboxCachedAt) / 1000)}s old)`);
        return _inboxCache;
    }
    const emails = await fetchOutlookEmails(count);
    _inboxCache = emails;
    _inboxCachedAt = now;
    return emails;
}

function clearInboxCache() {
    _inboxCache = null;
    _inboxCachedAt = 0;
}

module.exports = {
    fetchOutlookEmails,
    fetchOutlookEmailsCached,
    fetchEmailThread,
    fetchSentEmails,
    fetchOutlookCalendar,
    clearCalendarCache,
    clearInboxCache,
    getCalendarList,
    normalizeEmail,
};
