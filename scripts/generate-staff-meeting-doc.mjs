#!/usr/bin/env node
/**
 * Generate Staff Meeting Word Document with full data
 * Includes: Goal Health (all goals + announcements + subtasks), Code Metrics, Ticket Health
 * Usage: node scripts/generate-staff-meeting-doc.mjs
 */

import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, AlignmentType, WidthType, ShadingType } from 'docx';
import fs from 'fs';

const BASE = 'http://localhost:3000';

async function fetchJSON(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { console.error(`Failed: ${url}`, e.message); return null; }
}

function cell(text, opts = {}) {
    return new TableCell({
        ...(opts.shading ? { shading: opts.shading } : {}),
        ...(opts.width ? { width: { size: opts.width, type: WidthType.PERCENTAGE } } : {}),
        children: [new Paragraph({ children: [new TextRun({ text: String(text || '—'), size: opts.size || 20, bold: opts.bold, color: opts.color, font: 'Calibri', italics: opts.italics })] })],
    });
}

function headerCell(text, bg = '1A1A2E') {
    return new TableCell({
        shading: { type: ShadingType.SOLID, color: bg, fill: bg },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: 'FFFFFF', font: 'Calibri' })] })],
    });
}

async function main() {
    console.log('📊 Fetching data from all three sources...\n');

    // Use cached WBR data (refresh=true for first run, cached after)
    const wbrRes = await fetchJSON(`${BASE}/api/team?view=wbr`);
    const wbr = wbrRes?.data;
    const allGoals = (wbr?.sections || []).flatMap(s => s.goals || []).concat(wbr?.projectTasks || []);
    // Deduplicate
    const seen = new Set();
    const goals = [];
    for (const g of allGoals) { if (!seen.has(g.id)) { seen.add(g.id); goals.push(g); } }
    console.log(`✅ Goals: ${goals.length} goals loaded (from ${wbr?.totalGoals || 0} reported)`);

    const dashRes = await fetchJSON(`${BASE}/api/eng-metrics?view=dashboard`);
    const dash = dashRes?.data;
    console.log(`✅ Code Metrics: ${dash?.totalEngineers || 0} engineers loaded`);

    const ticketRes = await fetchJSON(`${BASE}/api/ticket-health?view=dashboard`);
    const tickets = ticketRes?.data;
    console.log(`✅ Tickets: ${tickets?.summary?.totalOpen || 0} open tickets loaded`);

    const now = new Date();
    const weekNum = Math.ceil((((now - new Date(now.getFullYear(), 0, 1)) / 86400000) + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
    const title = `Staff Meeting Report — Week ${weekNum} (${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})`;
    // 4. Fetch latest comments for all goals (batched)
    console.log('\n💬 Fetching latest comments for goals...');
    const goalComments = {};
    const batchSize = 10;
    for (let i = 0; i < goals.length; i += batchSize) {
        const batch = goals.slice(i, i + batchSize).map(g => g.id);
        const commentsRes = await fetchJSON(`${BASE}/api/team?view=goal-comments&ids=${batch.join(',')}`);
        if (commentsRes?.data?.comments) {
            Object.assign(goalComments, commentsRes.data.comments);
        }
        console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${Object.keys(goalComments).length} goals with comments`);
    }
    console.log(`✅ Comments: ${Object.keys(goalComments).length} goals have comments`);

    console.log(`\n📝 Generating: ${title} with ${goals.length} goals\n`);

    // ─── Build goal detail rows ───
    const goalChildren = [];
    for (const g of goals) {
        const sc = g.statusColor || 'Missing';
        const scColor = sc === 'Green' ? '30D158' : sc === 'Yellow' ? 'FF9F0A' : sc === 'Red' ? 'FF453A' : '666666';

        // Goal header
        goalChildren.push(new Paragraph({ spacing: { before: 200 }, children: [
            new TextRun({ text: `${g.id}`, bold: true, size: 24, color: '6366F1' }),
            new TextRun({ text: `  ${g.title}`, bold: true, size: 22 }),
        ] }));

        // Status line
        goalChildren.push(new Paragraph({ children: [
            new TextRun({ text: `Status: `, size: 20, color: '888888' }),
            new TextRun({ text: sc, bold: true, size: 20, color: scColor }),
            new TextRun({ text: `  |  ECD: `, size: 20, color: '888888' }),
            new TextRun({ text: g.ecd || 'Missing', size: 20, color: g.ecd && g.ecd !== 'Missing' ? '000000' : 'FF453A' }),
            new TextRun({ text: `  |  Type: `, size: 20, color: '888888' }),
            new TextRun({ text: g.goalType || '—', size: 20 }),
            new TextRun({ text: `  |  Theme: `, size: 20, color: '888888' }),
            new TextRun({ text: g.theme || '—', size: 20, italics: true }),
        ] }));

        // Quad
        goalChildren.push(new Paragraph({ children: [
            new TextRun({ text: `Quad — PM: ${g.quad?.pm || '—'}  |  PMT: ${g.quad?.pmt || '—'}  |  Tech: ${g.quad?.tech || '—'}  |  SDM: ${g.quad?.sdm || '—'}`, size: 18, color: '888888' }),
        ] }));

        // Description (truncated)
        if (g.description) {
            goalChildren.push(new Paragraph({ spacing: { before: 60 }, children: [
                new TextRun({ text: g.description.substring(0, 300) + (g.description.length > 300 ? '...' : ''), size: 18, color: '555555', italics: true }),
            ] }));
        }

        // Announcement
        if (g.announcement) {
            goalChildren.push(new Paragraph({ spacing: { before: 60 }, children: [
                new TextRun({ text: '📢 Announcement', bold: true, size: 18, color: '0A84FF' }),
                new TextRun({ text: ` (${g.announcement.date} by ${g.announcement.author}): `, size: 18, color: '888888' }),
                new TextRun({ text: g.announcement.text?.substring(0, 400) || '', size: 18, color: '333333' }),
            ] }));
        }

        // Path to Green
        if (g.pathToGreen) {
            goalChildren.push(new Paragraph({ spacing: { before: 60 }, children: [
                new TextRun({ text: '⚠️ Path to Green: ', bold: true, size: 18, color: 'FF453A' }),
                new TextRun({ text: g.pathToGreen.substring(0, 400), size: 18, color: 'CC3333' }),
            ] }));
        }

        // Latest Update (from combinedThread comments)
        const latestComments = goalComments[g.id];
        if (latestComments && latestComments.length > 0) {
            const latest = latestComments[0];
            const commentDate = latest.date ? new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            goalChildren.push(new Paragraph({ spacing: { before: 80 }, children: [
                new TextRun({ text: '💬 Latest Update', bold: true, size: 20, color: '0A84FF' }),
                new TextRun({ text: ` (${commentDate} by ${latest.author})`, size: 18, color: '888888' }),
            ] }));
            goalChildren.push(new Paragraph({ children: [
                new TextRun({ text: latest.message?.substring(0, 800) || '', size: 18, color: '333333' }),
            ] }));
        }

        // Subtasks (milestones/tasks)
        if (g.subtasks && g.subtasks.length > 0) {
            goalChildren.push(new Paragraph({ spacing: { before: 80 }, children: [
                new TextRun({ text: `📋 Tasks (${g.subtasks.length})`, bold: true, size: 18, color: '7C3AED' }),
            ] }));

            goalChildren.push(new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        tableHeader: true,
                        children: [headerCell('ID', '2D2D44'), headerCell('Title', '2D2D44'), headerCell('Status', '2D2D44'), headerCell('Assignee', '2D2D44'), headerCell('ECD', '2D2D44')],
                    }),
                    ...g.subtasks.slice(0, 30).map(s => {
                        const statusIcon = s.status === 'Closed' ? '✅' : s.status === 'Open' ? '🔵' : '📌';
                        return new TableRow({
                            children: [
                                cell(s.id, { size: 18, color: '6366F1' }),
                                cell((s.title || '').substring(0, 60), { size: 18 }),
                                cell(`${statusIcon} ${s.status || 'Open'}`, { size: 18 }),
                                cell(s.assignee || '—', { size: 18 }),
                                cell(s.ecd || '—', { size: 18 }),
                            ],
                        });
                    }),
                ],
            }));
            if (g.subtasks.length > 30) {
                goalChildren.push(new Paragraph({ children: [new TextRun({ text: `  + ${g.subtasks.length - 30} more tasks`, size: 16, color: '999999', italics: true })] }));
            }
        }

        // Separator
        goalChildren.push(new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: '─'.repeat(80), size: 14, color: 'DDDDDD' })] }));
    }

    // ─── Build Document ───
    const doc = new Document({
        creator: 'InGen SmartAI',
        title: title,
        sections: [{
            properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
            children: [
                // TITLE
                new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true, size: 32, font: 'Calibri' })] }),
                new Paragraph({ children: [new TextRun({ text: `Generated by InGen SmartAI · ${now.toLocaleString()}`, italics: true, size: 18, color: '666666' })] }),
                new Paragraph({ text: '' }),

                // SECTION 1: GOAL HEALTH
                new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `🎯 Goal Health (${goals.length} goals)`, bold: true, size: 28, color: '7C3AED' })] }),
                new Paragraph({ children: [
                    new TextRun({ text: `${wbr?.summary?.byColor?.Green || 0} Green`, bold: true, color: '30D158', size: 22 }),
                    new TextRun({ text: ` · `, size: 22 }),
                    new TextRun({ text: `${wbr?.summary?.byColor?.Yellow || 0} Yellow`, bold: true, color: 'FF9F0A', size: 22 }),
                    new TextRun({ text: ` · `, size: 22 }),
                    new TextRun({ text: `${wbr?.summary?.byColor?.Red || 0} Red`, bold: true, color: 'FF453A', size: 22 }),
                    new TextRun({ text: ` · ${wbr?.summary?.missedEcd?.length || 0} Missed ECD`, size: 22, color: 'FF453A' }),
                ] }),
                new Paragraph({ text: '' }),
                ...goalChildren,

                // SECTION 2: CODE METRICS
                new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '📊 Code Metrics', bold: true, size: 28, color: '0A84FF' })] }),
                ...(dash && !dash.empty ? [
                    new Paragraph({ children: [
                        new TextRun({ text: `${dash.weekId} · ${dash.totalEngineers} engineers · `, size: 22 }),
                        new TextRun({ text: `${dash.summary?.crsCreated?.value || 0} CRs Created`, bold: true, color: '0A84FF', size: 22 }),
                        new TextRun({ text: ` · `, size: 22 }),
                        new TextRun({ text: `${dash.summary?.crsReviewed?.value || 0} Reviewed`, bold: true, color: '30D158', size: 22 }),
                        new TextRun({ text: ` · `, size: 22 }),
                        new TextRun({ text: `${dash.summary?.staleCrs?.value || 0} Stale`, bold: true, color: 'FF453A', size: 22 }),
                    ] }),
                    new Paragraph({ text: '' }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            new TableRow({ tableHeader: true, children: ['Engineer', 'CRs Created', 'Reviewed', 'Ratio', 'Trend'].map(h => headerCell(h, '0A1628')) }),
                            ...(dash.engineers || []).map(e => new TableRow({ children: [
                                cell(`${e.name} (${e.alias})${e.decliningStreak ? ' ⚠️' : ''}`, { size: 18 }),
                                cell(e.crsCreated, { bold: true, size: 18, color: e.crsCreated >= 6 ? '30D158' : e.crsCreated >= 3 ? '666666' : 'FF9F0A' }),
                                cell(e.crsReviewed, { size: 18 }),
                                cell(e.reviewRatioDisplay || '—', { bold: true, size: 18, color: e.reviewRatio >= 1.5 ? '30D158' : e.reviewRatio >= 1.0 ? 'FF9F0A' : 'FF453A' }),
                                cell(e.crsCreatedDelta > 0 ? `▲ +${e.crsCreatedDelta}` : e.crsCreatedDelta < 0 ? `▼ ${e.crsCreatedDelta}` : '—', { size: 18, color: e.crsCreatedDelta > 0 ? '30D158' : e.crsCreatedDelta < 0 ? 'FF453A' : '999999' }),
                            ] })),
                        ],
                    }),
                ] : [new Paragraph({ text: 'No code metrics data.' })]),
                new Paragraph({ text: '' }),

                // SECTION 3: TICKET HEALTH
                new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '🎫 Ticket Health', bold: true, size: 28, color: '22D3EE' })] }),
                ...(tickets && !tickets.empty ? [
                    new Paragraph({ children: [
                        new TextRun({ text: `${tickets.summary?.totalOpen || 0} open · `, size: 22 }),
                        new TextRun({ text: `${tickets.summary?.aging14d || 0} aging >14d`, bold: true, color: 'FF9F0A', size: 22 }),
                        new TextRun({ text: ` · `, size: 22 }),
                        new TextRun({ text: `${tickets.summary?.totalResolved30d || 0} resolved (30d)`, bold: true, color: '30D158', size: 22 }),
                    ] }),
                    new Paragraph({ text: '' }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            new TableRow({ tableHeader: true, children: ['Group', 'Role', 'Open', 'Resolved', 'Oldest', 'Baseline'].map(h => headerCell(h, '0A2832')) }),
                            ...(tickets.groups || []).map(g => new TableRow({ children: [
                                cell(g.name, { bold: true, size: 18 }),
                                cell(g.role || '—', { size: 18 }),
                                cell(g.open, { bold: true, size: 18, color: g.open >= 10 ? 'FF453A' : g.open >= 5 ? 'FF9F0A' : '30D158' }),
                                cell(g.resolved30d || 0, { size: 18, color: '30D158' }),
                                cell(g.oldestAge > 0 ? `${g.oldestAge}d` : '—', { size: 18, color: g.oldestAge >= 30 ? 'FF453A' : '666666' }),
                                cell(g.baselineStatus === 'UP_TO_DATE' ? '✅' : '⚠️', { size: 18 }),
                            ] })),
                        ],
                    }),
                ] : [new Paragraph({ text: 'No ticket data.' })]),
                new Paragraph({ text: '' }),

                // FOOTER
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '— Generated by InGen SmartAI —', italics: true, size: 18, color: '999999' })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Upload to OneDrive · Use Word Online comments for collaboration', size: 16, color: 'BBBBBB' })] }),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `Staff-Meeting-W${weekNum}-${now.toISOString().split('T')[0]}.docx`;
    const filepath = `data/${filename}`;
    fs.writeFileSync(filepath, buffer);
    console.log(`\n✅ Document saved: ${filepath}`);
    console.log(`📄 Open with: open "${filepath}"`);
}

main().catch(console.error);