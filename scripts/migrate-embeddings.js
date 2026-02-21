#!/usr/bin/env node

/**
 * Migration Script: nomic-embed-text (768d) → qwen3-embedding (4096d)
 * 
 * This script re-indexes all emails with the new embedding model.
 * Run this after updating to qwen3-embedding to rebuild the vector index.
 */

const fs = require('fs');
const path = require('path');
const ollamaClient = require('../services/ollama-client');

const OLD_METADATA_PATH = path.join(process.cwd(), 'brain', 'vector_metadata.json');
const OLD_INDEX_PATH = path.join(process.cwd(), 'brain', 'vector_index.bin');
const BACKUP_DIR = path.join(process.cwd(), 'brain', 'backup');
const NEW_VECTOR_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSIONS || '4096');

let HierarchicalNSW;
try {
    HierarchicalNSW = require('hnswlib-node').HierarchicalNSW;
} catch (e) {
    console.error('❌ hnswlib-node not installed. Run: npm install hnswlib-node');
    process.exit(1);
}

async function migrate() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Embedding Migration: 768d → 4096d');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Check if migration is needed
    if (!fs.existsSync(OLD_METADATA_PATH)) {
        console.log('✅ No existing vector store found. Nothing to migrate.');
        console.log('   The new vector store will be created automatically.\n');
        return;
    }

    // Step 2: Load old metadata
    console.log('📂 Loading old metadata...');
    let oldMetadata;
    try {
        oldMetadata = JSON.parse(fs.readFileSync(OLD_METADATA_PATH, 'utf8'));
    } catch (e) {
        console.error('❌ Failed to read old metadata:', e.message);
        process.exit(1);
    }

    const emailCount = Object.keys(oldMetadata).length;
    console.log(`   Found ${emailCount} emails in old vector store.\n`);

    if (emailCount === 0) {
        console.log('✅ Vector store is empty. Nothing to migrate.\n');
        return;
    }

    // Step 3: Backup old files
    console.log('💾 Creating backup...');
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupMetadataPath = path.join(BACKUP_DIR, `vector_metadata_${timestamp}.json`);
    
    try {
        fs.copyFileSync(OLD_METADATA_PATH, backupMetadataPath);
        if (fs.existsSync(OLD_INDEX_PATH)) {
            const backupIndexPath = path.join(BACKUP_DIR, `vector_index_${timestamp}.bin`);
            fs.copyFileSync(OLD_INDEX_PATH, backupIndexPath);
        }
        console.log(`   ✅ Backup saved to: brain/backup/`);
    } catch (e) {
        console.error('❌ Backup failed:', e.message);
        process.exit(1);
    }

    // Step 4: Verify Ollama connection
    console.log('\n🔌 Verifying Ollama connection...');
    const isAvailable = await ollamaClient.ping();
    if (!isAvailable) {
        console.error('❌ Cannot connect to Ollama. Is it running?');
        process.exit(1);
    }
    console.log('   ✅ Ollama connected');

    // Step 5: Create new index
    console.log(`\n🏗️  Creating new index (${NEW_VECTOR_DIMENSION} dimensions)...`);
    const newIndex = new HierarchicalNSW('l2', NEW_VECTOR_DIMENSION);
    newIndex.initIndex(10000);

    // Step 6: Re-embed all emails
    console.log(`\n🔄 Re-embedding ${emailCount} emails...`);
    console.log('   This may take a few minutes...\n');

    const newMetadata = {};
    let successCount = 0;
    let failCount = 0;

    const entries = Object.entries(oldMetadata);
    
    for (let i = 0; i < entries.length; i++) {
        const [id, email] = entries[i];
        
        try {
            // Reconstruct email text
            const textToEmbed = `Subject: ${email.subject}\nFrom: ${email.sender}\nDate: ${email.received}\n\n${email.fullBody || email.snippet}`;
            
            // Generate new embedding
            const embedding = await ollamaClient.embed(textToEmbed, { maxLength: 30000 });
            
            if (embedding.length !== NEW_VECTOR_DIMENSION) {
                throw new Error(`Dimension mismatch: ${embedding.length} !== ${NEW_VECTOR_DIMENSION}`);
            }
            
            // Add to new index
            newIndex.addPoint(embedding, parseInt(id));
            
            // Copy metadata (with enhancements for leadership features)
            newMetadata[id] = {
                ...email,
                type: email.type || 'email',
                snippet: (email.fullBody || email.snippet || '').substring(0, 500),
                // Leadership metadata
                hasActionItem: email.hasActionItem || false,
                hasDecision: email.hasDecision || false,
                hasBlocker: email.hasBlocker || false,
                sentiment: email.sentiment || null,
                topics: email.topics || []
            };
            
            successCount++;
            
            // Progress indicator
            if ((i + 1) % 10 === 0 || i === entries.length - 1) {
                const percent = ((i + 1) / entries.length * 100).toFixed(1);
                process.stdout.write(`\r   Progress: ${i + 1}/${entries.length} (${percent}%) - ${successCount} successful, ${failCount} failed`);
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (e) {
            failCount++;
            console.error(`\n   ⚠️  Failed to re-embed email ${id} (${email.subject}): ${e.message}`);
        }
    }
    
    console.log('\n');

    // Step 7: Save new index and metadata
    console.log('💾 Saving new vector store...');
    try {
        newIndex.writeIndexSync(OLD_INDEX_PATH);
        fs.writeFileSync(OLD_METADATA_PATH, JSON.stringify(newMetadata, null, 2));
        console.log('   ✅ Saved successfully\n');
    } catch (e) {
        console.error('❌ Failed to save:', e.message);
        console.error('   Your backup is safe in brain/backup/');
        process.exit(1);
    }

    // Step 8: Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Migration Complete!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`✅ Successfully migrated: ${successCount}/${emailCount} emails`);
    if (failCount > 0) {
        console.log(`⚠️  Failed: ${failCount} emails (see errors above)`);
    }
    console.log(`📐 New vector dimensions: ${NEW_VECTOR_DIMENSION}`);
    console.log(`💾 Backup location: brain/backup/\n`);
    console.log('Your vector store is now ready for leadership analytics!\n');
}

// Run migration
migrate().catch(error => {
    console.error('\n❌ Migration failed:', error);
    console.error('   Your backup is safe in brain/backup/');
    process.exit(1);
});