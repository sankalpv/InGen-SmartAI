import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '../../../services/outlook-mcp';
import { analyzeEmails } from '../../../services/ai';
import { mockEmails } from '../../../services/mock-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');

export const runtime = 'nodejs';

// In-memory cache for AI-upgraded categories (persists within server process)
const aiCategoryCache = new Map(); // emailId -> 'respond_now' | 'respond_today' | 'fyi'
let categorizationInProgress = false;

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

function applyCategories(emails) {
    return emails.map(e => ({
        ...e,
        // Priority: AI cache > existing aiCategory > rule-based (always computed)
        aiCategory: aiCategoryCache.get(e.id) || e.aiCategory || ruleBasedCategory(e),
    }));
}

export async function GET(request) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';
        const { searchParams } = new URL(request.url);
        const count = parseInt(searchParams.get('count') || '100');

        if (useMock) {
            return NextResponse.json({ emails: mockEmails, source: 'mock' });
        }

        // LOCAL STORE FIRST — instant response from cached data
        const cached = localStore.getEmails();
        if (cached.exists && cached.data && cached.data.length > 0 && cached.data[0]?.id !== 'error') {
            const emails = applyCategories(cached.data.slice(0, count));
            console.log(`[API/Outlook] ${emails.length} emails | rule-based + ${aiCategoryCache.size} AI-upgraded`);

            if (cached.isStale) {
                localStore.fullSync().catch(e => console.error('Background sync failed:', e.message));
            }

            // Background AI upgrade (fire-and-forget)
            upgradeWithAI(cached.data).catch(() => {});

            return NextResponse.json({ emails, source: 'local', ageMinutes: cached.ageMinutes });
        }

        // FALLBACK — no local data, fetch live from MCP
        console.log(`[API/Outlook] No local data, fetching from MCP...`);
        const rawEmails = await fetchOutlookEmails(Math.min(count, 50));

        if (rawEmails.length > 0 && rawEmails[0].id === 'error') {
            return NextResponse.json({ error: rawEmails[0].subject }, { status: 500 });
        }

        if (rawEmails.length > 0) {
            localStore.saveEmails(rawEmails);
            upgradeWithAI(rawEmails).catch(() => {});
        }

        return NextResponse.json({ emails: applyCategories(rawEmails), source: 'live' });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}
