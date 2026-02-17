const { HierarchicalNSW } = require('hnswlib-node');
const { Ollama } = require('ollama');
const fs = require('fs');
const path = require('path');

// Configuration
const VECTOR_DIMENSION = 768; // nomic-embed-text dimension. gemma2 is 2048 or 2560? 
// nomic-embed-text is 768.
// mxbai-embed-large is 1024.
// If we use gemma2:2b, it's 2304? or 2560? 
// Let's stick to 'nomic-embed-text' as standard request. 
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
                console.error('Failed to read index, creating new one:', e);
                this.index.initIndex(10000); // Max elements
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
            console.error(`Failed to generate embedding with ${EMBEDDING_MODEL}:`, e.message);
            // Fallback? Or throw?
            // If model is missing, we might need to pull it.
            // But from code, we just fail for now.
            throw e;
        }
    }

    async ingestEmail(email) {
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
        // nomic-embed-text ~8192 tokens? But safe side 8000 chars is approx 2000-2500 tokens. 
        // If limit is 2048 tokens, 8000 chars is pushing it. calculate approx 4 chars/token -> 2000 tokens.
        if (textToEmbed.length > 8000) {
            textToEmbed = textToEmbed.substring(0, 8000);
        }

        try {
            const vector = await this.getEmbedding(textToEmbed);
            if (vector.length !== VECTOR_DIMENSION) {
                console.error(`Dimension mismatch: Model produced ${vector.length}, expected ${VECTOR_DIMENSION}`);
                return;
            }

            const internalId = this.currentId++;
            this.index.addPoint(vector, internalId);

            this.metadata[internalId] = {
                outlookId: email.id,
                subject: email.subject,
                sender: email.sender,
                received: email.received,
                snippet: email.body.substring(0, 200) // Don't store full body in metadata to keep it light?
                // Actually, for RAG we might need the full body. 
                // Let's store full body for now, local disk is cheap.
                // fullBody: email.body 
            };
            this.metadata[internalId].fullBody = email.body;

            this.save();
            console.log(`Ingested: ${email.subject}`);
        } catch (e) {
            console.error(`Ingestion failed for ${email.subject}:`, e.message);
        }
    }

    save() {
        try {
            this.index.writeIndexSync(INDEX_PATH);
            fs.writeFileSync(METADATA_PATH, JSON.stringify(this.metadata, null, 2));
        } catch (e) {
            console.error('Failed to save vector store:', e);
        }
    }

    async search(query, k = 3) {
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
            console.error('Search failed:', e);
            return [];
        }
    }
}

module.exports = new VectorStore();
