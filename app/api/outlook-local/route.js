import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '../../../services/outlook-mcp';
import { analyzeEmails } from '../../../services/ai';
import { mockEmails } from '../../../services/mock-data';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');

export const runtime = 'nodejs';

// In-memory cache for AI categories — persists across requests within the same server process
const categoryCache = new Map(); // emailId -> 'respond_now' | 'respond_today' | 'fyi'
let categorizationInProgress = false;

/**
 * Categorize uncategorized emails in the background using AI.
 * Only categorizes today's received emails (max 20) to keep LLM calls fast.
 * Results are cached in memory and merged on subsequent requests.
 */
async function categorizeEmailsBackground(emails) {
    if (categorizationInProgress) return;
    categorizationInProgress = true;

    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const uncategorized = emails.filter(e => {
            if (categoryCache.has(e.id)) return false;
            if (e.isSent || e.folder === 'Sent Items') return false;
            const d = new Date(e.received || e.date || e.receivedDateTime);
            return d >= startOfDay;
        }).slice(0, 20);

        if (uncategorized.length === 0) {
            categorizationInProgress = false;
            return;
        }

        console.log(`[API/Outlook] Categorizing ${uncategorized.length} emails via AI...`);

        const analyzed = await analyzeEmails(uncategorized.map(e => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: (e.snippet || e.body || '').substring(0, 500),
        })));

        for (const email of analyzed) {
            if (email.category && email.category !== 'uncategorized') {
                const cat = email.category.toLowerCase();
                let aiCategory = 'fyi';
                if (cat.includes('urgent') || cat.includes('respond_now') || cat.includes('action')) {
                    aiCategory = 'respond_now';
                } else if (cat.includes('important') || cat.includes('respond_today') || cat.includes('follow')) {
                    aiCategory = 'respond_today';
                }
                categoryCache.set(email.id, aiCategory);
            }
        }

        console.log(`[API/Outlook] AI categorized: ${categoryCache.size} total cached categories`);
    } catch (e) {
        console.error('[API/Outlook] AI categorization failed (non-blocking):', e.message);
    }
    categorizationInProgress = false;
}

function mergeCategories(emails) {
    return emails.map(e => ({
        ...e,
        aiCategory: categoryCache.get(e.id) || e.aiCategory || undefined,
    }));
}

export async function GET(request) {
    try {
        const useMock = process.env.USE_MOCK_DATA === 'true';
        const { searchParams } = new URL(request.url);
        const count = parseInt(searchParams.get('count') || '100');

        console.log(`[API/Outlook] useMock=${useMock}, count=${count}`);

        if (useMock) {
            return NextResponse.json({ emails: mockEmails, source: 'mock' });
        }

        // LOCAL STORE FIRST — instant response from cached data
        const cached = localStore.getEmails();
        if (cached.exists && cached.data && cached.data.length > 0 && cached.data[0]?.id !== 'error') {
            const emails = mergeCategories(cached.data.slice(0, count));
            console.log(`[API/Outlook] Serving ${emails.length} emails from local store (${cached.ageMinutes}m old, ${categoryCache.size} categorized)`);

            if (cached.isStale) {
                console.log('[API/Outlook] Local store is stale, triggering background sync');
                localStore.fullSync().catch(e => console.error('Background sync failed:', e.message));
            }

            // Trigger background AI categorization (non-blocking, fire-and-forget)
            categorizeEmailsBackground(cached.data).catch(() => {});

            return NextResponse.json({ emails, source: 'local', ageMinutes: cached.ageMinutes });
        }

        // FALLBACK — no local data, fetch from Outlook directly
        console.log(`[API/Outlook] No local data, fetching ${Math.min(count, 20)} emails from Outlook...`);
        const emails = await fetchOutlookEmails(Math.min(count, 20));

        if (emails.length > 0 && emails[0].id === 'error') {
            return NextResponse.json({ error: emails[0].subject }, { status: 500 });
        }

        if (emails.length > 0) {
            localStore.saveEmails(emails);
            categorizeEmailsBackground(emails).catch(() => {});
        }

        return NextResponse.json({ emails: mergeCategories(emails), source: 'live' });
    } catch (error) {
        console.error('Outlook API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch Outlook emails' }, { status: 500 });
    }
}
