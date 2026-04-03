import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─── GET: List notes or get single note ───

export async function GET(request) {
    try {
        const notesStore = require('../../../services/notes-store');
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const action = searchParams.get('action');

        if (action === 'due') {
            // Get action items due soon (for briefing integration)
            const days = parseInt(searchParams.get('days') || '7');
            const items = await notesStore.getDueActionItems(days);
            return NextResponse.json({ items });
        }

        if (action === 'open-items') {
            const items = await notesStore.getAllOpenActionItems();
            return NextResponse.json({ items });
        }

        if (id) {
            const note = await notesStore.getNote(id);
            if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
            return NextResponse.json({ note });
        }

        // List all notes
        const limit = parseInt(searchParams.get('limit') || '50');
        const notes = await notesStore.listNotes(limit);
        return NextResponse.json({ notes });
    } catch (error) {
        console.error('[API/Notes] GET Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// ─── POST: Create note, extract action items, or update ───

export async function POST(request) {
    try {
        const notesStore = require('../../../services/notes-store');
        const body = await request.json();
        const action = body.action || 'create';

        switch (action) {
            case 'create': {
                const note = await notesStore.createNote({
                    title: body.title || 'Untitled Note',
                    rawText: body.rawText || '',
                    meetingId: body.meetingId || null,
                });
                return NextResponse.json({ note });
            }

            case 'update': {
                if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                const note = await notesStore.updateNote(body.id, {
                    title: body.title,
                    rawText: body.rawText,
                    actionItems: body.actionItems,
                    meetingId: body.meetingId,
                });
                // Re-ingest to vector store after update
                if (body.rawText) {
                    notesStore.ingestToVectorStore(body.id).catch(() => {});
                }
                return NextResponse.json({ note });
            }

            case 'delete': {
                if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
                await notesStore.deleteNote(body.id);
                return NextResponse.json({ ok: true });
            }

            case 'extract': {
                // Extract action items from raw text using LLM + RAG context
                const rawText = body.rawText || '';
                const noteTitle = body.title || '';
                if (!rawText.trim()) return NextResponse.json({ actionItems: [] });

                const orgStore = require('../../../services/org-store');
                const bedrockClient = require('../../../services/bedrock-client');

                // Get org members for name→alias resolution
                let orgContext = '';
                try {
                    const members = await orgStore.getAllMembers();
                    if (members.length > 0) {
                        orgContext = '\n\nTEAM MEMBERS (name → alias):\n' +
                            members.map(m => `${m.name} → @${m.alias}`).join('\n');
                    }
                } catch (e) { /* org not populated, skip */ }

                // Get RAG context for enrichment
                let ragContext = '';
                try {
                    const vectorStore = require('../../../services/vector-store');
                    await vectorStore.init();
                    const results = await vectorStore.search(rawText.substring(0, 500), 3);
                    if (results && results.length > 0) {
                        ragContext = '\n\nRELATED CONTEXT FROM EMAILS/SLACK:\n' +
                            results.map(r => `- ${r.subject || r.content?.substring(0, 100)}`).join('\n');
                    }
                } catch (e) { /* vector store not ready, skip */ }

                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });

                const prompt = `You are an action item extractor. Given raw meeting notes, extract structured action items.

TODAY'S DATE: ${todayStr} (${dayOfWeek})
MEETING: ${noteTitle}
${orgContext}
${ragContext}

RAW NOTES:
${rawText}

Extract action items from the notes above. For each action item, determine:
1. **owner**: The person responsible (use @alias if you can match from the team members list, otherwise use the name as-is)
2. **action**: A clear, concise description of what needs to be done
3. **dueDate**: ISO date string (YYYY-MM-DD). Resolve relative dates:
   - "by Friday" → the coming Friday from today
   - "next week" → next Monday
   - "end of month" → last day of current month
   - "tomorrow" → tomorrow's date
   - If no date mentioned, use null
4. **priority**: "High", "Medium", or "Low" based on urgency signals in the text
5. **context**: Brief context about why this action item exists (1 sentence)

Return ONLY a valid JSON array. Example:
[
  {"owner": "@abhishan", "action": "Submit CR for semantic executor design", "dueDate": "2026-04-04", "priority": "High", "context": "Design work is complete, CR pending"},
  {"owner": "Ruchika", "action": "Follow up on Insights dashboard", "dueDate": "2026-04-30", "priority": "Medium", "context": "Dashboard needs review before month end"}
]

If no action items found, return [].
Return ONLY the JSON array, no other text.`;

                try {
                    let result = '';
                    if (bedrockClient.isAvailable()) {
                        result = await bedrockClient.generate(prompt, {
                            system: 'You are a precise action item extractor. Return only valid JSON arrays.',
                            temperature: 0.1,
                            maxTokens: 4096,
                        });
                    } else {
                        const ollama = require('../../../services/ollama-client');
                        result = await ollama.generateJSON(prompt, { temperature: 0.1 });
                        if (typeof result === 'object') result = JSON.stringify(result);
                    }

                    // Parse the JSON response
                    let actionItems = [];
                    try {
                        // Strip markdown code fences if present
                        const cleaned = (result || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                        actionItems = JSON.parse(cleaned);
                        if (!Array.isArray(actionItems)) actionItems = [];
                    } catch (e) {
                        // Try to extract JSON array from the response
                        const match = (result || '').match(/\[[\s\S]*\]/);
                        if (match) {
                            try { actionItems = JSON.parse(match[0]); } catch (e2) { actionItems = []; }
                        }
                    }

                    return NextResponse.json({ actionItems });
                } catch (e) {
                    console.error('[API/Notes] LLM extraction failed:', e.message);
                    return NextResponse.json({ actionItems: [], error: e.message });
                }
            }

            default:
                return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (error) {
        console.error('[API/Notes] POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
