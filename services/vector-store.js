let HierarchicalNSW;
let VECTOR_STORE_AVAILABLE = false;
try {
    HierarchicalNSW = require('hnswlib-node').HierarchicalNSW;
    VECTOR_STORE_AVAILABLE = true;
} catch (e) {
    console.error('[VectorStore] hnswlib-node not available. Vector search disabled. Run: npm install');
}
const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('VectorStore');
const ollamaClient = require('./ollama-client');

// Configuration - Updated for qwen3-embedding (4096 dimensions)
const VECTOR_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSIONS || '4096');
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'qwen3-embedding';
const INDEX_PATH = path.join(process.cwd(), 'brain', 'vector_index.bin');
const METADATA_PATH = path.join(process.cwd(), 'brain', 'vector_metadata.json');
const BRAIN_DIR = path.join(process.cwd(), 'brain');

// Ensure brain dir exists
if (!fs.existsSync(BRAIN_DIR)) {
    fs.mkdirSync(BRAIN_DIR, { recursive: true });
}

class VectorStore {
    constructor() {
        this.index = null;
        this.metadata = {}; // ID -> Email Data
        this.currentId = 0;
        this.loaded = false;
    }

    async init() {
        if (this.loaded) return;
        if (!VECTOR_STORE_AVAILABLE) {
            logger.warn('Vector store unavailable (hnswlib-node missing). Skipping init.');
            return;
        }

        // Load Metadata
        if (fs.existsSync(METADATA_PATH)) {
            try {
                this.metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
                // Find max ID
                const ids = Object.keys(this.metadata).map(Number);
                this.currentId = ids.length > 0 ? Math.max(...ids) + 1 : 0;
            } catch (e) {
                console.error('Failed to load metadata:', e);
                this.metadata = {};
            }
        }

        // Initialize Index
        this.index = new HierarchicalNSW('l2', VECTOR_DIMENSION);

        if (fs.existsSync(INDEX_PATH)) {
            try {
                this.index.readIndexSync(INDEX_PATH);
            } catch (e) {
                logger.error('Failed to read index, creating new one:', e.message);
                this.index.initIndex(10000);
            }
        } else {
            this.index.initIndex(10000);
        }

        this.loaded = true;
    }

    async getEmbedding(text) {
        try {
            // Use new ollama-client with 8k token support (30k chars)
            const embedding = await ollamaClient.embed(text, { maxLength: 30000 });
            
            if (embedding.length !== VECTOR_DIMENSION) {
                logger.error(`Dimension mismatch: Got ${embedding.length}, expected ${VECTOR_DIMENSION}`);
                throw new Error(`Vector dimension mismatch: ${embedding.length} !== ${VECTOR_DIMENSION}`);
            }
            
            return embedding;
        } catch (e) {
            logger.error(`Failed to generate embedding with ${EMBEDDING_MODEL}:`, e.message);
            throw e;
        }
    }

    async ingestEmail(email) {
        if (!VECTOR_STORE_AVAILABLE) {
            logger.warn('Skipping ingestion — vector store unavailable.');
            return;
        }
        if (!this.loaded) await this.init();

        // Check for duplicates via ID provided in email (Outlook ID)
        // Inefficient: iterate metadata?
        // Better: use a separate map for OutlookID -> InternalID
        const existingInternalId = Object.keys(this.metadata).find(key => this.metadata[key].outlookId === email.id);
        if (existingInternalId) {
            console.log(`Email ${email.id} already exists. Skipping.`);
            return;
        }

        let textToEmbed = `Subject: ${email.subject}\nFrom: ${email.sender}\nDate: ${email.received}\n\n${email.body}`;

        // qwen3-embedding supports 8k tokens (~30k chars) - no need to truncate as aggressively
        // The embed function will handle truncation if needed

        try {
            const vector = await this.getEmbedding(textToEmbed);
            if (vector.length !== VECTOR_DIMENSION) {
                logger.error(`Dimension mismatch: Model produced ${vector.length}, expected ${VECTOR_DIMENSION}`);
                return;
            }

            const internalId = this.currentId++;
            this.index.addPoint(vector, internalId);

            // Enhanced metadata for leadership features
            this.metadata[internalId] = {
                type: 'email',
                outlookId: email.id,
                subject: email.subject,
                sender: email.sender,
                from: email.from || email.sender,
                to: email.to || '',
                received: email.received,
                date: email.received,
                snippet: email.body.substring(0, 500), // Longer snippet
                fullBody: email.body,
                // Leadership analytics metadata (to be enhanced)
                hasActionItem: false,
                hasDecision: false,
                hasBlocker: false,
                sentiment: null,
                topics: []
            };

            this.save();
            logger.info('Ingested:', email.subject);
        } catch (e) {
            logger.error(`Ingestion failed for ${email.subject}:`, e.message);
        }
    }

    save() {
        try {
            this.index.writeIndexSync(INDEX_PATH);
            fs.writeFileSync(METADATA_PATH, JSON.stringify(this.metadata, null, 2));
        } catch (e) {
            logger.error('Failed to save vector store:', e.message);
        }
    }

    async search(query, k = 3) {
        if (!VECTOR_STORE_AVAILABLE) {
            logger.warn('Search skipped — vector store unavailable.');
            return [];
        }
        if (!this.loaded) await this.init();

        try {
            const vector = await this.getEmbedding(query);
            const result = this.index.searchKnn(vector, k);

            // result is { neighbors: [id1, id2], distances: [0.1, 0.2] }
            const hits = result.neighbors.map((id, index) => {
                return {
                    ...this.metadata[id],
                    distance: result.distances[index]
                };
            });

            return hits;
        } catch (e) {
            logger.error('Search failed:', e.message);
            return [];
        }
    }
}

module.exports = new VectorStore();
