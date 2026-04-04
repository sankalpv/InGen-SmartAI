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

        // DEBUG: Log raw MCP response to diagnose v0.3.2 empty results
        const rawText = result?.content?.[0]?.text || '';
        logger.info(`[MCP] calendar_view raw response (first 500 chars): ${rawText.substring(0, 500)}`);

        const data = extractContent(result);
        logger.info(`[MCP] calendar_view extracted data type=${typeof data}, isArray=${Array.isArray(data)}, keys=${data ? Object.keys(data).slice(0, 10).join(',') : 'null'}`);

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

        // aws-outlook-mcp v0.3.2+ wraps responses in <untrusted_content_*> XML tags
        // for prompt injection protection — strip them before parsing
        text1 = text1.replace(/<\/?untrusted_content_[a-f0-9]+>/gi, '').trim();

        let outer;
        try {
            outer = JSON.parse(text1);
        } catch (parseErr) {
            // Aggressive fallback: extract first JSON array [...] or object {...} from text
            const arrMatch = text1.match(/(\[[\s\S]*\])/);
            const objMatch = text1.match(/(\{[\s\S]*\})/);
            if (arrMatch) {
                try { outer = JSON.parse(arrMatch[1]); } catch { /* */ }
            }
            if (!outer && objMatch) {
                try { outer = JSON.parse(objMatch[1]); } catch { /* */ }
            }
            if (!outer) {
                logger.warn(`extractContent: JSON parse failed after tag strip: ${parseErr.message}, text starts with: ${text1.substring(0, 100)}`);
                return result;
            }
        }

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
/**
 * Decode a raw MIME email body to plain text.
 * Handles:
 *  - multipart/mixed and multipart/alternative MIME envelopes
 *  - base64 Content-Transfer-Encoding parts
 *  - quoted-printable Content-Transfer-Encoding
 *  - plain HTML (strips tags)
 *  - already-plain text (passthrough)
 */
function decodeMimeBody(raw) {
    if (!raw) return '';

    // Not a MIME message — return as-is
    if (!raw.includes('Content-Type:') && !raw.includes('--=')) return raw;

    try {
        // Extract all MIME parts recursively
        const parts = [];
        const partRegex = /Content-Type:\s*(text\/(?:plain|html))[^\n]*\n(?:Content-Transfer-Encoding:\s*(\S+)\s*\n)?(?:[^\n]+\n)*?\n([\s\S]*?)(?=--=|\z)/gim;
        let match;
        while ((match = partRegex.exec(raw)) !== null) {
            const mimeType = match[1].toLowerCase();
            const encoding = (match[2] || 'plain').toLowerCase().trim();
            let content = match[3] || '';

            if (encoding === 'base64') {
                // Remove whitespace/line breaks from base64 blob
                const b64 = content.replace(/\s+/g, '');
                try {
                    content = Buffer.from(b64, 'base64').toString('utf8');
                } catch { content = ''; }
            } else if (encoding === 'quoted-printable') {
                content = content
                    .replace(/=\r?\n/g, '')          // soft line breaks
                    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
            }

            // Strip HTML tags for html parts
            if (mimeType === 'text/html') {
                content = content
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/p>/gi, '\n')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&nbsp;/gi, ' ')
                    .replace(/&amp;/gi, '&')
                    .replace(/&lt;/gi, '<')
                    .replace(/&gt;/gi, '>')
                    .replace(/&quot;/gi, '"')
                    .replace(/&#39;/gi, "'");
            }

            content = content.trim();
            if (content) parts.push({ mimeType, content });
        }

        // Prefer plain text; fall back to html
        const plainPart = parts.find(p => p.mimeType === 'text/plain');
        const htmlPart = parts.find(p => p.mimeType === 'text/html');
        const chosen = (plainPart || htmlPart);
        if (chosen) return chosen.content;

        // Fallback: try decoding the whole thing as base64 if it looks like one big blob
        const stripped = raw.replace(/\s+/g, '');
        if (/^[A-Za-z0-9+/]+=*$/.test(stripped) && stripped.length > 40) {
            try { return Buffer.from(stripped, 'base64').toString('utf8'); } catch { /* */ }
        }
    } catch (e) { /* ignore — return original */ }

    return raw;
}

/**
 * Strip HTML tags from a string to get plain text.
 * Used for email_read responses which return raw HTML body strings.
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeEmail(raw) {
    if (!raw) return null;
    try {
        // email_inbox returns conversations; email_read returns full messages
        // email_read uses different field names: itemId, recievedAt, recipients, sender
        const isConversation = raw.topic !== undefined || raw.senders !== undefined;
        const isEmailRead = raw.itemId !== undefined; // email_read specific field

        const subject = raw.subject || raw.topic || '(No Subject)';
        const dateStr = raw.receivedDateTime || raw.recievedAt || raw.lastDeliveryTime || raw.date || new Date().toISOString();
        const isUnread = isConversation
            ? (raw.unreadCount > 0)
            : (raw.isRead === false || raw.isUnread === true);

        // Senders: conversation (senders[]), email_read (sender/from obj), or standard (from obj)
        let from = { name: 'Unknown', email: '' };
        if (isConversation && Array.isArray(raw.senders) && raw.senders.length > 0) {
            from = { name: raw.senders[0], email: '' };
        } else if (raw.from) {
            from = parseAddress(raw.from?.emailAddress || raw.from);
        } else if (raw.sender) {
            from = parseAddress(raw.sender);
        }

        // Recipients: email_read uses 'recipients', others use 'toRecipients'/'to'
        const toRecipients = (raw.toRecipients || raw.recipients || raw.to || []).map(r =>
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

        // Body extraction:
        // - email_read: body is a raw HTML string directly on raw.body
        // - email_inbox: body.content (nested object) or bodyPreview
        let bodyRaw = '';
        if (typeof raw.body === 'string') {
            // email_read returns body as raw HTML string — strip tags
            bodyRaw = raw.body.trim().startsWith('<') ? stripHtml(raw.body) : raw.body;
        } else {
            bodyRaw = raw.body?.content || raw.bodyContent || raw.bodyPreview || raw.preview || '';
            bodyRaw = decodeMimeBody(bodyRaw);
        }

        return {
            id:             raw.id || raw.itemId || raw.messageId || raw.conversationId || String(Math.random()),
            source:         'outlook',
            subject,
            snippet:        raw.bodyPreview || raw.preview || raw.snippet || (bodyRaw ? bodyRaw.substring(0, 200) : ''),
            body:           bodyRaw,
            date:           dateStr,
            isUnread,
            labels,
            importance,
            isSent:         raw.isSent || false,
            folder,
            from,
            to:             toRecipients,
            cc:             ccRecipients,
            conversationId: raw.conversationId || raw.id || raw.itemId || '',
            hasAttachments: raw.hasAttachments || (Array.isArray(raw.attachments) && raw.attachments.length > 0) || false,
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
            query: '*',           // required field — fetch all recent sent emails
            folder: 'sentitems', // enum value (not "Sent Items")
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

/**
 * Fetch emails via aws-outlook-mcp, then hydrate each result with full body
 * via email_read. This is necessary because email_inbox only returns
 * bodyPreview (255 char MS Graph limit) — email_read gives the full body.
 *
 * Used by the background sync to ensure full email bodies are stored locally.
 *
 * @param {number} count   - Max emails to fetch (default 20)
 * @returns {Array}        - Normalized email objects with full body
 */
async function fetchOutlookEmailsHydrated(count = 20) {
    logger.info(`[MCP] Fetching ${count} emails with full body hydration via ${SERVER}`);
    try {
        // Step 1: Get inbox listing (bodyPreview only)
        const emails = await fetchOutlookEmails(count);
        if (!emails || emails.length === 0) return emails;

        // Step 2: Hydrate each email with full body via email_read (batches of 5)
        // email_read requires conversationId (not message_id) for aws-outlook-mcp
        const BATCH = 5;
        const hydrated = [];
        for (let i = 0; i < emails.length; i += BATCH) {
            const batch = emails.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(async (e) => {
                // Use conversationId if available, fall back to id
                const convId = e.conversationId || e.id;
                if (!convId || convId === 'mcp-error') return e;
                try {
                    const readResult = await mcpClient.callTool(SERVER, 'email_read', {
                        conversationId: convId,
                    });
                    const readData = extractContent(readResult);
                    // email_read returns { message: "...", emails: [{...}] }
                    const msgs = readData?.emails || readData?.messages || readData?.value ||
                        (Array.isArray(readData) ? readData : (readData ? [readData] : []));
                    const fullMsg = msgs[0] || readData;
                    if (fullMsg && (fullMsg.body || fullMsg.subject || fullMsg.itemId)) {
                        const normalized = normalizeEmail(fullMsg);
                        if (normalized) return normalized;
                    }
                } catch (err) {
                    logger.warn(`[MCP] email_read hydration failed for ${convId}: ${err.message}`);
                }
                return e; // fallback to bodyPreview version
            }));
            hydrated.push(...results);
        }

        const hydrationCount = hydrated.filter(e => e.body && e.body.length > 255).length;
        logger.info(`[MCP] Hydrated ${hydrationCount}/${hydrated.length} emails with full body`);
        return hydrated.filter(Boolean);
    } catch (error) {
        logger.error('Failed to fetch hydrated emails via MCP:', error.message);
        return fetchOutlookEmails(count); // fallback to non-hydrated
    }
}

/**
 * Search emails via aws-outlook-mcp email_search, then hydrate each result
 * with full body via email_read. This is the correct way to get complete
 * email content — email_inbox only returns bodyPreview (255 char MS Graph limit).
 *
 * @param {string} query   - Search keyword (subject, sender, content)
 * @param {number} limit   - Max results to return (default: 10)
 * @returns {Array}        - Normalized email objects with full body
 */
async function searchOutlookEmails(query, limit = 10) {
    logger.info(`[MCP] Searching emails for "${query}" (limit ${limit})`);
    try {
        // Step 1: Search for matching messages
        const searchResult = await mcpClient.callTool(SERVER, 'email_search', {
            query,
            maxResults: limit,
        });
        const data = extractContent(searchResult);
        const emails = data?.emails || data?.value || data?.messages || (Array.isArray(data) ? data : []);

        if (emails.length === 0) {
            logger.info(`[MCP] email_search returned 0 results for "${query}"`);
            return [];
        }

        // Step 2: For each result, call email_read to get full body
        const hydrated = await Promise.all(emails.slice(0, limit).map(async (e) => {
            const msgId = e.id || e.messageId;
            if (!msgId) return normalizeEmail(e); // fallback: use search result as-is

            try {
                const readResult = await mcpClient.callTool(SERVER, 'email_read', {
                    message_id: msgId,
                });
                const readData = extractContent(readResult);
                // email_read may return array or single message
                const msgs = readData?.messages || readData?.value ||
                    (Array.isArray(readData) ? readData : (readData ? [readData] : []));
                const fullMsg = msgs[0] || readData;
                if (fullMsg && (fullMsg.body || fullMsg.subject)) {
                    return normalizeEmail(fullMsg);
                }
            } catch (err) {
                logger.warn(`[MCP] email_read failed for ${msgId}: ${err.message}`);
            }
            // Fallback: use the search result (has bodyPreview only)
            return normalizeEmail(e);
        }));

        return hydrated.filter(Boolean);
    } catch (error) {
        logger.error(`Failed to search emails via MCP for "${query}":`, error.message);
        return [];
    }
}

module.exports = {
    fetchOutlookEmails,
    fetchOutlookEmailsCached,
    fetchOutlookEmailsHydrated,
    fetchEmailThread,
    fetchSentEmails,
    searchOutlookEmails,
    fetchOutlookCalendar,
    clearCalendarCache,
    clearInboxCache,
    getCalendarList,
    normalizeEmail,
};
