/**
 * Unified Ollama Client
 * Handles both LLM generation and embeddings
 */

const logger = require('./logger').child('Ollama');

class OllamaClient {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    this.llmModel = process.env.LLM_MODEL || 'llama3';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'qwen3-embedding';
    this.embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '4096');
    
    logger.info(`Ollama client initialized: LLM=${this.llmModel}, Embedding=${this.embeddingModel} (${this.embeddingDimensions}d)`);
  }

  /**
   * Generate text completion using LLM
   */
  async generate(prompt, options = {}) {
    const {
      system = '',
      temperature = 0.3,
      maxTokens = 2000,
      format = null, // 'json' for structured output
      stream = false
    } = options;

    try {
      const body = {
        model: this.llmModel,
        prompt: prompt,
        stream: stream,
        think: false, // Disable qwen3 thinking/reasoning mode for faster generation
        keep_alive: '2m', // Unload model after 2 min idle (battery optimization)
        options: {
          temperature: temperature,
          num_predict: maxTokens,
          top_p: 0.9
        }
      };

      if (system) {
        body.system = system;
      }

      if (format === 'json') {
        body.format = 'json';
      }

      logger.debug(`Generating with ${this.llmModel}: ${prompt.substring(0, 100)}...`);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama generation failed: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      logger.debug(`Generated ${data.response?.length || 0} characters`);
      
      return data.response;
    } catch (error) {
      logger.error('Generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for text
   */
  async embed(text, options = {}) {
    const { maxLength = 30000 } = options; // ~8k tokens for qwen3-embedding

    try {
      // Truncate if too long
      const truncatedText = text.length > maxLength 
        ? text.substring(0, maxLength) 
        : text;

      logger.debug(`Embedding text (${truncatedText.length} chars) with ${this.embeddingModel}`);

      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.embeddingModel,
          prompt: truncatedText
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama embedding failed: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      if (!data.embedding || data.embedding.length !== this.embeddingDimensions) {
        throw new Error(`Expected ${this.embeddingDimensions} dimensions, got ${data.embedding?.length || 0}`);
      }

      logger.debug(`Generated embedding: ${data.embedding.length} dimensions`);
      
      return data.embedding;
    } catch (error) {
      logger.error('Embedding failed:', error.message);
      throw error;
    }
  }

  /**
   * Embed multiple texts in batch (with concurrency control)
   */
  async embedBatch(texts, options = {}) {
    const { concurrency = 5 } = options;
    
    logger.info(`Embedding ${texts.length} texts in batches of ${concurrency}`);
    
    const results = [];
    
    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchPromises = batch.map(text => this.embed(text, options));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        logger.debug(`Completed batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(texts.length / concurrency)}`);
      } catch (error) {
        logger.error(`Batch embedding failed at index ${i}:`, error.message);
        throw error;
      }
    }
    
    return results;
  }

  /**
   * Generate with retry logic (for rate limiting)
   */
  async generateWithRetry(prompt, options = {}, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.generate(prompt, options);
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        logger.warn(`Generation failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Parse JSON response (with error handling)
   */
  async generateJSON(prompt, options = {}) {
    const response = await this.generate(prompt, { ...options, format: 'json' });
    
    try {
      return JSON.parse(response);
    } catch (error) {
      logger.error('Failed to parse JSON response:', response.substring(0, 200));
      throw new Error(`Invalid JSON response: ${error.message}`);
    }
  }

  /**
   * Check if Ollama is available
   */
  async ping() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available models
   */
  async getModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error('Failed to get models:', error.message);
      return [];
    }
  }

  /**
   * Get model info
   */
  async getModelInfo(modelName) {
    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      logger.error(`Failed to get info for ${modelName}:`, error.message);
      return null;
    }
  }

  /**
   * Get client configuration
   */
  getConfig() {
    return {
      baseUrl: this.baseUrl,
      llmModel: this.llmModel,
      embeddingModel: this.embeddingModel,
      embeddingDimensions: this.embeddingDimensions
    };
  }
}

// Export singleton instance
const ollamaClient = new OllamaClient();

module.exports = ollamaClient;