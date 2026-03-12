import { generateDailyBriefing } from '@/services/ai';
import { NextResponse } from 'next/server';
import { fetchOutlookEmails } from '@/services/outlook-local';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const localStore = require('../../../services/local-store');

export const runtime = 'nodejs';

const BRIEFING_CACHE_FILE = path.join(process.cwd(), 'data', 'last-briefing.json');
const BRIEFING_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ─── Filter to Today Only ───
function filterToToday(items, dateField) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return items.filter(item => {
        // Support nested date fields like 'start.dateTime'
        let dateValue;
        if (dateField.includes('.')) {
            const parts = dateField.split('.');
            dateValue = item;
            for (const part of parts) {
                dateValue = dateValue?.[part];
            }
        } else {
            dateValue = item[dateField];
        }
        if (!dateValue) return false;
        const d = new Date(dateValue);
        return !isNaN(d.getTime()) && d >= startOfDay && d < endOfDay;
    });
}

function getTodayEmails(allEmails) {
    return filterToToday(allEmails, 'received');
}

function getTodayMeetings(allMeetings) {
    // Calendar events may use start.dateTime or date (for all-day events)
    return allMeetings.filter(m => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const dateValue = m.start?.dateTime || m.startTime || m.date;
        if (!dateValue) return false;
        const d = new Date(dateValue);
        return !isNaN(d.getTime()) && d >= startOfDay && d < endOfDay;
    });
}

// Ensure data directory exists
function ensureDataDir() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// Read cached briefing
function getCachedBriefing() {
    try {
        if (fs.existsSync(BRIEFING_CACHE_FILE)) {
            const cached = JSON.parse(fs.readFileSync(BRIEFING_CACHE_FILE, 'utf8'));
            const age = Date.now() - new Date(cached.cachedAt).getTime();
            if (age < BRIEFING_CACHE_TTL) {
                return { ...cached.briefing, source: 'cached', cacheAge: Math.round(age / 1000) };
            }
        }
    } catch (e) {
        console.warn('[API/Analyze] Cache read failed:', e.message);
    }
    return null;
}

// Write briefing to cache
function cacheBriefing(briefing) {
    try {
        ensureDataDir();
        fs.writeFileSync(BRIEFING_CACHE_FILE, JSON.stringify({
            cachedAt: new Date().toISOString(),
            briefing
        }, null, 2));
    } catch (e) {
        console.warn('[API/Analyze] Cache write failed:', e.message);
    }
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const source = searchParams.get('source') || 'outlook';
        const forceRefresh = searchParams.get('refresh') === 'true';
        const streamMode = searchParams.get('stream') === 'true';

        console.log(`[API/Analyze] source=${source}, forceRefresh=${forceRefresh}, stream=${streamMode}`);

        // Phase 3: Streaming mode — stream the briefing as it generates
        if (streamMode) {
            return streamBriefing(source);
        }

        // Phase 2: Serve cached briefing for instant page loads
        if (!forceRefresh) {
            const cached = getCachedBriefing();
            if (cached) {
                console.log(`[API/Analyze] Serving cached briefing (${cached.cacheAge}s old)`);
                
                // Trigger background refresh if cache is older than 15 min
                if (cached.cacheAge > 15 * 60) {
                    refreshBriefingInBackground(source);
                }
                
                return NextResponse.json(cached);
            }
        }

        // No cache available — tell frontend to use streaming mode
        // Return quickly with an error flag so the frontend switches to SSE streaming
        console.log('[API/Analyze] No cached briefing available, signaling frontend to stream');
        return NextResponse.json({
            error: 'no_cache',
            message: 'No cached briefing. Use stream=true for ChatGPT-style generation.'
        });

    } catch (error) {
        console.error('[API/Analyze] Failed:', error);
        return NextResponse.json(
            { error: `Analysis failed: ${error.message}` },
            { status: 500 }
        );
    }
}

// Background refresh — non-blocking
function refreshBriefingInBackground(source) {
    console.log('[API/Analyze] Starting background briefing refresh...');
    (async () => {
        try {
            const fetched = await fetchOutlookEmails(20);
            const emails = getTodayEmails(fetched);

            // Load today's meetings from local store
            let todayMeetings = [];
            const calCache = localStore.getCalendar ? localStore.getCalendar() : { data: null };
            if (calCache.data && calCache.data.length > 0) {
                todayMeetings = getTodayMeetings(calCache.data);
            }

            const briefing = await generateDailyBriefing(emails, todayMeetings, []);
            briefing.source = 'live';
            cacheBriefing(briefing);
            console.log('[API/Analyze] Background briefing refresh complete');
        } catch (e) {
            console.error('[API/Analyze] Background refresh failed:', e.message);
        }
    })();
}

// Phase 3: Streaming briefing via SSE
async function streamBriefing(source) {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            try {
                // Send initial event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', message: 'Generating briefing...' })}\n\n`));

                // Read emails from local store (single source of truth) — filter to TODAY only
                let realEmails = [];
                const emailCache = localStore.getEmails ? localStore.getEmails() : { data: null };
                if (emailCache.data && emailCache.data.length > 0 && emailCache.data[0]?.id !== 'error') {
                    const allEmails = emailCache.data;
                    realEmails = getTodayEmails(allEmails);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', message: `Found ${realEmails.length} emails from today (out of ${allEmails.length} cached)` })}\n\n`));
                } else {
                    // Fallback to live fetch if no cache
                    try {
                        const fetched = await fetchOutlookEmails(20);
                        realEmails = getTodayEmails(fetched);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', message: `Fetched ${realEmails.length} today's emails` })}\n\n`));
                    } catch (e) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', message: 'Email fetch failed, continuing...' })}\n\n`));
                    }
                }

                // Read calendar from local store — filter to TODAY only
                let todayMeetings = [];
                const calCache = localStore.getCalendar ? localStore.getCalendar() : { data: null };
                if (calCache.data && calCache.data.length > 0) {
                    todayMeetings = getTodayMeetings(calCache.data);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', message: `Found ${todayMeetings.length} meetings today` })}\n\n`));
                }

                // Stream the Ollama generation
                const { streamDailyBriefing } = await import('@/services/ai-stream');
                
                const fullText = await streamDailyBriefing(realEmails, todayMeetings, [], (chunk) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`));
                });

                // Cache the completed briefing — parse sections for proper formatting
                try {
                    let greeting = fullText;
                    let linkedDocuments = null;
                    let topPriorities = [];

                    const summaryMatch = fullText.match(/##\s*EXECUTIVE SUMMARY([\s\S]*?)(?=##|$)/i);
                    const linkedDocsMatch = fullText.match(/##\s*LINKED DOCUMENTS([\s\S]*?)(?=##|$)/i);
                    const prioritiesMatch = fullText.match(/##\s*TOP PRIORITIES([\s\S]*?)(?=##|$)/i);

                    if (summaryMatch || prioritiesMatch) {
                        greeting = summaryMatch ? summaryMatch[1].trim() : "Here is your executive summary.";
                        if (linkedDocsMatch) linkedDocuments = linkedDocsMatch[1].trim();
                        if (prioritiesMatch) {
                            const lines = prioritiesMatch[1].split('\n').filter(l => l.trim().length > 0);
                            topPriorities = lines.map(line => {
                                const cleanLine = line.trim().replace(/^[-*•]\s*/, '');
                                const m = cleanLine.match(/^(?:\[URGENCY:\s*(HIGH|MEDIUM|LOW)\])?\s*([^|]+)(?:\|\s*(.+))?$/i);
                                if (m) return { type: 'general', urgency: (m[1] || 'medium').toLowerCase(), title: m[2].trim(), reason: m[3] ? m[3].trim() : 'AI Highlight', deadline: 'today' };
                                return { type: 'general', urgency: 'medium', title: cleanLine, reason: 'AI Suggested', deadline: 'today' };
                            }).slice(0, 5);
                        }
                    }

                    const briefingToCache = {
                        greeting,
                        linkedDocuments,
                        topPriorities,
                        summary: { totalEmails: realEmails.length, generatedAt: new Date().toISOString() },
                        source: 'streamed'
                    };
                    cacheBriefing(briefingToCache);
                    console.log('[API/Analyze] Cached streamed briefing with parsed sections');
                } catch (cacheErr) {
                    console.warn('[API/Analyze] Failed to cache streamed briefing:', cacheErr.message);
                }

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
                controller.close();
            } catch (error) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`));
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

export async function POST(req) {
    return GET(req);
}