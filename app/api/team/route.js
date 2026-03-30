import { NextResponse } from 'next/server';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const phonetool = require('../../../services/phonetool');
const personInsights = require('../../../services/person-insights');
const wbrReport = require('../../../services/wbr-report');
const orgStore = require('../../../services/org-store');
const ticketing = require('../../../services/ticketing');
const oncall = require('../../../services/oncall');

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min for streaming

// Simple in-memory cache for SDE3 Focus (L6+ task aggregation)
// This persists as long as the Next.js API worker is alive.
let sde3FocusCache = null;
let sde3FocusCacheTime = 0;
const SDE3_CACHE_TTL = 3600 * 1000; // 1 hour

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view') || 'tree';
        const alias = searchParams.get('alias');
        const days = parseInt(searchParams.get('days') || '14');

        let data;

        switch (view) {
            case 'tree': {
                // Try SQLite first, fall back to live Phonetool
                const orgTree = await orgStore.getOrgTree();
                if (orgTree) {
                    data = orgTree;
                } else {
                    const rootAlias = phonetool.getAlias();
                    if (!rootAlias) {
                        return NextResponse.json({ error: 'No Phonetool alias configured. Go to Settings to set it.' }, { status: 400 });
                    }
                    data = await phonetool.fetchOrgTree(rootAlias);
                    // Save to SQLite for future queries
                    if (data) await orgStore.saveOrgTree(data, rootAlias);
                }
                break;
            }

            case 'flat': {
                const populated = await orgStore.isPopulated();
                if (populated) {
                    data = await orgStore.getAllMembers();
                } else {
                    const rootAlias = phonetool.getAlias();
                    if (!rootAlias) {
                        return NextResponse.json({ error: 'No Phonetool alias configured.' }, { status: 400 });
                    }
                    data = await phonetool.getOrgFlatList(rootAlias);
                }
                break;
            }

            case 'org-sync': {
                // Force re-fetch org tree from Phonetool and save to SQLite
                let rootAlias = phonetool.getAlias();
                if (!rootAlias) {
                    return NextResponse.json({ error: 'No Phonetool alias configured.' }, { status: 400 });
                }

                // If the configured user is NOT a manager, automatically use their manager's alias
                // so the page shows their team's code metrics instead of empty data
                let resolvedViaManager = false;
                try {
                    const tree = await phonetool.fetchOrgTree(rootAlias, 1, true);
                    if (tree && (!tree.reports || tree.reports.length === 0)) {
                        // User is an IC — look up their manager from phonetool page
                        const mcpClient = require('../../../services/mcp-client');
                        const ptResult = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
                            inputs: [`https://phonetool.amazon.com/users/${rootAlias}`]
                        });
                        const ptText = ptResult?.content?.map(c => c.text || '').join('') || '';
                        // Parse manager alias from phonetool page (format: "Manager: Name (alias)")
                        const mgrMatch = ptText.match(/Manager[:\s]+[^(]*\(([a-z0-9]+)\)/i)
                            || ptText.match(/Reports to[:\s]+[^(]*\(([a-z0-9]+)\)/i)
                            || ptText.match(/manager.*?\/users\/([a-z0-9]+)/i);
                        if (mgrMatch && mgrMatch[1]) {
                            rootAlias = mgrMatch[1];
                            resolvedViaManager = true;
                        }
                    }
                } catch (e) {
                    // If lookup fails, proceed with original alias
                }

                const count = await orgStore.populateFromPhoneTool(rootAlias, true);
                data = {
                    rootAlias,
                    memberCount: count,
                    lastFetched: new Date().toISOString(),
                    resolvedViaManager,
                    originalAlias: resolvedViaManager ? phonetool.getAlias() : undefined,
                };
                break;
            }

            case 'org-status': {
                const populated = await orgStore.isPopulated();
                data = {
                    populated,
                    memberCount: populated ? await orgStore.getMemberCount() : 0,
                    rootAlias: await orgStore.getRootAlias(),
                    lastFetched: await orgStore.getLastFetched(),
                    managers: populated ? (await orgStore.getManagers()).map(m => ({ alias: m.alias, name: m.name, depth: m.depth })) : [],
                };
                break;
            }

            case 'person': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                const details = await phonetool.fetchPersonName(alias);
                const name = details?.name || alias;
                data = await personInsights.generatePersonInsight(alias, name, days);
                break;
            }

            case 'person-quick': {
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required' }, { status: 400 });
                }
                // Quick view without AI — just emails, meetings, issues counts
                const emails = personInsights.getEmailsForPerson(alias, days);
                const meetings = personInsights.getMeetingsForPerson(alias, days);
                const issues = await personInsights.getIssuesForPerson(alias, days);
                const name = phonetool.getCachedName(alias) || alias;
                data = {
                    alias,
                    name,
                    emailCount: emails.length,
                    meetingCount: meetings.length,
                    issueCount: issues.length,
                    recentEmails: emails.slice(0, 5).map(e => ({
                        subject: e.subject,
                        from: e.from || e.sender,
                        date: e.date || e.receivedAt,
                    })),
                    recentIssues: issues.slice(0, 5).map(i => ({
                        title: i.title,
                        action: i.action,
                        type: i.type,
                        timestamp: i.timestamp,
                    })),
                };
                break;
            }

            case 'wbr': {
                const forceRefresh = searchParams.get('refresh') === 'true';
                data = await wbrReport.generateWbrReport(forceRefresh);
                break;
            }

            case 'wbr-stream': {
                // Progressive streaming — SSE endpoint that sends goals as they're fetched
                const forceRefreshStream = searchParams.get('refresh') === 'true';
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        const send = (event) => {
                            try {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                            } catch (e) { /* stream closed */ }
                        };
                        try {
                            await wbrReport.generateWbrReportStreaming(send, forceRefreshStream);
                        } catch (e) {
                            send({ type: 'error', message: e.message });
                        }
                        controller.close();
                    }
                });
                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Accel-Buffering': 'no',
                    }
                });
            }

            case 'wbr-ai-summary-stream': {
                // Streaming version of AI summary
                const wbrDataStream = await wbrReport.generateWbrReport(false);
                if (!wbrDataStream || !wbrDataStream.sections) {
                    return NextResponse.json({ error: 'No WBR report data available.' }, { status: 400 });
                }

                const todayStream = new Date(new Date().toDateString());
                const allGoalsStream = [];
                for (const section of wbrDataStream.sections) {
                    for (const goal of (section.goals || [])) allGoalsStream.push(goal);
                }
                const goalDetailsStream = allGoalsStream.map(goal => {
                    const children = goal.subtasks || [];
                    const closed = children.filter(s => s.status === 'Closed').length;
                    const total = children.length;
                    const pct = total > 0 ? Math.round((closed / total) * 100) : 0;
                    return `${goal.id} "${(goal.title || '').substring(0, 60)}" [${goal.statusColor}/${goal.status}] ECD:${goal.ecd} Tasks:${closed}/${total}(${pct}%)`;
                });

                const missedEcdStream = wbrDataStream.summary?.missedEcd || [];
                const goalsPassedEcdStream = allGoalsStream.filter(g => {
                    if (!g.ecd || g.ecd === 'Missing') return false;
                    try { const [mm,dd,yyyy] = g.ecd.split('-').map(Number); return new Date(yyyy,mm-1,dd) < todayStream; } catch(e) { return false; }
                }).map(g => `${g.id}(ECD:${g.ecd})`);

                const todayStrStream = new Date().toISOString().split('T')[0];
                const promptStream = `You are writing an executive status report for a Weekly Business Review (WBR). Write in Amazon style: data-first, short sentences, no filler words.

TODAY'S DATE: ${todayStrStream}
REPORTING PERIOD: ${wbrDataStream.subtitle}

GOAL SUMMARY:
- Total Goals: ${wbrDataStream.totalGoals}
- Status Colors: Green=${wbrDataStream.summary?.byColor?.Green||0}, Yellow=${wbrDataStream.summary?.byColor?.Yellow||0}, Red=${wbrDataStream.summary?.byColor?.Red||0}, Missing=${wbrDataStream.summary?.byColor?.Missing||0}
- Goals with passed ECD: ${goalsPassedEcdStream.length > 0 ? goalsPassedEcdStream.join('; ') : 'None'}
- Missed ECDs: ${missedEcdStream.length}

PER-GOAL DETAIL:
${goalDetailsStream.join('\n')}

Write a summary with these sections:
1. **Executive Summary** (2-3 sentences covering overall health)
2. **Key Risks** (bullet points with specific goal IDs and data)
3. **Positive Signals** (bullet points showing progress)
4. **Recommended Actions** (2-3 specific, actionable items)

Be specific. Use goal IDs. Quote numbers. Do not be generic.
CRITICAL: Be completely grounded in facts — every claim must reference specific data from above. Do NOT hallucinate or infer beyond the provided data. If uncertain, say so.`;

                // Use Bedrock Opus if available, otherwise fall back to Ollama
                const bedrockClient = require('../../../services/bedrock-client');
                const ollamaStream = require('../../../services/ollama-client');
                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            if (bedrockClient.isAvailable()) {
                                // Bedrock Opus streaming
                                await bedrockClient.streamGenerate(promptStream, (chunk) => {
                                    controller.enqueue(new TextEncoder().encode(chunk));
                                }, {
                                    system: 'You are an expert engineering manager writing a data-driven WBR goal health summary. Be factual. Cite goal IDs and numbers.',
                                    maxTokens: 8192,
                                });
                            } else {
                                // Ollama fallback
                                const response = await fetch('http://127.0.0.1:11434/api/generate', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ model: ollamaStream.getConfig().llmModel, prompt: promptStream, stream: true, think: false }),
                                });
                                const reader = response.body.getReader();
                                const decoder = new TextDecoder();
                                while (true) {
                                    const { done, value } = await reader.read();
                                    if (done) break;
                                    const chunk = decoder.decode(value, { stream: true });
                                    for (const line of chunk.split('\n').filter(Boolean)) {
                                        try {
                                            const json = JSON.parse(line);
                                            if (json.response) controller.enqueue(new TextEncoder().encode(json.response));
                                        } catch(e) {}
                                    }
                                }
                            }
                        } catch(e) {
                            controller.enqueue(new TextEncoder().encode(`\n\nError: ${e.message}`));
                        }
                        controller.close();
                    }
                });
                return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' } });
            }

            case 'wbr-ai-summary': {
                // Generate AI summary using WBR report data + Ollama (no depth scanning)
                const wbrData = await wbrReport.generateWbrReport(false);
                if (!wbrData || !wbrData.sections) {
                    return NextResponse.json({ error: 'No WBR report data available. Load Team Health first.' }, { status: 400 });
                }

                const today = new Date(new Date().toDateString());

                // Compile goal-level stats from WBR report (level-0 and level-1 only)
                const allGoals = [];
                for (const section of wbrData.sections) {
                    for (const goal of (section.goals || [])) allGoals.push(goal);
                }

                const goalDetails = allGoals.map(goal => {
                    const children = goal.subtasks || [];
                    const closed = children.filter(s => s.status === 'Closed').length;
                    const total = children.length;
                    const pct = total > 0 ? Math.round((closed / total) * 100) : 0;
                    return `${goal.id} "${(goal.title || '').substring(0, 60)}" [${goal.statusColor}/${goal.status}] ECD:${goal.ecd} Tasks:${closed}/${total}(${pct}%)`;
                });

                // Pre-compute stats
                const missedEcd = wbrData.summary?.missedEcd || [];
                const ecdChanges = wbrData.summary?.ecdChanges || { totalChanged: 0, slipped: [], pulledIn: [] };
                const totalTasks = allGoals.reduce((s, g) => s + (g.subtasks || []).length, 0);
                const closedTasks = allGoals.reduce((s, g) => s + (g.subtasks || []).filter(s => s.status === 'Closed').length, 0);
                const taskPct = totalTasks > 0 ? Math.round((closedTasks / totalTasks) * 100) : 0;

                // Goals with passed ECDs
                const goalsWithPassedEcd = allGoals.filter(g => {
                    if (!g.ecd || g.ecd === 'Missing') return false;
                    try {
                        const [mm, dd, yyyy] = g.ecd.split('-').map(Number);
                        return new Date(yyyy, mm - 1, dd) < today;
                    } catch(e) { return false; }
                }).map(g => `${g.id}(ECD:${g.ecd})`);

                const ollama = require('../../../services/ollama-client');
                const todayStr = new Date().toISOString().split('T')[0];

                const prompt = `You are writing an executive status report for a Weekly Business Review (WBR). Write in Amazon style: data-first, short sentences, no filler words.

TODAY'S DATE: ${todayStr}
REPORTING PERIOD: ${wbrData.subtitle}

GOAL SUMMARY:
- Total Goals: ${wbrData.totalGoals}
- Status Colors: Green=${wbrData.summary?.byColor?.Green||0}, Yellow=${wbrData.summary?.byColor?.Yellow||0}, Red=${wbrData.summary?.byColor?.Red||0}, Missing=${wbrData.summary?.byColor?.Missing||0}
- Blocked Goals: ${allGoals.filter(g => g.status === 'Blocked').length > 0 ? allGoals.filter(g => g.status === 'Blocked').map(g => g.id).join(', ') : 'None'}
- Goals with passed ECD: ${goalsWithPassedEcd.length > 0 ? goalsWithPassedEcd.join('; ') : 'None'}
- Missed ECDs: ${missedEcd.length} (${missedEcd.filter(e => e.type === 'goal').length} goals, ${missedEcd.filter(e => e.type === 'child').length} tasks)
- ECD Drift: ${ecdChanges.slipped?.length || 0} slipped, ${ecdChanges.pulledIn?.length || 0} pulled in
- Task Completion: ${closedTasks}/${totalTasks} (${taskPct}%)

PER-GOAL DETAIL:
${goalDetails.join('\n')}

Write a summary with these sections:
1. **Executive Summary** (2-3 sentences covering overall health)
2. **Key Risks** (bullet points with specific goal IDs and data)
3. **Positive Signals** (bullet points showing progress)
4. **Recommended Actions** (2-3 specific, actionable items)

Be specific. Use goal IDs. Quote numbers. Do not be generic.`;

                try {
                    const aiResult = await ollama.generate(prompt, { temperature: 0.3 });
                    data = {
                        summary: aiResult,
                        generatedAt: new Date().toISOString(),
                        tasksScanned: allGoals.length,
                    };
                } catch (aiError) {
                    data = {
                        summary: null,
                        error: `AI generation failed: ${aiError.message}`,
                        generatedAt: new Date().toISOString(),
                    };
                }
                break;
            }

            case 'staff-meeting-doc': {
                // Generate and return a .docx Staff Meeting document
                const { Document: DocxDocument, Packer: DocxPacker, Paragraph: DocxParagraph, Table: DocxTable, TableRow: DocxTableRow, TableCell: DocxTableCell, TextRun: DocxTextRun, HeadingLevel: DocxHeading, AlignmentType: DocxAlign, WidthType: DocxWidth, ShadingType: DocxShading } = await import('docx');
                
                const hc = (text, bg = '1A1A2E') => new DocxTableCell({ shading: { type: DocxShading.SOLID, color: bg, fill: bg }, children: [new DocxParagraph({ children: [new DocxTextRun({ text, bold: true, size: 20, color: 'FFFFFF', font: 'Calibri' })] })] });
                const tc = (text, opts = {}) => new DocxTableCell({ children: [new DocxParagraph({ children: [new DocxTextRun({ text: String(text || '—'), size: opts.size || 20, bold: opts.bold, color: opts.color, font: 'Calibri', italics: opts.italics })] })] });

                // Fetch all data
                const wbrDoc = await wbrReport.generateWbrReport(false);
                const allGoalsDoc = (wbrDoc?.sections || []).flatMap(s => s.goals || []).concat(wbrDoc?.projectTasks || []);
                const seenDoc = new Set(); const goalsDoc = [];
                for (const g of allGoalsDoc) { if (!seenDoc.has(g.id)) { seenDoc.add(g.id); goalsDoc.push(g); } }

                const engMetrics = require('../../../services/eng-metrics');
                await engMetrics.init();
                const dashDoc = await engMetrics.getOrgDashboard().catch(() => null);

                const ticketHealth = require('../../../services/ticket-health');
                const ticketsDoc = await ticketHealth.buildDashboard().catch(() => null);

                // Fetch comments
                const mcpClientDoc = require('../../../services/mcp-client');
                const commentsDoc = {};
                for (const g of goalsDoc) {
                    try {
                        const r = await mcpClientDoc.callTool('builder-mcp', 'ReadInternalWebsites', { inputs: [`https://taskei.amazon.dev/tasks/${g.id}`] });
                        if (Array.isArray(r?.content)) {
                            for (const item of r.content) {
                                let outer = null;
                                if (item?.text) { try { outer = JSON.parse(item.text); } catch(e) {} }
                                if (!outer) continue;
                                const inner = outer?.content || [outer];
                                const arr = Array.isArray(inner) ? inner : [inner];
                                for (const el of arr) {
                                    if (el?.combinedThread?.items) {
                                        const lc = el.combinedThread.items.filter(ti => ti.payload?.type === 'COMMENT').slice(0, 1).map(ti => ({ message: ti.payload.comment.message, author: ti.payload.comment.author?.name || '?', date: ti.payload.comment.createDate }));
                                        if (lc.length) commentsDoc[g.id] = lc;
                                        break;
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }

                const now = new Date();
                const wn = Math.ceil((((now - new Date(now.getFullYear(),0,1)) / 86400000) + new Date(now.getFullYear(),0,1).getDay() + 1) / 7);
                const titleDoc = `Staff Meeting Report — Week ${wn} (${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`;

                // Build goal children
                const gc = [];
                for (const g of goalsDoc) {
                    const sc = g.statusColor || 'Missing';
                    const scC = sc === 'Green' ? '30D158' : sc === 'Yellow' ? 'FF9F0A' : sc === 'Red' ? 'FF453A' : '666666';
                    gc.push(new DocxParagraph({ spacing: { before: 200 }, children: [new DocxTextRun({ text: g.id, bold: true, size: 24, color: '6366F1' }), new DocxTextRun({ text: `  ${g.title}`, bold: true, size: 22 })] }));
                    gc.push(new DocxParagraph({ children: [new DocxTextRun({ text: `Status: `, size: 20, color: '888888' }), new DocxTextRun({ text: sc, bold: true, size: 20, color: scC }), new DocxTextRun({ text: `  |  ECD: ${g.ecd || 'Missing'}  |  PMT: ${g.quad?.pmt || '—'}  |  Theme: ${g.theme || '—'}`, size: 20, color: '888888' })] }));
                    if (g.announcement) gc.push(new DocxParagraph({ children: [new DocxTextRun({ text: `📢 (${g.announcement.date}): ${g.announcement.text?.substring(0, 400) || ''}`, size: 18, color: '0A84FF' })] }));
                    if (g.pathToGreen) gc.push(new DocxParagraph({ children: [new DocxTextRun({ text: `⚠️ Path to Green: ${g.pathToGreen.substring(0, 400)}`, size: 18, color: 'FF453A' })] }));
                    const lc = commentsDoc[g.id];
                    if (lc?.length) { const l = lc[0]; const d = l.date ? new Date(l.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; gc.push(new DocxParagraph({ children: [new DocxTextRun({ text: `💬 ${d} by ${l.author}: `, bold: true, size: 18, color: '0A84FF' }), new DocxTextRun({ text: l.message?.substring(0, 600) || '', size: 18, color: '333333' })] })); }
                    if (g.subtasks?.length) {
                        gc.push(new DocxTable({ width: { size: 100, type: DocxWidth.PERCENTAGE }, rows: [new DocxTableRow({ children: [hc('ID','2D2D44'), hc('Title','2D2D44'), hc('Status','2D2D44'), hc('Assignee','2D2D44'), hc('ECD','2D2D44')] }), ...g.subtasks.slice(0, 20).map(s => new DocxTableRow({ children: [tc(s.id, { color: '6366F1', size: 18 }), tc((s.title||'').substring(0,50), { size: 18 }), tc(s.status||'Open', { size: 18 }), tc(s.assignee||'—', { size: 18 }), tc(s.ecd||'—', { size: 18 })] }))] }));
                    }
                    gc.push(new DocxParagraph({ children: [new DocxTextRun({ text: '─'.repeat(60), size: 12, color: 'DDDDDD' })] }));
                }

                const doc = new DocxDocument({ creator: 'InGen', title: titleDoc, sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children: [
                    new DocxParagraph({ heading: DocxHeading.HEADING_1, children: [new DocxTextRun({ text: titleDoc, bold: true, size: 32 })] }),
                    new DocxParagraph({ children: [new DocxTextRun({ text: `Generated by InGen · ${now.toLocaleString()}`, italics: true, size: 18, color: '666666' })] }),
                    new DocxParagraph({ text: '' }),
                    new DocxParagraph({ heading: DocxHeading.HEADING_2, children: [new DocxTextRun({ text: `🎯 Goals (${goalsDoc.length})`, bold: true, size: 28, color: '7C3AED' })] }),
                    ...gc,
                    ...(dashDoc && !dashDoc.empty ? [
                        new DocxParagraph({ heading: DocxHeading.HEADING_2, children: [new DocxTextRun({ text: '📊 Code Metrics', bold: true, size: 28, color: '0A84FF' })] }),
                        new DocxTable({ width: { size: 100, type: DocxWidth.PERCENTAGE }, rows: [new DocxTableRow({ children: ['Engineer','CRs','Reviewed','Ratio'].map(h => hc(h, '0A1628')) }), ...(dashDoc.engineers||[]).map(e => new DocxTableRow({ children: [tc(`${e.name} (${e.alias})`, { size: 18 }), tc(e.crsCreated, { bold: true, size: 18 }), tc(e.crsReviewed, { size: 18 }), tc(e.reviewRatioDisplay||'—', { size: 18 })] }))] }),
                    ] : []),
                    ...(ticketsDoc && !ticketsDoc.empty ? [
                        new DocxParagraph({ heading: DocxHeading.HEADING_2, children: [new DocxTextRun({ text: '🎫 Tickets', bold: true, size: 28, color: '22D3EE' })] }),
                        new DocxTable({ width: { size: 100, type: DocxWidth.PERCENTAGE }, rows: [new DocxTableRow({ children: ['Group','Open','Resolved','Oldest'].map(h => hc(h, '0A2832')) }), ...(ticketsDoc.groups||[]).map(g => new DocxTableRow({ children: [tc(g.name, { bold: true, size: 18 }), tc(g.open, { size: 18 }), tc(g.resolved30d||0, { size: 18 }), tc(g.oldestAge>0?`${g.oldestAge}d`:'—', { size: 18 })] }))] }),
                    ] : []),
                ] }] });

                const buffer = await DocxPacker.toBuffer(doc);
                const fn = `Staff-Meeting-W${wn}-${now.toISOString().split('T')[0]}.docx`;
                return new Response(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${fn}"` } });
            }

            case 'goal-comments': {
                // Fetch latest comments for goal IDs — one at a time for reliable parsing
                const goalIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];
                if (goalIds.length === 0) {
                    return NextResponse.json({ error: 'ids parameter required' }, { status: 400 });
                }
                const mcpClient = require('../../../services/mcp-client');
                const comments = {};
                // Process each goal individually for reliable combinedThread extraction
                for (const goalId of goalIds) {
                    try {
                        const result = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', {
                            inputs: [`https://taskei.amazon.dev/tasks/${goalId}`]
                        });
                        const content = result?.content;
                        if (Array.isArray(content)) {
                            for (const item of content) {
                                try {
                                    // MCP content blocks: {type:"text", text:"{\"type\":\"json\",\"content\":[{\"combinedThread\":...}]}"}
                                    let outer = null;
                                    if (item?.text) { try { outer = JSON.parse(item.text); } catch(e) {} }
                                    else if (typeof item === 'string') { try { outer = JSON.parse(item); } catch(e) {} }
                                    else { outer = item; }
                                    if (!outer) continue;
                                    // Unwrap the inner content array if present
                                    const innerItems = outer?.content || [outer];
                                    const arr = Array.isArray(innerItems) ? innerItems : [innerItems];
                                    let thread = null;
                                    for (const inner of arr) {
                                        if (inner?.combinedThread?.items) { thread = inner.combinedThread.items; break; }
                                    }
                                    if (thread) {
                                        const latestComments = thread
                                            .filter(ti => ti.payload?.type === 'COMMENT')
                                            .slice(0, 2)
                                            .map(ti => ({
                                                message: ti.payload.comment.message,
                                                author: ti.payload.comment.author?.name || 'Unknown',
                                                date: ti.payload.comment.createDate,
                                            }));
                                        if (latestComments.length > 0) {
                                            comments[goalId] = latestComments;
                                        }
                                        break; // Found comments, no need to check other blocks
                                    }
                                } catch (e) { /* skip */ }
                            }
                        }
                    } catch (e) { /* skip failed goals */ }
                }
                data = { comments, fetched: goalIds.length };
                break;
            }

            case 'sde3-focus': {
                const sde3Focus = require('../../../services/sde3-focus');
                const refresh = searchParams.get('refresh') === 'true';
                const result = await sde3Focus.getSDE3FocusData(refresh);
                data = result;
                break;
            }

            case 'subtasks': {
                // Hybrid approach:
                //   1. If the alias is a top-level WBR goal → serve from cache instantly (no API calls).
                //      Child goals (e.g. CPP2026Goal-14) are also in the cache and are inlined at depth+1.
                //   2. If the alias is NOT a WBR goal (e.g. a milestone CPP-46078) → make one
                //      TaskeiGetTask call to get that item's direct children (for lazy-expand in Team Health).
                if (!alias) {
                    return NextResponse.json({ error: 'alias parameter required (issue ID)' }, { status: 400 });
                }

                const mcpClient = require('../../../services/mcp-client');

                // Retry helper for single-item TaskeiGetTask calls
                const callWithRetry = async (taskId, maxRetries = 3) => {
                    for (let attempt = 0; attempt < maxRetries; attempt++) {
                        if (attempt > 0) {
                            const delay = 1500 * Math.pow(2, attempt - 1);
                            await new Promise(r => setTimeout(r, delay));
                        }
                        const res = await mcpClient.callTool('builder-mcp', 'TaskeiGetTask', {
                            taskId,
                            includeCustomAttributes: false,
                            commentLimit: 0
                        });
                        const txt = res.content?.map(c => c.text || '').join('') || '{}';
                        const parsed = JSON.parse(txt);
                        if (parsed.error && String(parsed.error).includes('Throttling')) {
                            if (attempt === maxRetries - 1) throw new Error(`ThrottlingException after ${maxRetries} retries`);
                            continue;
                        }
                        return parsed;
                    }
                };

                const fmtDate = (d) => {
                    if (!d) return 'Missing';
                    try {
                        const dt = new Date(d);
                        return `${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}-${dt.getFullYear()}`;
                    } catch(e) { return 'Missing'; }
                };

                try {
                    // Always load WBR cache for goal lookup (returns from cache instantly)
                    const wbrData = await wbrReport.generateWbrReport(false);
                    const allWbrGoals = (wbrData?.sections || []).flatMap(s => s.goals || []);
                    const goalById = new Map(allWbrGoals.map(g => [g.id, g]));

                    const rootGoal = goalById.get(alias);

                    if (rootGoal) {
                        // ── PATH 1: WBR goal → serve from cache (0 API calls) ──
                        const parentRow = {
                            id: rootGoal.id,
                            title: rootGoal.title || '',
                            status: rootGoal.status || 'Open',
                            workflowAction: '',
                            assignee: rootGoal.assignee || 'unassigned',
                            assigneeName: rootGoal.assigneeName || '',
                            ecd: rootGoal.ecd || 'Missing',
                            priority: 'P3',
                            blocked: rootGoal.blocked || false,
                            isParent: true,
                            depth: 0,
                        };

                        const rows = [];
                        for (const s of (rootGoal.subtasks || [])) {
                            const childGoal = goalById.get(s.id);
                            rows.push({
                                id: s.id,
                                title: s.title || s.name || '',
                                status: s.status || 'Open',
                                workflowAction: '',
                                assignee: s.assignee || 'unassigned',
                                assigneeName: s.assigneeName || '',
                                ecd: s.ecd || 'Missing',
                                priority: '—',
                                blocked: false,
                                depth: 1,
                            });
                            // If depth-1 item is itself a WBR goal, inline its children at depth 2
                            if (childGoal && (childGoal.subtasks || []).length > 0) {
                                for (const gs of childGoal.subtasks) {
                                    rows.push({
                                        id: gs.id,
                                        title: gs.title || gs.name || '',
                                        status: gs.status || 'Open',
                                        workflowAction: '',
                                        assignee: gs.assignee || 'unassigned',
                                        assigneeName: gs.assigneeName || '',
                                        ecd: gs.ecd || 'Missing',
                                        priority: '—',
                                        blocked: false,
                                        depth: 2,
                                    });
                                }
                            }
                        }

                        data = {
                            id: rootGoal.id,
                            name: rootGoal.title || '',
                            status: rootGoal.status || 'Open',
                            workflowAction: '',
                            ecd: rootGoal.ecd || 'Missing',
                            subtasks: [parentRow, ...rows],
                            _source: 'wbr-cache',
                        };
                    } else {
                        // ── PATH 2: non-goal item (milestone/task) → single TaskeiGetTask call ──
                        const taskData = await callWithRetry(alias);
                        const t = taskData.task || taskData.data?.task || taskData.data || (taskData.error ? {} : taskData) || {};

                        const parentRow = {
                            id: t.shortId || t.id || alias,
                            title: t.name || '',
                            status: t.status || 'Open',
                            workflowAction: t.workflowAction || '',
                            assignee: t.assignee?.username || 'unassigned',
                            assigneeName: t.assignee?.name || '',
                            ecd: fmtDate(t.estimatedCompletionDate),
                            priority: t.classicPriority || t.priority || 'P3',
                            blocked: !!t.blocked || t.status === 'Blocked',
                            isParent: true,
                            depth: 0,
                        };

                        const children = [...(t.subtasks || []), ...(t.children || []), ...(t.childGoals || [])];
                        const rows = children.map(s => ({
                            id: s.shortId || s.id,
                            title: s.name || '',
                            status: s.status || 'Open',
                            workflowAction: s.workflowAction || '',
                            assignee: s.assignee?.username || 'unassigned',
                            assigneeName: s.assignee?.name || '',
                            ecd: fmtDate(s.estimatedCompletionDate),
                            priority: s.classicPriority || '—',
                            blocked: !!s.blocked || s.status === 'Blocked',
                            depth: 1,
                        }));

                        data = {
                            id: t.shortId || t.id || alias,
                            name: t.name || '',
                            status: t.status || 'Open',
                            workflowAction: t.workflowAction || '',
                            ecd: fmtDate(t.estimatedCompletionDate),
                            subtasks: [parentRow, ...rows],
                            _source: 'taskei-live',
                        };
                    }
                } catch (e) {
                    data = { id: alias, subtasks: [], error: e.message };
                }
                break;
            }

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }

        return NextResponse.json({ view, data });
    } catch (error) {
        console.error('[API/Team] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST handler — AI summary generation for SDE3 focus data
export async function POST(request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view');

        if (view === 'sde3-summary') {
            const body = await request.json();
            const sde3s = body.sde3s || [];
            const logger = require('../../../services/logger').child('SDE3-Summary');

            if (sde3s.length === 0) {
                return NextResponse.json({ summary: 'No SDE3 data available for summarization.' });
            }

            // Build an enriched prompt: include topDeliverables (project names) + parentGoalTitle per task
            const lines = sde3s.map(s => {
                const deliverables = (s.topDeliverables || [])
                    .map(d => d.title)
                    .filter(t => t && t !== 'Other Deliverables' && t !== 'Task')
                    .join(', ');
                const taskList = s.tasks.slice(0, 12).map(t => {
                    const proj = (t.parentGoalTitle && t.parentGoalTitle !== 'Other Deliverables' && t.parentGoalTitle !== 'Task')
                        ? ` [${t.parentGoalTitle}]` : '';
                    return t.title + proj;
                }).join('; ');
                const openCount = s.tasks.filter(t => t.status !== 'Closed').length;
                const closedCount = s.tasks.filter(t => t.status === 'Closed').length;
                return `${s.name} (@${s.alias}):\n  Projects: ${deliverables || 'unknown'}\n  Tasks (${openCount} open, ${closedCount} closed this year): ${taskList || 'no active tasks'}`;
            }).join('\n\n');

            const systemPrompt = `You are an engineering manager's assistant analytical AI. Given a list of senior engineers, their project areas, and their assigned tickets/tasks, provide a per-engineer summary.

For each engineer, write 2-3 sentences:
1. Name the project(s) they are working on — always use the "Projects:" field first, then reinforce with any [bracketed project names] found in task titles.
2. Describe what they are specifically doing within those projects (reference concrete task titles where helpful).
3. Note their workload pattern (e.g. number of open tasks, whether they are closing work out, or appear overloaded).

Format: each engineer's name in bold, followed by their paragraph. Example: "**Deqian Chen**: He is primarily focused on the Drift Detection project, working on..."
Do not provide an overarching team summary — only the per-engineer breakdown.`;

            const userPrompt = `Here are the senior engineers, their projects, and current tasks:\n\n${lines}\n\nProvide the per-engineer summary.`;

            try {
                // Prefer Bedrock (Claude) directly — fast, no Ollama dependency
                const bedrockClient = require('../../../services/bedrock-client');
                let summary = '';
                if (bedrockClient.isAvailable()) {
                    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
                    summary = (await bedrockClient.generate(fullPrompt, { temperature: 0.3 }) || '').trim();
                } else {
                    // Bedrock not configured — fall back to Ollama if running
                    const { generateCompletion } = await import('../../../services/ai.js');
                    summary = (await generateCompletion(systemPrompt, userPrompt, false, 0.3) || '').trim();
                }
                logger.info(`Generated AI summary (${summary.length} chars)`);
                return NextResponse.json({ summary });
            } catch (e) {
                logger.error(`AI summary generation failed: ${e.message}`);
                const totalTasks = sde3s.reduce((sum, s) => sum + s.tasks.length, 0);
                const fallback = `${sde3s.length} senior engineers are managing ${totalTasks} active tasks across the organization. AI summary temporarily unavailable.`;
                return NextResponse.json({ summary: fallback, fallback: true });
            }
        }

        return NextResponse.json({ error: `Unknown POST view: ${view}` }, { status: 400 });
    } catch (error) {
        console.error('[API/Team] POST Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}