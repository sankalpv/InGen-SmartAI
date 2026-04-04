import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
    try {
        const feedbackStore = require('../../../services/feedback-store');
        const body = await request.json();
        const { type } = body;

        switch (type) {
            case 'alert-outcome': {
                const { alertId, outcome, snoozeDuration } = body;
                if (!alertId || !outcome) return NextResponse.json({ error: 'alertId and outcome required' }, { status: 400 });
                await feedbackStore.recordAlertOutcome(alertId, outcome, snoozeDuration);
                return NextResponse.json({ ok: true });
            }

            case 'alert-fired': {
                const { alertId, alertType } = body;
                if (!alertId) return NextResponse.json({ error: 'alertId required' }, { status: 400 });
                await feedbackStore.recordAlertFired(alertId, alertType);
                return NextResponse.json({ ok: true });
            }

            case 'draft': {
                const { draftId, emailContext, recipientEmail, aiDraft, userSent, sentAt } = body;
                const relationship = await feedbackStore.classifyRelationship(recipientEmail);
                await feedbackStore.recordDraftFeedback({ draftId, emailContext, recipientEmail, aiDraft, userSent, relationship, sentAt });
                return NextResponse.json({ ok: true, relationship });
            }

            case 'search-results': {
                const { sessionId, queryText, results } = body;
                if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
                await feedbackStore.recordSearchResults(sessionId, queryText, results || []);
                return NextResponse.json({ ok: true });
            }

            case 'result-click': {
                const { sessionId, docId, dwellMs } = body;
                await feedbackStore.recordResultClick(sessionId, docId, dwellMs);
                return NextResponse.json({ ok: true });
            }

            case 'search-correction': {
                const { sessionId, correctionText } = body;
                await feedbackStore.recordSearchCorrection(sessionId, correctionText);
                return NextResponse.json({ ok: true });
            }

            // ── Adaptive Learning: Email Category Override ──────────────────
            case 'category-correction': {
                const { emailId, originalCategory, correctedCategory, from, subject } = body;
                console.log(`[Feedback] Category correction: ${emailId} ${originalCategory}→${correctedCategory} from=${from}`);
                // Store as a search correction (reuses existing table — correction text captures the override)
                await feedbackStore.recordSearchCorrection(
                    `category-${emailId}`,
                    JSON.stringify({ originalCategory, correctedCategory, from, subject, timestamp: new Date().toISOString() })
                );
                return NextResponse.json({ ok: true });
            }

            // ── Adaptive Learning: Draft Quality Feedback ──────────────────
            case 'draft-feedback': {
                const { emailId, score, draftText } = body;
                console.log(`[Feedback] Draft feedback: ${emailId} score=${score}`);
                await feedbackStore.recordResultClick(`draft-${emailId}`, emailId, score > 0 ? 5000 : 100);
                return NextResponse.json({ ok: true });
            }

            // ── Adaptive Learning: Q&A Answer Quality Feedback ─────────────
            case 'answer-feedback': {
                const { emailId, score, question: q, answerText } = body;
                console.log(`[Feedback] Answer feedback: ${emailId} score=${score} q="${q?.substring(0, 50)}"`);
                await feedbackStore.recordResultClick(`answer-${emailId}`, emailId, score > 0 ? 5000 : 100);
                return NextResponse.json({ ok: true });
            }

            // ── Adaptive Learning: Chat Answer Feedback ────────────────────
            case 'chat-feedback': {
                const { sessionId: chatSession, messageId, score: chatScore } = body;
                console.log(`[Feedback] Chat feedback: session=${chatSession} msg=${messageId} score=${chatScore}`);
                await feedbackStore.recordResultClick(chatSession || 'chat', messageId || 'unknown', chatScore > 0 ? 5000 : 100);
                return NextResponse.json({ ok: true });
            }

            default:
                return NextResponse.json({ error: `Unknown feedback type: ${type}` }, { status: 400 });
        }
    } catch (error) {
        console.error('[API/Feedback] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const feedbackStore = require('../../../services/feedback-store');
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'stats';

        switch (view) {
            case 'stats':
                return NextResponse.json(await feedbackStore.getStats());
            case 'alert-effectiveness':
                return NextResponse.json({ data: await feedbackStore.getAlertEffectiveness() });
            case 'draft-summary':
                return NextResponse.json({ data: await feedbackStore.getDraftStyleSummary() });
            case 'retrieval-quality':
                return NextResponse.json({ data: await feedbackStore.getRetrievalQuality() });
            default:
                return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
        }
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
