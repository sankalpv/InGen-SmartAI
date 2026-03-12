const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('QuipFetcher');
const promptLoader = require('./prompt-loader');
const mcpClient = require('./mcp-client');

// In-memory cache for fetched documents (1 hour TTL)
const documentCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Load Quip settings from config/settings.json
 */
function getQuipSettings() {
    try {
        const settingsPath = path.join(process.cwd(), 'config', 'settings.json');
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return settings.quip || { enabled: false };
    } catch (error) {
        logger.error('Failed to load Quip settings:', error.message);
        return { enabled: false };
    }
}

/**
 * Extract Quip URLs from text using regex
 * Supports both full URLs and partial paths
 */
function extractQuipUrls(text) {
    if (!text) return [];
    
    const settings = getQuipSettings();
    const baseUrl = settings.baseUrl || 'https://quip-amazon.com';
    
    // Match full URLs and partial paths
    const urlRegex = new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-Za-z0-9]+`, 'g');
    const matches = text.match(urlRegex) || [];
    
    // Remove duplicates
    return [...new Set(matches)];
}

/**
 * Extract Quip URLs from multiple emails
 */
function extractQuipUrlsFromEmails(emails) {
    const allUrls = [];
    
    for (const email of emails) {
        // Check subject
        if (email.subject) {
            allUrls.push(...extractQuipUrls(email.subject));
        }
        
        // Check body
        if (email.body) {
            allUrls.push(...extractQuipUrls(email.body));
        }
        
        // Check snippet (fallback)
        if (email.snippet && !email.body) {
            allUrls.push(...extractQuipUrls(email.snippet));
        }
    }
    
    // Remove duplicates
    return [...new Set(allUrls)];
}

/**
 * Fetch a single Quip document via MCP server
 */
async function fetchQuipDocument(url, timeoutMs = 30000) {
    const settings = getQuipSettings();
    
    if (!settings.enabled) {
        logger.debug('Quip fetching disabled in settings');
        return null;
    }
    
    // Check cache first
    const cached = documentCache.get(url);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        logger.debug(`Cache hit for: ${url}`);
        return cached.data;
    }
    
    try {
        logger.info(`Fetching Quip document: ${url}`);
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('QUIP_FETCH_TIMEOUT')), timeoutMs)
        );
        
        // Fetch via local MCP client
        const fetchPromise = mcpClient.callTool('amzn-mcp', 'read_internal_website', {
            url: url,
            useGenericStrategy: false
        });
        
        const result = await Promise.race([fetchPromise, timeoutPromise]);
        
        // Extract content from MCP response
        // MCP tool results come in various formats, handle them
        let content = '';
        
        if (result.content) {
            // Content can be an array of content items or a string
            if (Array.isArray(result.content)) {
                content = result.content
                    .map(item => item.text || item.content || '')
                    .join('\n');
            } else if (typeof result.content === 'string') {
                content = result.content;
            } else if (result.content.text) {
                content = result.content.text;
            }
        } else if (typeof result === 'string') {
            content = result;
        }
        
        // Extract metadata (title, date, author) from content if available
        const doc = {
            url: url,
            title: extractTitle(content, url),
            content: content.substring(0, 2000), // Limit content length
            lastModified: extractDate(content),
            author: extractAuthor(content),
            fetchedAt: new Date().toISOString()
        };
        
        // Cache the result
        documentCache.set(url, {
            data: doc,
            timestamp: Date.now()
        });
        
        logger.info(`Successfully fetched: ${doc.title}`);
        return doc;
        
    } catch (error) {
        if (error.message === 'QUIP_FETCH_TIMEOUT') {
            logger.warn(`Timeout fetching Quip document: ${url}`);
        } else {
            logger.error(`Failed to fetch Quip document: ${url}`, error.message);
        }
        return null;
    }
}

/**
 * Fetch multiple Quip documents in parallel
 */
async function fetchMultipleQuipDocs(urls, maxConcurrent = 5) {
    const settings = getQuipSettings();
    
    if (!settings.enabled || urls.length === 0) {
        return [];
    }
    
    // Limit number of URLs based on settings
    const maxDocs = settings.maxDocsPerEmail || 5;
    const limitedUrls = urls.slice(0, maxDocs);
    
    logger.info(`Fetching ${limitedUrls.length} Quip documents (max concurrent: ${maxConcurrent})`);
    
    const results = [];
    
    // Process in batches to limit concurrency
    for (let i = 0; i < limitedUrls.length; i += maxConcurrent) {
        const batch = limitedUrls.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(
            batch.map(url => fetchQuipDocument(url, settings.timeoutSeconds * 1000))
        );
        results.push(...batchResults);
    }
    
    // Filter out null results (failed fetches)
    return results.filter(doc => doc !== null);
}

/**
 * Format Quip documents for AI context using prompt template
 */
function formatQuipContextForAI(docs, contextType = 'default') {
    if (!docs || docs.length === 0) {
        return '';
    }
    
    // Load the context format template from prompts
    const template = promptLoader.get('quipCitation.contextFormat') || 
        'Document: "{{title}}"\nURL: {{url}}\nLast Modified: {{date}}\nAuthor: {{author}}\nContent:\n{{content}}';
    
    return docs.map(doc => {
        return template
            .replace('{{title}}', doc.title || 'Untitled Document')
            .replace('{{url}}', doc.url)
            .replace('{{date}}', doc.lastModified || 'Unknown')
            .replace('{{author}}', doc.author || 'Unknown')
            .replace('{{content}}', doc.content || '(Content unavailable)');
    }).join('\n\n---\n\n');
}

/**
 * Helper: Extract title from Quip document content
 */
function extractTitle(content, url) {
    // Try to find a title in the first few lines
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    
    if (lines.length > 0) {
        // First non-empty line is often the title
        const potentialTitle = lines[0].trim();
        if (potentialTitle.length < 100) {
            return potentialTitle.replace(/^#+\s*/, ''); // Remove markdown headers
        }
    }
    
    // Fallback: use last part of URL
    const urlParts = url.split('/');
    return urlParts[urlParts.length - 1] || 'Quip Document';
}

/**
 * Helper: Extract date from Quip document content
 */
function extractDate(content) {
    // Look for common date patterns
    const datePatterns = [
        /Last (?:modified|updated|edited):\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /(?:Modified|Updated|Edited):\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
        /\b([A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/
    ];
    
    for (const pattern of datePatterns) {
        const match = content.match(pattern);
        if (match) {
            return match[1];
        }
    }
    
    return 'Unknown';
}

/**
 * Helper: Extract author from Quip document content
 */
function extractAuthor(content) {
    // Look for author patterns
    const authorPatterns = [
        /(?:Author|By|Created by):\s*([A-Za-z\s]+)/i,
        /^By\s+([A-Za-z\s]+)/m
    ];
    
    for (const pattern of authorPatterns) {
        const match = content.match(pattern);
        if (match) {
            return match[1].trim();
        }
    }
    
    return 'Unknown';
}

/**
 * Clear the document cache
 */
function clearCache() {
    documentCache.clear();
    logger.info('Document cache cleared');
}

module.exports = {
    extractQuipUrls,
    extractQuipUrlsFromEmails,
    fetchQuipDocument,
    fetchMultipleQuipDocs,
    formatQuipContextForAI,
    getQuipSettings,
    clearCache
};