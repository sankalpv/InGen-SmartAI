// Behavioral tests for services/ollama-client.js
// Tests generate(), embed(), ping(), getConfig() with mocked global fetch.

jest.mock('../../services/logger', () => ({
  child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));
jest.mock('fs');

describe('services/ollama-client.js', () => {
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    client = require('../../services/ollama-client');
  });

  // ─── Module Exports ───────────────────────────────────────────────
  describe('module exports', () => {
    it('exports generate, embed, ping, getConfig, getModels functions', () => {
      expect(typeof client.generate).toBe('function');
      expect(typeof client.embed).toBe('function');
      expect(typeof client.ping).toBe('function');
      expect(typeof client.getConfig).toBe('function');
      expect(typeof client.getModels).toBe('function');
    });
  });

  // ─── getConfig() ─────────────────────────────────────────────────
  describe('getConfig()', () => {
    it('returns object with baseUrl, llmModel, embeddingModel, embeddingDimensions', () => {
      const config = client.getConfig();
      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('llmModel');
      expect(config).toHaveProperty('embeddingModel');
      expect(config).toHaveProperty('embeddingDimensions');
      expect(typeof config.baseUrl).toBe('string');
      expect(typeof config.embeddingDimensions).toBe('number');
    });

    it('defaults to localhost:11434 when OLLAMA_BASE_URL is not set', () => {
      const config = client.getConfig();
      expect(config.baseUrl).toContain('127.0.0.1:11434');
    });
  });

  // ─── generate() ──────────────────────────────────────────────────
  describe('generate()', () => {
    it('calls fetch with /api/generate and correct body shape', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'Hello from LLM' }),
        })
      );

      const result = await client.generate('What is 2+2?');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toContain('/api/generate');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe('What is 2+2?');
      expect(body.model).toBeTruthy();
      expect(body.stream).toBe(false);
      expect(body.options).toHaveProperty('temperature');
      expect(body.options).toHaveProperty('num_predict');

      expect(result).toBe('Hello from LLM');
    });

    it('includes system prompt when provided', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'ok' }),
        })
      );

      await client.generate('test', { system: 'You are a helpful assistant' });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are a helpful assistant');
    });

    it('sets format=json when requested', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: '{"key":"val"}' }),
        })
      );

      await client.generate('give json', { format: 'json' });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.format).toBe('json');
    });

    it('throws on non-ok HTTP response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        })
      );

      await expect(client.generate('test')).rejects.toThrow('Ollama generation failed');
    });

    it('throws on network error', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')));

      await expect(client.generate('test')).rejects.toThrow('ECONNREFUSED');
    });
  });

  // ─── embed() ─────────────────────────────────────────────────────
  describe('embed()', () => {
    it('calls fetch with /api/embeddings and returns embedding array', async () => {
      const dims = client.getConfig().embeddingDimensions;
      const fakeEmbedding = new Array(dims).fill(0.1);

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: fakeEmbedding }),
        })
      );

      const result = await client.embed('some text to embed');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toContain('/api/embeddings');

      const body = JSON.parse(opts.body);
      expect(body.prompt).toBe('some text to embed');
      expect(body.model).toBeTruthy();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(dims);
    });

    it('truncates text longer than maxLength', async () => {
      const dims = client.getConfig().embeddingDimensions;
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: new Array(dims).fill(0) }),
        })
      );

      const longText = 'x'.repeat(50000);
      await client.embed(longText, { maxLength: 100 });

      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.prompt.length).toBe(100);
    });

    it('throws when dimension count mismatches', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: [0.1, 0.2, 0.3] }), // wrong dims
        })
      );

      await expect(client.embed('test')).rejects.toThrow(/Expected.*dimensions/);
    });

    it('throws on non-ok HTTP response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Model not loaded'),
        })
      );

      await expect(client.embed('test')).rejects.toThrow('Ollama embedding failed');
    });
  });

  // ─── ping() ──────────────────────────────────────────────────────
  describe('ping()', () => {
    it('returns true when fetch to /api/tags succeeds', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ models: [] }) })
      );

      const result = await client.ping();
      expect(result).toBe(true);

      const url = global.fetch.mock.calls[0][0];
      expect(url).toContain('/api/tags');
    });

    it('returns false when fetch throws (Ollama not running)', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')));

      const result = await client.ping();
      expect(result).toBe(false);
    });
  });

  // ─── generateJSON() ──────────────────────────────────────────────
  describe('generateJSON()', () => {
    it('parses valid JSON response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: '{"name":"test","value":42}' }),
        })
      );

      const result = await client.generateJSON('give me json');
      expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('throws on invalid JSON response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: 'not valid json {' }),
        })
      );

      await expect(client.generateJSON('give me json')).rejects.toThrow('Invalid JSON response');
    });
  });

  // ─── getModels() ─────────────────────────────────────────────────
  describe('getModels()', () => {
    it('returns array of models on success', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [{ name: 'qwen3' }, { name: 'llama3' }] }),
        })
      );

      const models = await client.getModels();
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBe(2);
      expect(models[0].name).toBe('qwen3');
    });

    it('returns empty array on failure', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED')));

      const models = await client.getModels();
      expect(models).toEqual([]);
    });
  });

  // ─── embedBatch() ────────────────────────────────────────────────
  describe('embedBatch()', () => {
    it('processes multiple texts and returns array of embeddings', async () => {
      const dims = client.getConfig().embeddingDimensions;
      let callCount = 0;
      global.fetch = jest.fn(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: new Array(dims).fill(callCount * 0.1) }),
        });
      });

      const results = await client.embedBatch(['text1', 'text2', 'text3']);

      expect(results.length).toBe(3);
      expect(results[0].length).toBe(dims);
      expect(results[1].length).toBe(dims);
      expect(results[2].length).toBe(dims);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
