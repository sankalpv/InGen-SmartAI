#!/usr/bin/env node
/**
 * Standalone backfill script for Engineering Metrics
 * 
 * Fetches code review metrics from code.amazon.com for all engineers in the org
 * for every week from Jan 1 of the current year to the current week.
 * 
 * Usage:
 *   node scripts/backfill-eng-metrics.js          # Backfill current year
 *   node scripts/backfill-eng-metrics.js 2025      # Backfill specific year
 */

const path = require('path');
process.chdir(path.join(__dirname, '..'));

async function main() {
    const year = parseInt(process.argv[2] || new Date().getFullYear());
    
    console.log(`\n📊 InGen — Engineering Metrics Backfill`);
    console.log(`${'─'.repeat(50)}`);
    console.log(`Year: ${year}`);
    console.log(`${'─'.repeat(50)}\n`);

    const engMetrics = require('../services/eng-metrics');
    
    // Check for missing weeks
    const missing = await engMetrics.getMissingWeeks(year);
    
    if (missing.length === 0) {
        console.log('✅ All weeks are up to date! No backfill needed.\n');
        process.exit(0);
    }

    console.log(`📅 Missing ${missing.length} weeks: ${missing[0]} to ${missing[missing.length - 1]}`);
    console.log(`🔄 Starting backfill...\n`);

    const startTime = Date.now();
    let lastWeek = '';

    const result = await engMetrics.backfillYear(year, (progress) => {
        if (progress.weekId !== lastWeek) {
            lastWeek = progress.weekId;
            console.log(`\n  📅 ${progress.weekId}`);
        }
        const pct = Math.round((progress.completed / progress.total) * 100);
        process.stdout.write(`\r    [${pct}%] ${progress.alias} (${progress.completed}/${progress.total})`);
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`\n\n${'─'.repeat(50)}`);
    console.log(`✅ Backfill complete!`);
    console.log(`   Weeks processed: ${result.weeksProcessed}`);
    console.log(`   Total fetches: ${result.totalFetches}`);
    console.log(`   Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
    console.log(`${'─'.repeat(50)}\n`);

    engMetrics.close();
    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Backfill failed:', err.message);
    process.exit(1);
});