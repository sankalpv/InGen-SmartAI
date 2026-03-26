/**
 * Outlook MCP Service — Hosted/AgentSpaces mode
 *
 * Wraps the `aws-outlook-mcp` MCP server to provide the same interface as
 * `outlook-local.js` (AppleScript) and `outlook-windows.js` (PowerShell).
 * Used automatically when deploymentMode === 'hosted' in config/settings.json.
 *
 * Install: aim mcp install aws-outlook-mcp
 * Docs:    https://specs.harmony.a2z.com/package/0a29d4b1-1d59-4b3e-b7de-79b052a31a1e
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const mcpClient = require('./mcp-client');
const logger = require('./logger').child('Outlook-MCP');

const SERVER = 'aws-outlook-mcp';

// ─── Email ────────────────────────────────────────────────────────────────────

/**
 * Fetch emails via aws-outlook-mcp.
 * Returns normalized email objects matching the outlook-local.js format.
 */
export async function fetchOutlookEmails(count = 20) {
    logger.info(`[MCP] Fetching ${count} emails via ${SERVER}`);
    try {
        const result = await mcpClient.callTool(SERVER, 'list_emails', {
            maxResults: count,
            folder: 'Inbox',
        });

        const raw = extractContent(result);
        const emails = Array.isArray(raw) ? raw : (raw?.emails || raw?.value || []);

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
export async function fetchOutlookCalendar(calendarId, lookbackDays = 30, forwardDays = 3) {
    logger.info(`[MCP] Fetching calendar events via ${SERVER} (${lookbackDays}d back, ${forwardDays}d forward)`);
    try {
        const now = new Date();
        const start = new Date(now);
        start.setDate(start.getDate() - lookbackDays);
        const end = new Date(now);
        end.setDate(end.getDate() + forwardDays);

        const result = await mcpClient.callTool(SERVER, 'list_calendar_events', {
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
            maxResults: 100,
        });

        const raw = extractContent(result);
        const events = Array.isArray(raw) ? raw : (raw?.events || raw?.value || []);

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
export function clearCalendarCache() {
    // MCP calls are stateless; nothing to clear
}

/**
 * Get list of available calendars via aws-outlook-mcp.
 */
export async function getCalendarList() {
    logger.info(`[MCP] Fetching calendar list via ${SERVER}`);
    try {
        const result = await mcpClient.callTool(SERVER, 'list_calendars', {});
        const raw = extractContent(result);
        const calendars = Array.isArray(raw) ? raw : (raw?.calendars || raw?.value || []);
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
 * Extract content from MCP tool result (handles both direct arrays and
 * the {content: [{type:'text', text:'...'}]} envelope from the MCP SDK).
 */
function extractContent(result) {
    if (!result) return [];
    // MCP SDK wraps results in {content: [{type:'text', text:'...'}]}
    if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
            if (item.type === 'text' && item.text) {
                try {
                    return JSON.parse(item.text);
                } catch {
                    return item.text;
                }
            }
        }
    }
    // Direct result (some servers return unwrapped)
    return result;
}

/**
 * Normalize a raw aws-outlook-mcp email object to InGen's internal format.
 */
function normalizeEmail(raw) {
    if (!raw) return null;
    try {
        return {
            id: raw.id || raw.messageId || String(Math.random()),
            source: 'outlook',
            subject: raw.subject || '(No Subject)',
            snippet: raw.bodyPreview || raw.snippet || '',
            body: raw.body?.content || raw.bodyContent || raw.bodyPreview || '',
            date: raw.receivedDateTime || raw.date || new Date().toISOString(),
            isUnread: raw.isRead === false || raw.isUnread === true,
            labels: raw.importance === 'high' ? ['important'] : [],
            isSent: raw.isSent || false,
            folder: raw.parentFolderName || raw.folder || 'Inbox',
            from: parseAddress(raw.from?.emailAddress || raw.from || raw.sender),
            to: (raw.toRecipients || raw.to || []).map(r =>
                parseAddress(r.emailAddress || r)
            ),
        };
    } catch (e) {
        logger.warn('Failed to normalize email:', e.message);
        return null;
    }
}

/**
 * Normalize a raw aws-outlook-mcp calendar event to InGen's internal format.
 */
function normalizeCalendarEvent(raw) {
    if (!raw) return null;
    try {
        return {
            id: raw.id || raw.eventId || String(Math.random()),
            title: raw.subject || raw.title || 'Untitled',
            startTime: raw.start?.dateTime || raw.startDateTime || raw.startTime || new Date().toISOString(),
            endTime: raw.end?.dateTime || raw.endDateTime || raw.endTime || new Date().toISOString(),
            location: raw.location?.displayName || raw.location || '',
            description: raw.bodyPreview || raw.description || '',
            busyStatus: (raw.showAs || raw.busyStatus || 'busy').toLowerCase(),
            attendees: (raw.attendees || []).map(a => ({
                name: a.emailAddress?.name || a.name || '',
                email: a.emailAddress?.address || a.email || '',
            })),
            organizer: {
                name: raw.organizer?.emailAddress?.name || '',
                email: raw.organizer?.emailAddress?.address || '',
            },
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
