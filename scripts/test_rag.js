
// require('dotenv').config({ path: '.env.local' }); // Using --env-file instead
const vectorStore = require('../services/vector-store');

// Mock Incoming Email
const mockEmail = {
    from: { name: "Nisha", email: "nisha@example.com" },
    subject: "Drift Detection Update",
    body: "Hi Sankalp, can we get an update on the Drift Detection metrics? Are we on track for the review?",
    snippet: "Hi Sankalp, can we get an update on the Drift Detection metrics? Are we on track for the review?"
};

async function runTest() {
    console.log('--- Testing RAG Search ---');
    try {
        await vectorStore.init();
        const query = `Subject: ${mockEmail.subject}\n\n${mockEmail.body}`;
        console.log(`Querying: "${mockEmail.subject}"`);

        const hits = await vectorStore.search(query, 3);
        console.log(`Found ${hits.length} hits:`);
        hits.forEach((hit, i) => {
            console.log(`[${i + 1}] ${hit.subject} (Dist: ${hit.distance})`);
            console.log(`    Snippet: ${hit.snippet.substring(0, 100)}...`);
        });

        console.log('\n--- Testing AI Draft Generation ---');
        // generateDraft is an ES module export, but we are in CommonJS land here if running via node.
        // services/ai.js is likely ESM (import/export).
        // If the project is mixed, this script might fail.
        // Let's create this script as ESM (.mjs) or ensure package.json allows it.
        // The project seems to use "type": "module" implicit or Babel?
        // Actually, previous scripts (ingest_history.js) used require().
        // But services/ai.js uses `import`.
        // If I require() an ESM file, it might explode.

        // Strategy: Use dynamic import()
        const aiService = await import('../services/ai.js');
        const draft = await aiService.generateDraft(mockEmail, "Reply confirming we are on track and will discuss in the weekly sync.");

        console.log('\nGenerated Draft:');
        console.log(draft);

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

runTest();
