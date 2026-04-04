/**
 * Unified Cache — Single caching abstraction for all services.
 *
 * Phase 2 adoption from nkand/ahs branch.
 * Replaces ad-hoc in-memory Maps and file-based caching scattered across services
 * with a single, consistent TTL cache with stale-while-revalidate support.
 *
 * Usage:
 *   const cache = require('./unified-cache');
 *   const emails = await cache.getOrFetch('emails', fetchEmails, { ttlMs: 300_000 });
 */

const logger = require('./logger').child('Cache');

class UnifiedCache {
    constructor() {
        /** @type {Map<string, { value: any, fetchedAt: number, ttlMs: number }>} */
        this._store = new Map();
        this._inflight = new Map(); // request coalescing
    }

    /**
     * Get a cached value, or fetch it if missing/stale.
     *
     * @param {string} key - Cache key
     * @param {Function} fetcher - async () => value (called on miss)
     * @param {object} [options]
     * @param {number} [options.ttlMs=300000] - Time-to-live in ms (default 5 min)
     * @param {boolean} [options.staleWhileRevalidate=true] - Return stale data while refetching
     * @returns {Promise<any>}
     */
    async getOrFetch(key, fetcher, options = {}) {
        const { ttlMs = 300_000, staleWhileRevalidate = true } = options;
        const entry = this._store.get(key);
        const now = Date.now();

        // Fresh cache hit
        if (entry && (now - entry.fetchedAt) < entry.ttlMs) {
            return entry.value;
        }

        // Stale hit — return stale data, refetch in background
        if (entry && staleWhileRevalidate) {
            this._backgroundRefresh(key, fetcher, ttlMs);
            return entry.value;
        }

        // Miss — fetch synchronously (with request coalescing)
        return this._coalescedFetch(key, fetcher, ttlMs);
    }

    /**
     * Get cached value without fetching. Returns null on miss.
     */
    get(key) {
        const entry = this._store.get(key);
        if (!entry) return null;
        return {
            value: entry.value,
            ageMs: Date.now() - entry.fetchedAt,
            isStale: (Date.now() - entry.fetchedAt) > entry.ttlMs,
        };
    }

    /**
     * Manually set a cache entry.
     */
    set(key, value, ttlMs = 300_000) {
        this._store.set(key, { value, fetchedAt: Date.now(), ttlMs });
    }

    /**
     * Invalidate a specific key or all keys.
     */
    invalidate(key) {
        if (key) {
            this._store.delete(key);
        } else {
            this._store.clear();
            logger.info('Cache cleared');
        }
    }

    /**
     * Get cache stats for diagnostics.
     */
    stats() {
        const entries = [];
        for (const [key, entry] of this._store) {
            entries.push({
                key,
                ageMs: Date.now() - entry.fetchedAt,
                ttlMs: entry.ttlMs,
                isStale: (Date.now() - entry.fetchedAt) > entry.ttlMs,
                sizeEstimate: JSON.stringify(entry.value)?.length || 0,
            });
        }
        return { totalEntries: entries.length, entries };
    }

    // ── Internal ─────────────────────────────────────────────────────

    /**
     * Request coalescing: if the same key is already being fetched,
     * reuse the in-flight promise instead of making a duplicate request.
     */
    async _coalescedFetch(key, fetcher, ttlMs) {
        if (this._inflight.has(key)) {
            logger.debug(`Coalescing request for "${key}"`);
            return this._inflight.get(key);
        }

        const promise = fetcher()
            .then(value => {
                this._store.set(key, { value, fetchedAt: Date.now(), ttlMs });
                this._inflight.delete(key);
                return value;
            })
            .catch(err => {
                this._inflight.delete(key);
                throw err;
            });

        this._inflight.set(key, promise);
        return promise;
    }

    /**
     * Background refresh — fire-and-forget refetch, doesn't block.
     */
    _backgroundRefresh(key, fetcher, ttlMs) {
        if (this._inflight.has(key)) return; // already refreshing

        const promise = fetcher()
            .then(value => {
                this._store.set(key, { value, fetchedAt: Date.now(), ttlMs });
                this._inflight.delete(key);
                logger.debug(`Background refresh complete for "${key}"`);
            })
            .catch(err => {
                this._inflight.delete(key);
                logger.warn(`Background refresh failed for "${key}":`, err.message);
            });

        this._inflight.set(key, promise);
    }
}

// Singleton instance
module.exports = new UnifiedCache();
