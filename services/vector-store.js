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

        // Filter out calendar noise — these have tiny bodies and pollute search results
        const subjectLower = (email.subject || '').toLowerCase();
        const calendarNoise = ['accepted:', 'declined:', 'canceled:', 'cancelled:', 'tentative:'];
        if (calendarNoise.some(prefix => subjectLower.startsWith(prefix))) {
            logger.info(`Skipping calendar noise: ${email.subject}`);
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

    async search(query, k = 3, options = {}) {
        if (!VECTOR_STORE_AVAILABLE) {
            logger.warn('Search skipped — vector store unavailable.');
            return [];
        }
        if (!this.loaded) await this.init();

        try {
            const vector = await this.getEmbedding(query);
            return await this.searchByVector(vector, { ...options, limit: k });
        } catch (e) {
            logger.error('Search failed:', e.message);
            return [];
        }
    }

    /**
     * Search using a pre-computed vector with optional metadata filters
     * @param {Array<number>} vector - The embedding vector
     * @param {Object} options - Search options
     * @param {Object} options.filter - Metadata filters (e.g., {source: 'email', hasBlocker: true})
     * @param {number} options.limit - Number of results (default: 3)
     * @param {number} options.maxDistance - Maximum distance threshold (default: Infinity)
     * @returns {Array} Matching documents with metadata and distance scores
     */
    async searchByVector(vector, options = {}) {
        if (!VECTOR_STORE_AVAILABLE) {
            logger.warn('Vector search skipped — vector store unavailable.');
            return [];
        }
        if (!this.loaded) await this.init();

        // Default distance threshold for qwen3-embedding 4096d (L2 space)
        // Typical relevant matches: 10-30, borderline: 30-50, irrelevant: >50
        const DEFAULT_MAX_DISTANCE = 45;
        const { filter = {}, limit = 3, maxDistance = DEFAULT_MAX_DISTANCE } = options;

        try {
            // Search with larger k to account for filtering
            const searchK = Math.min(limit * 10, 100);
            const result = this.index.searchKnn(vector, searchK);

            // Apply filters, distance threshold, and compute similarity score
            const hits = result.neighbors
                .map((id, index) => ({
                    id,
                    metadata: this.metadata[id],
                    distance: result.distances[index]
                }))
                .filter(hit => {
                    if (!hit.metadata) return false;

                    // Apply distance threshold — reject garbage matches
                    if (hit.distance > maxDistance) return false;

                    // Filter out calendar noise from results (Accepted/Declined/etc.)
                    const subj = (hit.metadata.subject || '').toLowerCase();
                    if (['accepted:', 'declined:', 'canceled:', 'cancelled:', 'tentative:'].some(p => subj.startsWith(p))) return false;

                    // Apply metadata filters
                    for (const [key, value] of Object.entries(filter)) {
                        if (hit.metadata[key] !== value) return false;
                    }

                    return true;
                })
                .slice(0, limit)
                .map(hit => {
                    // Convert L2 distance to 0-1 similarity score
                    // Lower distance = higher similarity. Score = 1 / (1 + distance/10)
                    const similarity = 1 / (1 + hit.distance / 10);
                    return {
                        ...hit.metadata,
                        distance: hit.distance,
                        similarity: parseFloat(similarity.toFixed(3))
                    };
                });

            if (hits.length > 0) {
                logger.info(`Search returned ${hits.length} results (distances: ${hits.map(h => h.distance.toFixed(1)).join(', ')})`);
            }

            return hits;
        } catch (e) {
            logger.error('Vector search failed:', e.message);
            return [];
        }
    }

    /**
     * Update metadata for an existing document
     * @param {string} outlookId - The Outlook ID of the document
     * @param {Object} updates - Metadata fields to update
     */
    updateMetadata(outlookId, updates) {
        const internalId = Object.keys(this.metadata).find(
            key => this.metadata[key].outlookId === outlookId
        );

        if (internalId) {
            this.metadata[internalId] = {
                ...this.metadata[internalId],
                ...updates,
                lastUpdated: new Date().toISOString()
            };
            this.save();
            logger.info(`Updated metadata for ${outlookId}`);
            return true;
        }

        logger.warn(`Document not found: ${outlookId}`);
        return false;
    }

    /**
     * Get document metadata by Outlook ID
     */
    getMetadata(outlookId) {
        const internalId = Object.keys(this.metadata).find(
            key => this.metadata[key].outlookId === outlookId
        );
        return internalId ? this.metadata[internalId] : null;
    }

    /**
     * Get statistics about the vector store
     */
    getStats() {
        const docs = Object.values(this.metadata);
        return {
            totalDocuments: docs.length,
            byType: {
                email: docs.filter(d => d.type === 'email').length,
                meeting: docs.filter(d => d.type === 'meeting').length
            },
            withActionItems: docs.filter(d => d.hasActionItem).length,
            withBlockers: docs.filter(d => d.hasBlocker).length,
            withDecisions: docs.filter(d => d.hasDecision).length,
            dimension: VECTOR_DIMENSION,
            model: EMBEDDING_MODEL
        };
    }
}

module.exports = new VectorStore();
