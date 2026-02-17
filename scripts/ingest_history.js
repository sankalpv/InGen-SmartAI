
const { exec } = require('child_process');
const util = require('util');
const path = require('path');
const vectorStore = require('../services/vector-store');

const execAsync = util.promisify(exec);

async function fetchFromFolder(folderName, limit) {
    console.log(`\n--- Fetching ${limit} items from "${folderName}" ---`);
    try {
        const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_outlook_folder.scpt');
        // Escape folder name just in case, though basic quotes work for now
        const command = `osascript "${scriptPath}" "${folderName}" ${limit}`;
        console.log(`Executing: ${command}`);

        const { stdout, stderr } = await execAsync(command);

        if (stderr) {
            console.warn('Script Stderr:', stderr);
        }

        const rawData = stdout.trim();
        if (!rawData || rawData === '[]') {
            console.log('No data found.');
            return [];
        }

        // SANITIZE: Remove control characters that JSON.parse hates (0x00-0x1F), 
        // except keeping \r, \n, \t (which are valid in JSON strings if escaped, 
        // but raw control chars are not).
        // Actually, AppleScript might output raw control chars.
        // Let's use a regex to strip non-printable ASCII chars that aren't common whitespace.
        // eslint-disable-next-line no-control-regex
        const cleanData = rawData.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]/g, '');

        try {
            const emails = JSON.parse(cleanData);
            if (emails.length > 0 && emails[0].error) {
                console.error(`Script returned error: ${emails[0].error}`);
                return [];
            }
            console.log(`Fetched ${emails.length} items.`);
            return emails;
        } catch (e) {
            console.error('JSON Parse Error:', e.message);
            console.log('Raw output start:', rawData.substring(0, 100));
            return [];
        }
    } catch (e) {
        console.error('Execution Error:', e);
        return [];
    }
}

async function ingestEmails(emails, sourceFolder) {
    if (!emails.length) return;

    console.log(`Ingesting ${emails.length} emails from ${sourceFolder}...`);
    let count = 0;

    for (const email of emails) {
        // Map fields to match VectorStore expectation
        // Script returns: id, subject, body, sender {name, email}, recipients, date, folder
        // VectorStore expects: id, subject, sender (string preferred), received, body

        let senderStr = 'Unknown';
        if (typeof email.sender === 'object') {
            senderStr = `${email.sender.name} <${email.sender.email}>`;
        } else {
            senderStr = email.sender;
        }

        const mappedEmail = {
            id: email.id,
            subject: email.subject || '(No Subject)',
            sender: senderStr,
            received: email.date,
            body: email.body || '',
            folder: sourceFolder,
            recipients: email.recipients // Optional, might be useful for metadata later
        };

        await vectorStore.ingestEmail(mappedEmail);
        count++;
        if (count % 10 === 0) process.stdout.write('.');
    }
    console.log(`\nFinished ingesting ${count} items from ${sourceFolder}.`);
}

async function run() {
    console.log('Starting Email History Ingestion...');

    // 1. Ingest Sent Items (Critical for style replication)
    // Try standard folder names
    let sentEmails = await fetchFromFolder("Sent Items", 200);
    if (sentEmails.length === 0) {
        console.log('Retrying with folder "Sent"...');
        sentEmails = await fetchFromFolder("Sent", 200);
    }
    await ingestEmails(sentEmails, 'Sent Items');

    // 2. Ingest Inbox (Critical for context)
    const inboxEmails = await fetchFromFolder("Inbox", 100);
    await ingestEmails(inboxEmails, 'Inbox');

    console.log('\nIngestion Complete.');
}

run();
