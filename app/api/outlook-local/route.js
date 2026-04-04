import { NextResponse } from 'next/server';
import { fetchOutlookEmails, fetchSentEmails } from '../../../services/outlook-mcp';
import { analyzeEmails } from '../../../services/ai';
import { mockEmails } from '../../../services/mock-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');
const phonetool = require('../../../services/phonetool');
const settings = require('../../../config/settings.json');

export const runtime = 'nodejs';

// In-memory cache for AI-upgraded categories (persists within server process)
const aiCategoryCache = new Map(); // emailId -> 'respond_now' | 'respond_today' | 'fyi'
let categorizationInProgress = false;

// Leadership chain cache — Set of lowercase email addresses (manager, manager's manager, etc.)
let leadershipEmailSet = null; // null = not yet loaded
let leadershipNameSet = null;  // Set of lowercase display names and first names
let leadershipLoadedAt = 0;
const LEADERSHIP_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Lazily fetch (and cache) the leadership chain email set.
 * Non-blocking: called fire-and-forget; returns current cache immediately.
 */
function ensureLeadershipChain() {
    const now = Date.now();
    if (leadershipEmailSet !== null && (now - leadershipLoadedAt) < LEADERSHIP_TTL) return;

    const alias = settings.phonetoolAlias;
    if (!alias) return;

    // Fire-and-forget — populate cache in background
    phonetool.fetchLeadershipChain(alias, 4).then(chain => {
        leadershipEmailSet = new Set(chain.map(p => p.email.toLowerCase()));
        leadershipNameSet = buildNameSet(chain);
        leadershipLoadedAt = Date.now();
        console.log(`[API/Outlook] Leadership chain loaded: ${[...leadershipEmailSet].join(', ')}`);
    }).catch(e => {
        console.warn('[API/Outlook] Leadership chain fetch failed:', e.message);
    });
}

// Try to load leadership chain from file cache synchronously at startup
// so it's available immediately on first request, before async fetch completes
try {
    const fs = require('fs');
    const path = require('path');
    const chainPath = path.join(process.cwd(), 'brain', 'leadership-chain.json');
    if (fs.existsSync(chainPath)) {
        const cached = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
        if (cached.chain && Array.isArray(cached.chain) && (Date.now() - (cached.timestamp || 0) < LEADERSHIP_TTL)) {
            leadershipEmailSet = new Set(cached.chain.map(p => p.email.toLowerCase()));
            leadershipNameSet = buildNameSet(cached.chain);
            leadershipLoadedAt = cached.timestamp || Date.now();
            console.log(`[API/Outlook] Leadership chain pre-loaded from disk: ${[...leadershipEmailSet].join(', ')}`);
        }
    }
} catch (e) { /* ignore */ }

// Kick off leadership chain load at module startup (non-blocking)
ensureLeadershipChain();

/**
 * Build a Set of name tokens for leadership name-matching.
 * For "Onalan, Bahadir" stores: "onalan", "bahadir", "onalan, bahadir", "bahadir onalan"
 */
function buildNameSet(chain) {
    const names = new Set();
    for (const p of chain) {
        const raw = (p.name || p.alias || '').toLowerCase().trim();
        if (!raw) continue;
        names.add(raw);
        // Handle "Last, First" format
        const parts = raw.split(/[\s,]+/).filter(Boolean);
        parts.forEach(part => { if (part.length > 2) names.add(part); });
        // "First Last" variant
        if (parts.length >= 2) names.add(parts.slice().reverse().join(' '));
        // Also add alias
        if (p.alias) names.add(p.alias.toLowerCase());
    }
    return names;
}

/**
 * Extract a clean lowercase email address from various from-field formats:
 *   - Object: { name: 'Robert', email: 'tekielar@amazon.com' }
 *   - String: 'Tekiela, Robert <tekielar@amazon.com>'
 *   - String: 'tekielar@amazon.com'
 */
function extractSenderEmail(from) {
    if (!from) return '';
    if (typeof from === 'object') {
        const email = (from.email || from.address || '').toLowerCase().trim();
        if (email) return email;
        // Fallback: try to parse name field as email string
        return extractSenderEmail(from.name || '');
    }
    // String: extract from angle brackets first
    const angleMatch = from.match(/<([^>]+)>/);
    if (angleMatch) return angleMatch[1].toLowerCase().trim();
    // Plain email address
    if (from.includes('@')) return from.toLowerCase().trim();
    return '';
}

/**
 * Check if a sender email/alias is in the leadership chain.
 * Matches on email address, alias, or display name.
 */
function isLeadershipSender(from) {
    if (!leadershipEmailSet) return false;
    const email = extractSenderEmail(from);
    if (email) {
        if (leadershipEmailSet.has(email)) return true;
        const alias = email.replace(/@.*$/, '');
        if (leadershipEmailSet.has(`${alias}@amazon.com`)) return true;
    }
    // Name-based fallback for system emails where email field is empty
    if (leadershipNameSet && leadershipNameSet.size > 0) {
        const displayName = (typeof from === 'string'
            ? from.replace(/<[^>]+>/, '').trim()
            : from?.name || from?.displayName || ''
        ).toLowerCase().trim();
        if (displayName && displayName.length > 2) {
            if (leadershipNameSet.has(displayName)) return true;
            // Check if any token from display name matches a leadership name token
            const tokens = displayName.split(/[\s,]+/).filter(t => t.length > 2);
            for (const token of tokens) {
                if (leadershipNameSet.has(token)) return true;
            }
        }
    }
    return false;
}

/**
 * Fast rule-based email triage — no AI required, runs synchronously.
 * Returns 'respond_now' | 'respond_today' | 'fyi'
 *
 * Heuristics:
 *   respond_now  — direct question to you, urgent/action keywords, @-mentioned, small DL
 *   respond_today — important context, follow-up, FYI-but-needs-ack
 *   fyi           — newsletters, automated, large DL, OOO, no-reply
 */
function ruleBasedCategory(email) {
    const subject = (email.subject || '').toLowerCase();
    const snippet = (email.snippet || email.body || '').toLowerCase().slice(0, 400);
    const from = typeof email.from === 'string' ? email.from.toLowerCase()
        : `${email.from?.name || ''} ${email.from?.email || ''}`.toLowerCase();
    const to = (email.recipients || []).map(r => (typeof r === 'string' ? r : r?.email || r?.name || '')).join(' ').toLowerCase();
    const combined = `${subject} ${snippet} ${from}`;
    const recipientCount = (email.recipients || []).length;

    // ── Leadership chain check — highest priority: always respond_now ────
    if (isLeadershipSender(email.from)) return 'respond_now';

    // ── FYI signals — check first so we don't mis-upgrade noise ──────────
    const fyiPatterns = [
        /\bno[-_]?reply\b/,
        /\bnewsletter\b/,
        /\bunsubscribe\b/,
        /\bauto[-_]?generated\b/,
        /\bdo not reply\b/,
        /\bnotification\b.*\bfrom\b/,
        /\booo\b|out of office|on vacation|annual leave/,
        /\b(digest|weekly update|monthly update|release notes)\b/,
        /\bfyi\b.*\bno action needed\b/,
        /^(re: )?fyi\b/,
    ];
    if (fyiPatterns.some(p => p.test(combined))) return 'fyi';
    // Large distribution lists → FYI
    if (recipientCount > 10) return 'fyi';
    // no-reply sender domain
    if (from.includes('no-reply') || from.includes('noreply') || from.includes('donotreply')) return 'fyi';

    // ── respond_now signals ───────────────────────────────────────────────
    const respondNowPatterns = [
        /\baction required\b/,
        /\baction item\b/,
        /\burgent\b/,
        /\basap\b/,
        /\bblocking\b/,
        /\bneed your (approval|sign-?off|input|feedback|decision|review)\b/,
        /\bplease (review|approve|confirm|respond|reply|update)\b/,
        /\bcan you (please |kindly )?(review|approve|confirm|respond|reply|take|help)\b/,
        /\bwhat (do you think|are your thoughts|is your)\b/,
        /\byour (input|thoughts|feedback|approval|sign-?off) (is |are )?(needed|required|requested)\b/,
        /\bfollowing up\b.*\bstill waiting\b/,
        /\boverdue\b/,
        /\bdeadline\b.*(today|tomorrow|tonight)/,
        /\bescalat/,
    ];
    if (respondNowPatterns.some(p => p.test(combined))) return 'respond_now';

    // ── respond_today signals ─────────────────────────────────────────────
    const respondTodayPatterns = [
        /\bfollowing up\b/,
        /\bfollow.?up\b/,
        /\bjust wanted to check\b/,
        /\bcircling back\b/,
        /\bany update\b/,
        /\bplease (let me know|share|send|provide)\b/,
        /\bwanted to (get your|ask|check|touch base|connect)\b/,
        /\bquick (question|ask|note|check)\b/,
        /\b(let me know|lmk)\b/,
        /\bimportant\b/,
        /\bdeadline\b/,
        /\bscheduled for (today|tomorrow)\b/,
        /\b(interview|hiring)\b/,
        /\b1:1|one.on.one\b/,
    ];
    if (respondTodayPatterns.some(p => p.test(combined))) return 'respond_today';

    // Small recipient list + recent → respond_today (direct email to you)
    if (recipientCount <= 3) {
        const ageMs = Date.now() - new Date(email.date || email.received || 0).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        if (ageDays <= 2) return 'respond_today';
    }

    return 'fyi';
}

/**
 * AI-upgrade categorization for borderline emails (background, non-blocking).
 * Only re-categorizes emails that rule-based marked as 'fyi' but look borderline.
 */
async function upgradeWithAI(emails) {
    if (categorizationInProgress) return;
    categorizationInProgress = true;

    try {
        // Only upgrade recent (≤7 days) non-FYI candidate emails not yet AI-categorized
        const candidates = emails.filter(e => {
            if (aiCategoryCache.has(e.id)) return false;
            if (e.isSent || e.folder === 'Sent Items') return false;
            const ageDays = (Date.now() - new Date(e.date || e.received || 0).getTime()) / (1000 * 60 * 60 * 24);
            return ageDays <= 7;
        }).slice(0, 30);

        if (candidates.length === 0) { categorizationInProgress = false; return; }

        console.log(`[API/Outlook] AI-upgrading ${candidates.length} emails...`);
        const analyzed = await analyzeEmails(candidates.map(e => ({
            id: e.id, from: e.from, subject: e.subject,
            snippet: (e.snippet || e.body || '').substring(0, 500),
        })));

        for (const email of analyzed) {
            if (!email.category || email.category === 'uncategorized') continue;
            const cat = email.category.toLowerCase();
            let aiCategory = 'fyi';
            if (cat.includes('urgent') || cat.includes('respond_now') || cat.includes('action')) {
                aiCategory = 'respond_now';
            } else if (cat.includes('important') || cat.includes('respond_today') || cat.includes('follow')) {
                aiCategory = 'respond_today';
            }
            aiCategoryCache.set(email.id, aiCategory);
        }
        console.log(`[API/Outlook] AI cache now has ${aiCategoryCache.size} entries`);
    } catch (e) {
        console.error('[API/Outlook] AI upgrade failed (non-blocking):', e.message);
    }
    categorizationInProgress = false;
}

/**
 * Filter emails to only include those within the last N days.
 */
function filterByDays(emails, days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return emails.filter(e => {
        const emailDate = new Date(e.date || e.received || e.receivedDateTime || 0).getTime();
        return emailDate >= cutoff;
    });
}

function applyCategories(emails) {
    return emails.map(e => {
        // Leadership check always wins — cannot be overridden by stale AI/rule cache
        const leadershipCategory = isLeadershipSender(e.from) ? 'respond_now' : null;

        return {
            ...e,
            // Priority: leadership > AI cache > existing aiCategory > rule-based
            aiCategory: leadershipCategory || aiCategoryCache.get(e.id) || e.aiCategory || ruleBasedCategory(e),
        };
    });
}

export async function GET(request) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'inbox';
        const count = parseInt(searchParams.get('count') || '100');

        if (useMock) {
            return NextResponse.json({ emails: mockEmails, source: 'mock' });
        }

        // ── View: followups ─────────────────────────────────────────────────────
        // Sent emails >3 days ago that have received no reply in the inbox.
        if (view === 'followups') {
            const daysBack = parseInt(searchParams.get('days') || '7');
            const thresholdDays = parseInt(searchParams.get('threshold') || '3');
            const [sentEmails, inboxCached] = await Promise.all([
                fetchSentEmails(60, daysBack),
                Promise.resolve(localStore.getEmails()),
            ]);

            const inbox = (inboxCached.data || []).filter(e => !e.isSent && e.folder !== 'Sent Items');
            // Build a Set of conversationIds that received a reply
            const repliedConversationIds = new Set(
                inbox.map(e => e.conversationId || e.id).filter(Boolean)
            );

            const nowMs = Date.now();
            const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;

            const followups = sentEmails
                .filter(e => {
                    if (!e.subject || !e.date) return false;
                    // Skip auto-generated, calendar, system emails
                    const subj = (e.subject || '').toLowerCase();
                    if (/^(re:|fwd:|fw:)/.test(subj)) return false; // replies/forwards you sent
                    if (/calendar|invite|declined|accepted|tentative/.test(subj)) return false;
                    if (/no-?reply|noreply|donotreply/.test((e.from?.email || ''))) return false;
                    const sentMs = new Date(e.date).getTime();
                    const ageDays = (nowMs - sentMs) / (1000 * 60 * 60 * 24);
                    // Only emails older than threshold and not yet replied to
                    if (ageDays < thresholdDays) return false;
                    const convId = e.conversationId || e.id;
                    return convId && !repliedConversationIds.has(convId);
                })
                .slice(0, 20)
                .map(e => ({
                    id: e.id,
                    subject: e.subject,
                    to: e.recipients || [],
                    sentAt: e.date,
                    daysSinceSent: Math.floor((nowMs - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24)),
                    conversationId: e.conversationId || e.id,
                    snippet: (e.snippet || e.body || '').slice(0, 200),
                }));

            return NextResponse.json({ followups, count: followups.length, source: 'mcp+local' });
        }

        // ── View: needs-reply ────────────────────────────────────────────────────
        // Inbox emails addressed to you that likely need a response, not yet replied to.
        if (view === 'needs-reply') {
            const isErrorSentinel = (e) => !e?.id || e.id === 'error' || e.id === 'mcp-error' || String(e.id).startsWith('mcp-');

            // Get inbox from local store (fast)
            const cached = localStore.getEmails();
            const allEmails = (cached.data || []).filter(e => !isErrorSentinel(e));
            const inbox = allEmails.filter(e => !e.isSent && e.folder !== 'Sent Items');

            // Get sent emails to cross-reference for "already replied"
            let sentConversationIds = new Set();
            try {
                const sent = await fetchSentEmails(100, 14);
                sentConversationIds = new Set(sent.map(e => e.conversationId || e.id).filter(Boolean));
            } catch (e) {
                console.warn('[API/Outlook] Could not fetch sent for needs-reply cross-ref:', e.message);
            }

            const nowMs = Date.now();
            const minAgeMs = 2 * 60 * 60 * 1000; // at least 2 hours old

            const candidates = inbox.filter(e => {
                const from = typeof e.from === 'string' ? e.from : (e.from?.email || e.from?.name || '');
                // Skip no-reply, newsletters, large DLs
                if (/no-?reply|noreply|donotreply/.test(from.toLowerCase())) return false;
                if ((e.recipients || []).length > 10) return false;
                // Must be old enough to need a reply
                const ageMs = nowMs - new Date(e.date || e.received || 0).getTime();
                if (ageMs < minAgeMs) return false;
                // Skip if we already replied to this conversation
                const convId = e.conversationId || e.id;
                if (convId && sentConversationIds.has(convId)) return false;
                // Must look actionable
                const cat = aiCategoryCache.get(e.id) || ruleBasedCategory(e);
                return cat === 'respond_now' || cat === 'respond_today';
            });

            // Sort: respond_now first, then by date (newest first)
            candidates.sort((a, b) => {
                const catA = aiCategoryCache.get(a.id) || ruleBasedCategory(a);
                const catB = aiCategoryCache.get(b.id) || ruleBasedCategory(b);
                if (catA === 'respond_now' && catB !== 'respond_now') return -1;
                if (catB === 'respond_now' && catA !== 'respond_now') return 1;
                return new Date(b.date || 0) - new Date(a.date || 0);
            });

            const top = candidates.slice(0, 15).map(e => ({
                id: e.id,
                subject: e.subject,
                from: e.from,
                receivedAt: e.date || e.received,
                ageHours: Math.round((nowMs - new Date(e.date || 0).getTime()) / (1000 * 60 * 60)),
                conversationId: e.conversationId || e.id,
                snippet: (e.snippet || e.body || '').slice(0, 300),
                priority: aiCategoryCache.get(e.id) || ruleBasedCategory(e),
            }));

            return NextResponse.json({ needsReply: top, count: top.length, source: 'local' });
        }

        // ── View: inbox (default) ────────────────────────────────────────────────
        // Helper: filter out MCP error sentinel emails
        const isErrorSentinel = (e) => !e?.id || e.id === 'error' || e.id === 'mcp-error' || String(e.id).startsWith('mcp-');

        // CACHE-FIRST with live merge — fast initial load, background refresh
        const cached = localStore.getEmails();
        const cleanCached = (cached.data || []).filter(e => !isErrorSentinel(e));

        if (cached.exists && cleanCached.length > 0) {
            const emails = applyCategories(cleanCached.slice(0, count));
            console.log(`[API/Outlook] ${emails.length} emails from cache | rule-based + ${aiCategoryCache.size} AI-upgraded`);

            // Background: fetch fresh from MCP and merge into cache (fire-and-forget)
            if (cached.isStale) {
                fetchOutlookEmails(250).then(fresh => {
                    const realFresh = fresh.filter(e => !isErrorSentinel(e));
                    if (realFresh.length > 0) {
                        // Merge: add new emails, update existing by ID
                        const existingMap = new Map(cleanCached.map(e => [e.id, e]));
                        for (const e of realFresh) { existingMap.set(e.id, e); }
                        const merged = [...existingMap.values()].sort((a, b) =>
                            new Date(b.date || 0) - new Date(a.date || 0)
                        );
                        localStore.saveEmails(merged);
                        console.log(`[API/Outlook] Background merge: ${realFresh.length} fresh → ${merged.length} total in cache`);
                    }
                }).catch(e => console.error('Background email sync failed:', e.message));
            }

            // Background AI upgrade (fire-and-forget)
            upgradeWithAI(cleanCached).catch(() => {});

            return NextResponse.json({ emails, source: 'local', ageMinutes: cached.ageMinutes });
        }

        // FALLBACK — no cache, fetch live from MCP
        console.log(`[API/Outlook] No cache, fetching live from MCP (count=${count})...`);
        const rawEmails = await fetchOutlookEmails(Math.min(count, 250));
        const realEmails = rawEmails.filter(e => !isErrorSentinel(e));

        if (realEmails.length === 0 && rawEmails.length > 0) {
            const errMsg = rawEmails[0]?.subject || 'MCP connection failed';
            return NextResponse.json({ error: errMsg }, { status: 503 });
        }

        if (realEmails.length > 0) {
            localStore.saveEmails(realEmails);
            upgradeWithAI(realEmails).catch(() => {});
        }

        return NextResponse.json({ emails: applyCategories(realEmails), source: 'live' });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}
