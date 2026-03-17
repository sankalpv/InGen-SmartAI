/**
 * API Route: Bulk Data Export & Vector Store Ingestion
 * 
 * GET  /api/bulk-export              — Get extraction status
 * POST /api/bulk-export              — Trigger Python extraction
 * POST /api/bulk-export  {action:'ingest'} — Ingest conversations to vector store
 */

import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const reader = require('@/services/outlook-indexeddb-reader');
        const status = await reader.getStatus();
        return NextResponse.json(status);
    } catch (error) {
        return NextResponse.json({ available: false, error: error.message });
    }
}

export async function POST(req) {
    try {
        const reader = require('@/services/outlook-indexeddb-reader');
        const body = await req.json().catch(() => ({}));

        if (body.action === 'ingest') {
            // Ingest conversations into vector store
            const result = await reader.ingestConversationsToVectorStore();
            return NextResponse.json(result);
        }

        // Default: run Python extractor
        const result = await reader.runExtractor();
        return NextResponse.json(result);

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
