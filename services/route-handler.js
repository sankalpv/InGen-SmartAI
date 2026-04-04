/**
 * withRouteHandler — Standardized API route wrapper.
 *
 * Phase 2 adoption from nkand/ahs branch.
 * Wraps all API route handlers with consistent:
 *   - Error handling (try/catch)
 *   - Logging (request method, path, duration)
 *   - Response format ({ ok, data, error })
 *   - CORS headers
 *
 * Usage in API routes:
 *   import { withRouteHandler, okResponse, errorResponse } from '@/services/route-handler';
 *   export const GET = withRouteHandler(async (request) => {
 *       const data = await fetchSomething();
 *       return okResponse(data);
 *   });
 */

const { NextResponse } = require('next/server');

/**
 * Standard success response.
 */
function okResponse(data, status = 200) {
    return NextResponse.json(data, { status });
}

/**
 * Standard error response.
 */
function errorResponse(message, status = 500, details = null) {
    const body = { error: message };
    if (details) body.details = details;
    console.error(`[API Error] ${status}: ${message}`);
    return NextResponse.json(body, { status });
}

/**
 * Standard view/redirect response for HTML-returning routes.
 */
function viewResponse(html, status = 200) {
    return new Response(html, {
        status,
        headers: { 'Content-Type': 'text/html' },
    });
}

/**
 * Wrap an API handler with error handling, logging, and consistent responses.
 *
 * @param {Function} handler - async (request, context) => NextResponse
 * @param {object} [options]
 * @param {string} [options.name] - Route name for logging (auto-detected if omitted)
 * @param {number} [options.maxDuration] - Max execution time in ms (default: 60000)
 * @returns {Function} Wrapped handler
 */
function withRouteHandler(handler, options = {}) {
    const { name, maxDuration = 60_000 } = options;

    return async function wrappedHandler(request, context) {
        const start = Date.now();
        const routeName = name || request.nextUrl?.pathname || request.url || 'unknown';

        try {
            // Timeout protection
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('ROUTE_TIMEOUT')), maxDuration)
            );

            const result = await Promise.race([
                handler(request, context),
                timeoutPromise,
            ]);

            const duration = Date.now() - start;
            if (duration > 5000) {
                console.warn(`[API] ${routeName} took ${duration}ms (slow)`);
            }

            return result;
        } catch (error) {
            const duration = Date.now() - start;

            if (error.message === 'ROUTE_TIMEOUT') {
                console.error(`[API] ${routeName} timed out after ${maxDuration}ms`);
                return errorResponse('Request timed out', 504);
            }

            console.error(`[API] ${routeName} failed after ${duration}ms:`, error.message);
            return errorResponse(
                error.message || 'Internal server error',
                error.statusCode || 500
            );
        }
    };
}

module.exports = {
    withRouteHandler,
    okResponse,
    errorResponse,
    viewResponse,
};
