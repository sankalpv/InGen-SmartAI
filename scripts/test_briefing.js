require('dotenv').config({ path: '.env.local' });
// Mock fetch for Ollama if needed (Node 18+ has native fetch)

// We need to import the function. But services/ai.js is ES module format (export async function...).
// Node.js treats .js as CJS by default unless package.json says "type": "module".
// Our project seems to be using ES modules (Next.js).

// Let's try to import it using dynamic import() in an async IIFE.

(async () => {
    try {
        const { generateDailyBriefing } = await import('../services/ai.js');

        const emails = [
            { from: { name: "Boss" }, subject: "Urgent: Q1 Report", snippet: "Need this by EOD." },
            { from: { name: "Team" }, subject: "Lunch?", snippet: "Tacos sound good." },
            { from: { name: "Client" }, subject: "Proposal Feedback", snippet: "Looks great, let's proceed." }
        ];

        const meetings = [
            { title: "Team Sync", time: "10:00 AM" }
        ];

        console.log("Testing generateDailyBriefing...");
        const result = await generateDailyBriefing(emails, meetings, []);

        console.log("\n--- RESULT ---");
        console.log(JSON.stringify(result, null, 2));

    } catch (e) {
        console.error("Test Failed:", e);
    }
})();
