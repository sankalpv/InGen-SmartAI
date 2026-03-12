/**
 * Bedrock Client for SmartAI
 * Uses Claude Opus on Bedrock for high-quality AI generation on key pages:
 * Team Health, Code Metrics, Ticket Health, WBR Prep.
 * 
 * Auth: AWS Bearer Token (ABSK API Key) via env var AWS_BEARER_TOKEN_BEDROCK
 * Falls back to Ollama if no bearer token is configured.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('./logger').child('Bedrock');

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');

function getConfig() {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        return {
            region: settings.bedrock?.region || process.env.AWS_REGION || 'us-west-2',
            modelId: settings.bedrock?.modelId || process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
            maxTokens: settings.bedrock?.maxTokens || 8192,
            temperature: settings.bedrock?.temperature ?? settings.aiTemperature ?? 0.25,
        };
    } catch (e) {
        return {
            region: process.env.AWS_REGION || 'us-west-2',
            modelId: process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
            maxTokens: 8192,
            temperature: 0.25,
        };
    }
}

function getBearerToken() {
    return process.env.AWS_BEARER_TOKEN_BEDROCK || null;
}

function isAvailable() {
    return !!getBearerToken();
}

/**
 * Make an HTTPS request to Bedrock Runtime API using bearer token
 */
function bedrockHttpRequest(reqPath, body, options = {}) {
    const config = getConfig();
    const token = getBearerToken();

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(body);
        const reqOptions = {
            hostname: `bedrock-runtime.${config.region}.amazonaws.com`,
            port: 443,
            path: reqPath,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': options.accept || 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = https.request(reqOptions, (res) => {
            if (options.stream) {
                resolve(res);
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`Bedrock API error ${res.statusCode}: ${data}`));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse Bedrock response: ${data.substring(0, 500)}`));
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.setTimeout(180000, () => { req.destroy(); reject(new Error('Bedrock request timeout (180s)')); });
        req.write(postData);
        req.end();
    });
}

/**
 * Generate a completion using Bedrock Claude Opus
 */
async function generate(prompt, options = {}) {
    const config = getConfig();
    const modelId = options.modelId || config.modelId;

    const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.maxTokens || config.maxTokens,
        temperature: options.temperature ?? config.temperature,
        messages: [
            { role: 'user', content: prompt }
        ],
    };

    if (options.system) {
        body.system = options.system;
    }

    const encodedModelId = encodeURIComponent(modelId);
    logger.info(`Generating completion (model: ${modelId}, prompt: ${prompt.length} chars)`);

    const result = await bedrockHttpRequest(`/model/${encodedModelId}/invoke`, body);
    const text = result.content?.[0]?.text || '';

    logger.info(`Generation complete (${text.length} chars)`);
    return text;
}

/**
 * Stream a completion using Bedrock Claude Opus
 */
async function streamGenerate(prompt, onChunk, options = {}) {
    const config = getConfig();
    const modelId = options.modelId || config.modelId;

    const body = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: options.maxTokens || config.maxTokens,
        temperature: options.temperature ?? config.temperature,
        messages: [
            { role: 'user', content: prompt }
        ],
    };

    if (options.system) {
        body.system = options.system;
    }

    const encodedModelId = encodeURIComponent(modelId);
    logger.info(`Streaming completion (model: ${modelId})`);

    const res = await bedrockHttpRequest(
        `/model/${encodedModelId}/invoke-with-response-stream`,
        body,
        { stream: true, accept: 'application/vnd.amazon.eventstream' }
    );

    return new Promise((resolve, reject) => {
        if (res.statusCode >= 400) {
            let errorData = '';
            res.on('data', (chunk) => { errorData += chunk; });
            res.on('end', () => {
                reject(new Error(`Bedrock stream error ${res.statusCode}: ${errorData}`));
            });
            return;
        }

        let fullText = '';
        let buffer = Buffer.alloc(0);

        res.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            
            while (buffer.length > 0) {
                if (buffer.length < 4) break;
                const totalLength = buffer.readUInt32BE(0);
                if (buffer.length < totalLength) break;

                const eventBytes = buffer.slice(0, totalLength);
                buffer = buffer.slice(totalLength);

                try {
                    const headersLength = eventBytes.readUInt32BE(4);
                    const payloadStart = 12 + headersLength;
                    const payloadEnd = totalLength - 4;
                    
                    if (payloadEnd > payloadStart) {
                        const payload = eventBytes.slice(payloadStart, payloadEnd).toString('utf8');
                        
                        try {
                            const parsed = JSON.parse(payload);
                            
                            if (parsed.bytes) {
                                const decoded = Buffer.from(parsed.bytes, 'base64').toString('utf8');
                                try {
                                    const innerParsed = JSON.parse(decoded);
                                    if (innerParsed.type === 'content_block_delta' && innerParsed.delta?.text) {
                                        fullText += innerParsed.delta.text;
                                        if (onChunk) onChunk(innerParsed.delta.text);
                                    }
                                } catch (e) { /* not JSON */ }
                            } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                                fullText += parsed.delta.text;
                                if (onChunk) onChunk(parsed.delta.text);
                            }
                        } catch (e) { /* skip */ }
                    }
                } catch (e) { /* skip */ }
            }
        });

        res.on('end', () => {
            logger.info(`Stream complete (${fullText.length} chars)`);
            resolve(fullText);
        });

        res.on('error', (e) => reject(e));
    });
}

// Log auth status on first load
const token = getBearerToken();
if (token) {
    logger.info(`Bedrock auth: Bearer token configured — ${token.substring(0, 20)}...`);
} else {
    logger.info('Bedrock auth: No bearer token. Pages will use Ollama.');
}

module.exports = {
    generate,
    streamGenerate,
    getConfig,
    isAvailable,
};
