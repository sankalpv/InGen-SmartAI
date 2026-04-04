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
