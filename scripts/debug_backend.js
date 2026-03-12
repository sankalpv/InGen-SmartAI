
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

async function testCalendar() {
    console.log('--- Testing Calendar Fetch ---');
    try {
        const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_calendar_local.scpt');
        console.log(`Running: osascript "${scriptPath}"`);
        const { stdout, stderr } = await execAsync(`osascript "${scriptPath}"`);

        console.log('STDERR:', stderr);
        console.log('STDOUT RAW LENGTH:', stdout.length);
        console.log('STDOUT RAW (First 100):', stdout.substring(0, 100));
        console.log('STDOUT RAW (Last 100):', stdout.substring(stdout.length - 100));

        try {
            const data = JSON.parse(stdout.trim());
            console.log('JSON PARSE SUCCESS. Items:', data.length);
            if (data.length > 0) {
                console.log('First Item:', JSON.stringify(data[0], null, 2));
            }
        } catch (e) {
            console.error('JSON PARSE FAILED:', e.message);
        }

    } catch (e) {
        console.error('EXEC FAILED:', e);
    }
}

async function testEmails() {
    console.log('\n--- Testing Email Fetch ---');
    try {
        // Updated to use the new AppleScript
        const scriptPath = path.resolve(process.cwd(), 'scripts/fetch_outlook_emails.scpt');
        console.log(`Running: osascript "${scriptPath}" 5`);
        const { stdout, stderr } = await execAsync(`osascript "${scriptPath}" 5`);

        console.log('STDERR:', stderr);
        console.log('STDOUT RAW LENGTH:', stdout.length);
        console.log('STDOUT RAW (First 100):', stdout.substring(0, 100));

        try {
            const data = JSON.parse(stdout.trim());
            console.log('JSON PARSE SUCCESS. Items:', data.length);
            if (data.length > 0) {
                console.log('First Item:', JSON.stringify(data[0], null, 2));
            }
        } catch (e) {
            console.error('JSON PARSE FAILED:', e.message);
        }

    } catch (e) {
        console.error('EXEC FAILED:', e);
    }
}

async function run() {
    await testCalendar();
    await testEmails();
}

run();
