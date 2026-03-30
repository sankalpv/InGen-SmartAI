/**
 * Re-ingestion script — populates new sqlite-vec vector store from data/emails.json
 *
 * Run once after migrating from HNSW to sqlite-vec:
 *   node scripts/reingest-emails.js
 *
 * Options (env vars):
 *   SKIP_TAGGING=1   — skip AI tagging after ingestion (faster, tag later with backfill)
 *   BATCH_SIZE=10    — number of emails to embed concurrently (default 3)
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'emails.json');

async function main() {
    console.log('=== InGen Email Re-ingestion ===');
    console.log(`Source: ${DATA_FILE}`);

    // Load local store
    if (!fs.existsSync(DATA_FILE)) {
        console.error('ERROR: data/emails.json not found. Run a sync first.');
        process.exit(1);
    }

    const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const emails = store.data || [];
    console.log(`Found ${emails.length} emails in local store (updated: ${store.updatedAt})`);

    // Init vector store
    const vectorStore = require('../services/vector-store');
    await vectorStore.init();

    const before = vectorStore.getStats();
    console.log(`Vector DB before: ${before.totalDocuments} documents`);

    // Ingest
    console.log('\nStarting batch ingestion (3 concurrent embeddings)...');
    const startTime = Date.now();

    const result = await vectorStore.ingestEmailBatch(emails);

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`\nIngestion complete in ${elapsed}s:`);
    console.log(`  Ingested: ${result.ingested}`);
    console.log(`  Skipped:  ${result.skipped}`);
    console.log(`  Errors:   ${result.errors}`);

    const after = vectorStore.getStats();
    console.log(`\nVector DB after: ${after.totalDocuments} documents`);
    console.log(`DB size: ${(fs.statSync(path.join(process.cwd(), 'brain', 'vectors.db')).size / 1024 / 1024).toFixed(1)} MB`);

    // AI tagging (optional)
    if (process.env.SKIP_TAGGING !== '1' && result.ingested > 0) {
        console.log(`\nStarting AI tagging for ${result.ingested} new emails...`);
        console.log('(Using Claude Haiku via Bedrock, or local Ollama as fallback)');
        try {
            const emailTagger = require('../services/email-tagger');
            const tagResult = await emailTagger.backfillAll({ batchSize: 5, delayMs: 300 });
            console.log(`Tagging complete: ${tagResult.tagged} tagged, ${tagResult.errors} errors`);

            const final = vectorStore.getStats();
            console.log('\nFinal enrichment stats:');
            console.log(`  hasActionItem: ${final.withActionItems}`);
            console.log(`  requiresReply: ${final.requiresReply}`);
            console.log(`  withSentiment: ${final.withSentiment}`);
        } catch (e) {
            console.error('Tagging failed (non-fatal):', e.message);
            console.log('Run tagging later with: node -e "require(\'./services/email-tagger\').backfillAll()"');
        }
    } else if (process.env.SKIP_TAGGING === '1') {
        console.log('\nSkipping AI tagging (SKIP_TAGGING=1).');
        console.log('Run later: node -e "require(\'./services/email-tagger\').backfillAll()"');
    }

    console.log('\nDone!');
    process.exit(0);
}

main().catch(e => {
    console.error('Re-ingestion failed:', e.message);
    console.error(e.stack);
    process.exit(1);
});
