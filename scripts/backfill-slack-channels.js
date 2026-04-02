#!/usr/bin/env node
/**
 * Backfill Slack Channels into Vector Store
 * 
 * One-shot script to index the last N days of messages from configured
 * Slack channels into brain/vectors.db for semantic search.
 * 
 * Usage:
 *   node scripts/backfill-slack-channels.js                    # Full backfill
 *   node scripts/backfill-slack-channels.js --dry-run           # Preview only (no writes)
 *   node scripts/backfill-slack-channels.js --days 90           # Custom lookback
 *   node scripts/backfill-slack-channels.js --channels "#team-eng,#staff-eng"  # Override channels
 * 
 * Notes:
 *   - Rate limited: 1.2s between every Slack API call
 *   - Cursor is set only AFTER full successful completion per channel
 *   - Default lookback: 30 days (set to 90 for better "last quarter" recall)
 *   - Dry-run measures one real embedding to estimate total time
 */

const path = require('path');
const fs = require('fs');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const daysOverride = daysIdx >= 0 ? parseInt(args[daysIdx + 1]) : null;
const channelsIdx = args.indexOf('--channels');
const channelsOverride = channelsIdx >= 0
    ? args[channelsIdx + 1].split(',').map(c => c.trim())
    : null;

async function main() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║   InGen — Slack Channel Backfill               ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log();

    // Load config
    const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
    let settings;
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {
        console.error('❌ Cannot read config/settings.json:', e.message);
        process.exit(1);
    }

    const indexerConfig = settings.slackIndexer || {};
    const channels = channelsOverride || indexerConfig.channels || [];
    const lookbackDays = daysOverride || indexerConfig.lookbackDays || 30;

    if (channels.length === 0) {
        console.error('❌ No channels configured.');
        console.error('   Add channels to config/settings.json:');
        console.error('   "slackIndexer": { "enabled": true, "channels": ["#my-team", "#eng-leads"] }');
        console.error('   Or use: --channels "#team-eng,#staff-eng"');
        process.exit(1);
    }

    console.log(`Mode:       ${dryRun ? '🔍 DRY RUN (no writes)' : '💾 LIVE (writing to vectors.db)'}`);
    console.log(`Channels:   ${channels.join(', ')}`);
    console.log(`Lookback:   ${lookbackDays} days`);
    console.log();

    // Measure embedding speed on dry-run (time one real embedding call)
    let msPerEmbed = null;
    if (dryRun) {
        try {
            const ollamaClient = require('../services/ollama-client');
            const available = await ollamaClient.ping();
            if (available) {
                console.log('⏱  Measuring embedding speed on your hardware...');
                const testText = 'Sarah Chen: We need to move the auth service migration deadline to next quarter. The team is blocked on the IAM policy changes and we cannot ship without them.';
                const start = Date.now();
                await ollamaClient.embed(testText, { maxLength: 30000 });
                msPerEmbed = Date.now() - start;
                console.log(`   → ${msPerEmbed}ms per embedding`);
                console.log();
            }
        } catch (e) {
            console.log('   ⚠ Could not measure embedding speed (Ollama unavailable)');
            console.log();
        }
    }

    // Run the indexer
    const slackIndexer = require('../services/slack-indexer');
    const startTime = Date.now();

    try {
        const result = await slackIndexer.run({
            channels,
            lookbackDays,
            dryRun,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log();
        console.log('════════════════════════════════════════════════');
        console.log('  Results');
        console.log('════════════════════════════════════════════════');

        for (const [name, stats] of Object.entries(result.channels)) {
            const embedEstimate = (dryRun && msPerEmbed && stats.chunksIndexed > 0)
                ? ` (est. ~${Math.ceil(stats.chunksIndexed * msPerEmbed / 60000)} min to embed on your hardware)`
                : '';
            console.log(`  #${name}: ${stats.messagesProcessed} messages → ${stats.chunksIndexed} chunks${embedEstimate}`);
            if (stats.errors > 0) console.log(`    ⚠ ${stats.errors} errors`);
            if (stats.skipped > 0) console.log(`    ↩ ${stats.skipped} skipped (already indexed)`);
        }

        console.log();
        console.log(`  Total: ${result.totalChunks} chunks, ${result.totalMessages} messages, ${result.totalErrors} errors`);
        console.log(`  Time:  ${elapsed}s`);

        if (dryRun) {
            console.log();
            console.log('  ℹ  This was a dry run. No data was written.');
            console.log('  Run without --dry-run to index for real:');
            console.log(`  node scripts/backfill-slack-channels.js${daysOverride ? ` --days ${daysOverride}` : ''}`);
        } else if (result.totalChunks > 0) {
            console.log();
            console.log('  ✅ Backfill complete! Slack messages are now searchable via InGen.');
            console.log('  Try: "Hey InGen, find that doc Sarah shared about auth last week"');
        }

        console.log();

    } catch (e) {
        console.error(`\n❌ Backfill failed: ${e.message}`);
        console.error(e.stack);
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
