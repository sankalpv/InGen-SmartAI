/**
 * Phonetool Service
 * Fetches employee data (direct reports) from Amazon Phonetool via MCP
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('Phonetool');
const mcpClient = require('./mcp-client');

/**
 * Read an internal website via MCP — tries amzn-mcp first, falls back to builder-mcp.
 * On Windows, amzn-mcp may not be available, so builder-mcp is the primary.
 */
async function readInternalWebsite(url) {
    // Try amzn-mcp first (Mac primary)
    try {
        const result = await mcpClient.callTool('amzn-mcp', 'read_internal_website', { url });
        if (result && result.content) return result;
    } catch (e) {
        logger.debug(`amzn-mcp failed for ${url}: ${e.message}, trying builder-mcp...`);
    }
    
    // Fallback: builder-mcp (Windows primary)
    try {
        const result = await mcpClient.callTool('builder-mcp', 'ReadInternalWebsites', { inputs: [url] });
        if (result && result.content) return result;
    } catch (e) {
        logger.error(`builder-mcp also failed for ${url}: ${e.message}`);
    }
    
    return null;
}

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
const CACHE_PATH = path.join(process.cwd(), 'brain', 'phonetool-cache.json');

// In-memory cache (keyed by alias to avoid cross-contamination during recursive org tree builds)
let directReportsCache = null;
let directReportsCacheAlias = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Name resolution cache (alias → full name)
let nameCache = {};
const NAME_CACHE_PATH = path.join(process.cwd(), 'brain', 'name-cache.json');

// Load name cache from disk on startup
try {
    if (fs.existsSync(NAME_CACHE_PATH)) {
        const cached = JSON.parse(fs.readFileSync(NAME_CACHE_PATH, 'utf8'));
        if (cached && cached.names) {
            nameCache = cached.names;
        }
    }
} catch (e) {
    // Ignore — start with empty cache
}

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

    // Check in-memory cache (must match alias to avoid cross-contamination during recursive builds)
    if (directReportsCache && directReportsCacheAlias === alias && (Date.now() - cacheTimestamp < CACHE_TTL)) {
        logger.info(`Returning cached direct reports for ${alias} (${directReportsCache.length} reports)`);
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
        const result = await readInternalWebsite(url);

        if (!result || !result.content) {
            logger.error('Empty response from Phonetool');
            return [];
        }

        // Parse the response - Phonetool returns structured JSON
        const content = typeof result.content === 'string' 
            ? result.content 
            : result.content.map(c => c.text || '').join('\n');

        // Try JSON parsing first (Phonetool API returns JSON)
        // Note: MCP may append deprecation notices after JSON, so extract JSON portion
        let reports = [];
        try {
            // Extract JSON from content (may have trailing text like deprecation warnings)
            const jsonMatch = content.match(/^\s*(\{[\s\S]*\})\s*(?:⚠|$)/);
            const jsonStr = jsonMatch ? jsonMatch[1] : content;
            const parsed = JSON.parse(jsonStr);
            let userData = parsed.content || parsed;
            // builder-mcp wraps in content.content; unwrap until we find direct_reports
            if (userData.content && !userData.direct_reports) userData = userData.content;
            
            if (userData.direct_reports && Array.isArray(userData.direct_reports)) {
                logger.info(`Found ${userData.direct_reports.length} direct reports in JSON response`);
                
                // Direct reports only have login, need to fetch names
                for (const report of userData.direct_reports) {
                    const login = report.login || report.alias;
                    if (!login) continue;
                    
                    // Try to fetch each report's name from Phonetool
                    let name = login; // Default to login
                    try {
                        const reportUrl = `https://phonetool.amazon.com/users/${login}`;
                        const reportResult = await readInternalWebsite(reportUrl);
                        const reportContent = typeof reportResult.content === 'string'
                            ? reportResult.content
                            : reportResult.content.map(c => c.text || '').join('\n');
                        // Extract JSON (strip trailing deprecation notices)
                        const rJsonMatch = reportContent.match(/^\s*(\{[\s\S]*\})\s*(?:⚠|$)/);
                        const rJsonStr = rJsonMatch ? rJsonMatch[1] : reportContent;
                        const reportData = JSON.parse(rJsonStr);
                        let rd = reportData.content || reportData;
                        if (rd.content && !rd.name) rd = rd.content; // unwrap builder-mcp double nesting
                        name = rd.name || rd.first_name || login;
                    } catch (e) {
                        logger.warn(`Failed to fetch name for ${login}: ${e.message}`);
                    }
                    
                    reports.push({
                        name,
                        alias: login,
                        email: `${login}@amazon.com`
                    });
                }
            }
        } catch (jsonError) {
            // Fallback to markdown parsing if not JSON
            logger.info('Response is not JSON, trying markdown parsing');
            reports = parseDirectReports(content, alias);
        }
        
        logger.info(`Found ${reports.length} direct reports for ${alias}`);

        // Cache results (with alias for cross-contamination prevention)
        directReportsCache = reports;
        directReportsCacheAlias = alias;
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
 * Fetch a person's full name from their alias via Phonetool/MCP.
 * Caches results to avoid repeated lookups.
 * @param {string} alias - The Amazon alias (e.g., "adaliep")
 * @returns {Promise<string|null>} The full name, or null if lookup fails
 */
async function fetchPersonName(alias) {
    if (!alias) return null;
    
    // Check in-memory cache first
    if (nameCache[alias]) {
        // If it's the new detail object, return it.
        // If it's a legacy string, fall through to re-fetch full details.
        if (typeof nameCache[alias] === 'object' && nameCache[alias] !== null) {
            return nameCache[alias];
        }
    }
    
    try {
        const url = `https://phonetool.amazon.com/users/${alias}`;
        const result = await readInternalWebsite(url);
        
        if (!result || !result.content) return null;
        
        const content = typeof result.content === 'string'
            ? result.content
            : result.content.map(c => c.text || '').join('\n');
        
        let details = { name: null, jobTitle: null, level: null };
        try {
            // Extract JSON (strip trailing deprecation notices)
            const jsonMatch = content.match(/^\s*(\{[\s\S]*\})\s*(?:⚠|$)/);
            const jsonStr = jsonMatch ? jsonMatch[1] : content;
            const parsed = JSON.parse(jsonStr);
            let userData = parsed.content || parsed;
            if (userData.content && !userData.name) userData = userData.content; // unwrap builder-mcp double nesting
            
            details.name = userData.name || userData.first_name || null;
            details.jobTitle = userData.job_title || userData.title || userData.business_title || null;
            details.level = (userData.job_level || userData.level) ? parseInt(userData.job_level || userData.level) : null;
        } catch (jsonError) {
            // Try markdown parsing: look for name in heading
            const nameMatch = content.match(/^#\s+(.+)/m) || content.match(/\*\*(.+?)\*\*/);
            if (nameMatch) details.name = nameMatch[1].trim();
            
            // Try to find title/level in text if JSON fails
            const titleMatch = content.match(/Job Title[:\s]+(.+)/i) || content.match(/Title[:\s]+(.+)/i);
            if (titleMatch) details.jobTitle = titleMatch[1].trim();
            const levelMatch = content.match(/Level[:\s]+(\d+)/i) || content.match(/Job Level[:\s]+(\d+)/i);
            if (levelMatch) details.level = parseInt(levelMatch[1]);
        }
        
        if (details.name) {
            // Cache it (store the whole object)
            nameCache[alias] = details;
            // Persist to disk
            try {
                const brainDir = path.join(process.cwd(), 'brain');
                if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
                fs.writeFileSync(NAME_CACHE_PATH, JSON.stringify({
                    names: nameCache,
                    updatedAt: new Date().toISOString()
                }, null, 2));
            } catch (e) { /* ignore write errors */ }
        }
        
        return details;
    } catch (error) {
        logger.warn(`Failed to fetch name for alias ${alias}: ${error.message}`);
        return null;
    }
}

/**
 * Batch-resolve multiple aliases to full names.
 * Returns a map of alias → name.
 * @param {string[]} aliases - Array of aliases to resolve
 * @returns {Promise<Object>} Map of alias → full name
 */
async function fetchPersonNames(aliases) {
    const result = {};
    const toFetch = [];
    
    for (const alias of aliases) {
        if (nameCache[alias]) {
            result[alias] = nameCache[alias];
        } else {
            toFetch.push(alias);
        }
    }
    
    // Fetch uncached names (limit concurrency to avoid flooding MCP)
    for (const alias of toFetch.slice(0, 10)) { // Max 10 at a time
        const name = await fetchPersonName(alias);
        if (name) result[alias] = name;
    }
    
    return result;
}

/**
 * Get cached name for an alias (no network call).
 * @param {string} alias
 * @returns {string|null}
 */
function getCachedName(alias) {
    return nameCache[alias] || null;
}

// ─── Org Tree (recursive hierarchy) ───

const ORG_TREE_CACHE_PATH = path.join(process.cwd(), 'brain', 'org-tree-cache.json');

/**
 * Fetch the full org tree recursively from Phonetool.
 * Gets direct reports, then recursively fetches their reports.
 * @param {string} alias - Root manager alias
 * @param {number} maxDepth - Max recursion depth (default 3)
 * @param {boolean} forceRefresh - Bypass file cache (default false)
 * @returns {Promise<Object>} Tree: { alias, name, reports: [...] }
 */
async function fetchOrgTree(alias, maxDepth = 3, forceRefresh = false) {
    if (!alias) return null;

    // Check file cache first (must match both alias AND maxDepth to avoid shallow cache poisoning)
    if (!forceRefresh) {
        try {
        if (fs.existsSync(ORG_TREE_CACHE_PATH)) {
            const cached = JSON.parse(fs.readFileSync(ORG_TREE_CACHE_PATH, 'utf8'));
            if (cached.alias === alias && cached.maxDepth >= maxDepth && (Date.now() - cached.timestamp < CACHE_TTL)) {
                logger.info(`Returning cached org tree for ${alias} (${cached.totalPeople} people, depth=${cached.maxDepth})`);
                return cached.tree;
            }
            }
        } catch (e) {
            logger.warn('Failed to read org tree cache:', e.message);
        }
    }

    if (forceRefresh) {
        logger.info(`Force fresh org tree build requested for ${alias}`);
    }

    logger.info(`Building org tree for ${alias} (maxDepth=${maxDepth})...`);
    const tree = await _buildOrgNode(alias, 0, maxDepth);

    // Count total people
    const totalPeople = _countPeople(tree);

    // Cache to disk (include maxDepth so shallow caches don't poison deep requests)
    try {
        const brainDir = path.join(process.cwd(), 'brain');
        if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
        fs.writeFileSync(ORG_TREE_CACHE_PATH, JSON.stringify({
            alias,
            maxDepth,
            tree,
            totalPeople,
            timestamp: Date.now(),
            fetchedAt: new Date().toISOString()
        }, null, 2));
    } catch (e) {
        logger.warn('Failed to save org tree cache:', e.message);
    }

    logger.info(`Org tree built: ${totalPeople} people for ${alias}`);
    return tree;
}

async function _buildOrgNode(alias, depth, maxDepth) {
    const details = await fetchPersonName(alias);
    const node = { 
        alias, 
        name: details?.name || alias, 
        jobTitle: details?.jobTitle || null,
        level: details?.level || null,
        depth, 
        reports: [] 
    };

    if (depth >= maxDepth) return node;

    try {
        const reports = await fetchDirectReports(alias);
        // Reset the cache so fetchDirectReports works for the next person
        directReportsCache = null;
        cacheTimestamp = 0;

        for (const report of reports) {
            const childNode = await _buildOrgNode(report.alias, depth + 1, maxDepth);
            // ONLY cache if we have an object or if it's currently empty
            if (report.name && !nameCache[report.alias]) {
                nameCache[report.alias] = report.name;
            }
            node.reports.push(childNode);
        }
    } catch (e) {
        logger.warn(`Failed to fetch reports for ${alias}: ${e.message}`);
    }

    return node;
}

function _countPeople(node) {
    if (!node) return 0;
    let count = 1;
    for (const r of (node.reports || [])) {
        count += _countPeople(r);
    }
    return count;
}

/**
 * Get a flat list of all people in the org tree.
 * @param {string} alias - Root manager alias
 * @returns {Promise<Array>} Flat array of { alias, name, depth, managerAlias }
 */
async function getOrgFlatList(alias) {
    const tree = await fetchOrgTree(alias);
    if (!tree) return [];
    const flat = [];
    _flattenTree(tree, null, flat);
    return flat;
}

function _flattenTree(node, managerAlias, result) {
    result.push({
        alias: node.alias,
        name: node.name,
        jobTitle: node.jobTitle,
        level: node.level,
        depth: node.depth,
        managerAlias,
        hasReports: (node.reports || []).length > 0
    });
    for (const r of (node.reports || [])) {
        _flattenTree(r, node.alias, result);
    }
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

/**
 * Fetch the leadership chain above the given alias.
 * Walks UP the management tree via Phonetool (manager → manager's manager → ...)
 * up to `maxLevels` hops (default 4).
 *
 * Returns an array of { alias, name, email, level } objects, level 1 = direct manager.
 * Results are cached for 24 hours.
 */
const LEADERSHIP_CHAIN_CACHE_PATH = path.join(process.cwd(), 'brain', 'leadership-chain.json');
const LEADERSHIP_CHAIN_TTL = 24 * 60 * 60 * 1000; // 24 hours
let _leadershipChainCache = null;
let _leadershipChainCacheAlias = null;
let _leadershipChainCacheAt = 0;

async function fetchLeadershipChain(alias, maxLevels = 4) {
    if (!alias) return [];

    // In-memory cache
    if (_leadershipChainCache && _leadershipChainCacheAlias === alias && (Date.now() - _leadershipChainCacheAt < LEADERSHIP_CHAIN_TTL)) {
        return _leadershipChainCache;
    }

    // File cache
    try {
        if (fs.existsSync(LEADERSHIP_CHAIN_CACHE_PATH)) {
            const cached = JSON.parse(fs.readFileSync(LEADERSHIP_CHAIN_CACHE_PATH, 'utf8'));
            if (cached.alias === alias && (Date.now() - cached.timestamp < LEADERSHIP_CHAIN_TTL)) {
                _leadershipChainCache = cached.chain;
                _leadershipChainCacheAlias = alias;
                _leadershipChainCacheAt = cached.timestamp;
                logger.info(`Leadership chain loaded from file cache (${cached.chain.length} people)`);
                return cached.chain;
            }
        }
    } catch (e) { /* ignore */ }

    const chain = [];
    let currentAlias = alias;

    for (let level = 1; level <= maxLevels; level++) {
        try {
            const url = `https://phonetool.amazon.com/users/${currentAlias}`;
            const result = await readInternalWebsite(url);
            if (!result?.content) break;

            const content = typeof result.content === 'string'
                ? result.content
                : result.content.map(c => c.text || '').join('\n');

            // Extract JSON
            const jsonMatch = content.match(/^\s*(\{[\s\S]*\})\s*(?:⚠|$)/);
            const jsonStr = jsonMatch ? jsonMatch[1] : content;
            const parsed = JSON.parse(jsonStr);
            let userData = parsed.content || parsed;
            if (userData.content && !userData.manager) userData = userData.content;

            // manager field is typically { login, name } or just a string
            const mgr = userData.manager;
            if (!mgr) break;

            const mgrAlias = (typeof mgr === 'string' ? mgr : mgr.login || mgr.alias || '').trim();
            const mgrName  = (typeof mgr === 'string' ? mgr : mgr.name || mgr.display_name || mgrAlias).trim();
            if (!mgrAlias || mgrAlias === currentAlias) break;

            chain.push({
                alias: mgrAlias,
                name: mgrName,
                email: `${mgrAlias}@amazon.com`,
                level,
            });

            currentAlias = mgrAlias;
        } catch (e) {
            logger.warn(`Failed to fetch phonetool for ${currentAlias} while building leadership chain: ${e.message}`);
            break;
        }
    }

    logger.info(`Leadership chain for ${alias}: ${chain.map(p => p.alias).join(' → ')}`);

    // Persist
    _leadershipChainCache = chain;
    _leadershipChainCacheAlias = alias;
    _leadershipChainCacheAt = Date.now();
    try {
        const brainDir = path.join(process.cwd(), 'brain');
        if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
        fs.writeFileSync(LEADERSHIP_CHAIN_CACHE_PATH, JSON.stringify({ alias, chain, timestamp: Date.now() }, null, 2));
    } catch (e) { /* ignore */ }

    return chain;
}

module.exports = {
    getAlias,
    fetchDirectReports,
    fetchPersonName,
    fetchPersonNames,
    getCachedName,
    fetchOrgTree,
    getOrgFlatList,
    fetchLeadershipChain,
    clearCache
};
