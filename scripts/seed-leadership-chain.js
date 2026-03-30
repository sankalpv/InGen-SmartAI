#!/usr/bin/env node
/**
 * Seed the leadership chain cache (brain/leadership-chain.json).
 * Run once after setup or when your management chain changes.
 *
 * Usage:  node scripts/seed-leadership-chain.js
 */
const path = require('path');
const fs = require('fs');

// Load settings for alias
const settingsPath = path.join(__dirname, '..', 'config', 'settings.json');
const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
const alias = settings.phonetoolAlias;
if (!alias) {
    console.error('No phonetoolAlias set in config/settings.json');
    process.exit(1);
}

const phonetool = require('../services/phonetool');

async function main() {
    console.log(`Fetching leadership chain for: ${alias}`);
    const chain = await phonetool.fetchLeadershipChain(alias, 4);
    if (chain.length === 0) {
        console.warn('No chain found — is amzn-mcp / builder-mcp running?');
    } else {
        console.log('\nLeadership chain:');
        chain.forEach(p => console.log(`  L${p.level}: ${p.name} (${p.alias}) <${p.email}>`));
        console.log(`\nSaved to brain/leadership-chain.json`);
    }
}

main().catch(e => {
    console.error('Failed:', e.message);
    process.exit(1);
});
