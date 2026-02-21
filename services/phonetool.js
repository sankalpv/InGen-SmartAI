/**
 * Phonetool Service
 * Fetches employee data (direct reports) from Amazon Phonetool via MCP
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('Phonetool');
const mcpClient = require('./mcp-client');

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
const CACHE_PATH = path.join(process.cwd(), 'brain', 'phonetool-cache.json');

// In-memory cache
let directReportsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the configured Phonetool alias from settings
 */
function getAlias() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
            return settings.phonetoolAlias || '';
        }
    } catch (e) {
        logger.error('Failed to read phonetool alias:', e.message);
    }
    return '';
}

/**
 * Fetch direct reports from Phonetool via MCP
 */
async function fetchDirectReports(alias) {
    if (!alias) {
        logger.warn('No Phonetool alias configured');
        return [];
    }

    // Check in-memory cache
    if (directReportsCache && (Date.now() - cacheTimestamp < CACHE_TTL)) {
        logger.info(`Returning cached direct reports (${directReportsCache.length} reports)`);
        return directReportsCache;
    }

    // Check file cache
    try {
        if (fs.existsSync(CACHE_PATH)) {
            const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
            if (cached.alias === alias && (Date.now() - cached.timestamp < CACHE_TTL)) {
                logger.info(`Returning file-cached direct reports (${cached.reports.length} reports)`);
                directReportsCache = cached.reports;
                cacheTimestamp = cached.timestamp;
                return cached.reports;
            }
        }
    } catch (e) {
        logger.warn('Failed to read phonetool cache:', e.message);
    }

    // Fetch from Phonetool via MCP
    try {
        logger.info(`Fetching Phonetool data for alias: ${alias}`);
        
        const url = `https://phonetool.amazon.com/users/${alias}`;
        const result = await mcpClient.callTool('amzn-mcp', 'read_internal_website', { url });

        if (!result || !result.content) {
            logger.error('Empty response from Phonetool');
            return [];
        }

        // Parse the response content
        const content = typeof result.content === 'string' 
            ? result.content 
            : result.content.map(c => c.text || '').join('\n');

        // Extract direct reports from the page content
        const reports = parseDirectReports(content, alias);
        
        logger.info(`Found ${reports.length} direct reports for ${alias}`);

        // Cache results
        directReportsCache = reports;
        cacheTimestamp = Date.now();

        // Save to file cache
        try {
            const brainDir = path.join(process.cwd(), 'brain');
            if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
            fs.writeFileSync(CACHE_PATH, JSON.stringify({
                alias,
                reports,
                timestamp: Date.now(),
                fetchedAt: new Date().toISOString()
            }, null, 2));
        } catch (e) {
            logger.warn('Failed to save phonetool cache:', e.message);
        }

        return reports;

    } catch (error) {
        logger.error(`Failed to fetch from Phonetool: ${error.message}`);
        return [];
    }
}

/**
 * Parse direct reports from Phonetool page content
 */
function parseDirectReports(content, managerAlias) {
    const reports = [];
    
    // Phonetool page typically has sections like "Direct Reports" or "Reports"
    // The content from MCP will be markdown-formatted
    
    // Strategy 1: Look for "Direct Reports" section
    const directReportsMatch = content.match(/(?:direct\s*reports?|reports?\s*to\s*this\s*person|team\s*members?)[\s:]*\n([\s\S]*?)(?=\n#{1,3}\s|\n---|\Z)/i);
    
    if (directReportsMatch) {
        const section = directReportsMatch[1];
        // Extract names and aliases from links like [Name](url) or Name (alias@)
        const nameMatches = section.matchAll(/\[([^\]]+)\]\((?:https?:\/\/phonetool[^\)]*\/users\/([^\)\/]+))\)/g);
        for (const match of nameMatches) {
            reports.push({
                name: match[1].trim(),
                alias: match[2].trim(),
                email: `${match[2].trim()}@amazon.com`
            });
        }
    }

    // Strategy 2: Look for user links in the content that follow "Direct Reports" keyword
    if (reports.length === 0) {
        const lines = content.split('\n');
        let inReportsSection = false;
        
        for (const line of lines) {
            if (/direct\s*report|team\s*member/i.test(line)) {
                inReportsSection = true;
                continue;
            }
            
            if (inReportsSection) {
                // Stop at next section
                if (/^#{1,3}\s/.test(line) || /^---/.test(line)) {
                    inReportsSection = false;
                    continue;
                }
                
                // Extract user links
                const linkMatch = line.match(/\[([^\]]+)\]\(.*?phonetool.*?\/users\/([^\)\/]+)\)/);
                if (linkMatch) {
                    reports.push({
                        name: linkMatch[1].trim(),
                        alias: linkMatch[2].trim(),
                        email: `${linkMatch[2].trim()}@amazon.com`
                    });
                }
                
                // Or plain text with @ pattern
                const aliasMatch = line.match(/([A-Za-z\s]+)\s*[-–]\s*([a-z]+)@/);
                if (aliasMatch) {
                    reports.push({
                        name: aliasMatch[1].trim(),
                        alias: aliasMatch[2].trim(),
                        email: `${aliasMatch[2].trim()}@amazon.com`
                    });
                }
            }
        }
    }

    // Strategy 3: Extract all phonetool user links (excluding the manager themselves)
    if (reports.length === 0) {
        const allUserLinks = content.matchAll(/\[([^\]]+)\]\(https?:\/\/phonetool[^\)]*\/users\/([^\)\/]+)\)/g);
        const seen = new Set();
        for (const match of allUserLinks) {
            const alias = match[2].trim();
            if (alias !== managerAlias && !seen.has(alias)) {
                seen.add(alias);
                reports.push({
                    name: match[1].trim(),
                    alias,
                    email: `${alias}@amazon.com`
                });
            }
        }
    }

    return reports;
}

/**
 * Clear the phonetool cache
 */
function clearCache() {
    directReportsCache = null;
    cacheTimestamp = 0;
    try {
        if (fs.existsSync(CACHE_PATH)) {
            fs.unlinkSync(CACHE_PATH);
        }
    } catch (e) {
        logger.warn('Failed to clear phonetool cache:', e.message);
    }
    logger.info('Phonetool cache cleared');
}

module.exports = {
    getAlias,
    fetchDirectReports,
    clearCache
};