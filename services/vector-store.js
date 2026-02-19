let HierarchicalNSW;
let VECTOR_STORE_AVAILABLE = false;
try {
    HierarchicalNSW = require('hnswlib-node').HierarchicalNSW;
    VECTOR_STORE_AVAILABLE = true;
} catch (e) {
    console.error('[VectorStore] hnswlib-node not available. Vector search disabled. Run: npm install');
}
const { Ollama } = require('ollama');
const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('VectorStore');

// Configuration
const VECTOR_DIMENSION = 768; // nomic-embed-text dimension. gemma2 is 2048 or 2560? 
// nomic-embed-text is 768.
const EMBEDDING_MODEL = 'nomic-embed-text';
const INDEX_PATH = path.join(process.cwd(), 'brain', 'vector_index.bin');
const METADATA_PATH = path.join(process.cwd(), 'brain', 'vector_metadata.json');
const BRAIN_DIR = path.join(process.cwd(), 'brain');

// Ensure brain dir exists
if (!fs.existsSync(BRAIN_DIR)) {
    fs.mkdirSync(BRAIN_DIR);
}

const ollama = new Ollama();

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
            const response = await ollama.embeddings({
                model: EMBEDDING_MODEL,
                prompt: text,
            });
            return response.embedding;
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

        // Truncate to avoid "input length exceeds context length"
        if (textToEmbed.length > 8000) {
            textToEmbed = textToEmbed.substring(0, 8000);
        }

        try {
            const vector = await this.getEmbedding(textToEmbed);
            if (vector.length !== VECTOR_DIMENSION) {
                logger.error(`Dimension mismatch: Model produced ${vector.length}, expected ${VECTOR_DIMENSION}`);
                return;
            }

            const internalId = this.currentId++;
            this.index.addPoint(vector, internalId);

            this.metadata[internalId] = {
                outlookId: email.id,
                subject: email.subject,
                sender: email.sender,
                received: email.received,
                snippet: email.body.substring(0, 200),
                fullBody: email.body
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
