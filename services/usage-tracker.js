/**
 * InGen Usage Tracker — CloudWatch Metrics
 * 
 * Tracks page views, API calls, AI generations, feature usage, and sessions.
 * Buffers events locally and flushes to CloudWatch every 5 minutes.
 * 
 * Uses native https + AWS Signature V4 (no aws-sdk dependency).
 * Graceful degradation: if CloudWatch is unreachable, events are logged and discarded.
 * 
 * Usage:
 *   const tracker = require('./usage-tracker');
 *   tracker.trackPageView('Dashboard');
 *   tracker.trackAPICall('/api/analyze');
 *   tracker.trackAIGeneration('DailyBriefing');
 *   tracker.trackFeature('EmailTriage');
 *   tracker.trackError('Outlook');
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger').child('UsageTracker');

// --- Configuration ---

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
const NAMESPACE = 'InGen/Usage';
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 500; // Max events before force flush

// --- State ---

let eventBuffer = [];
let flushTimer = null;
let sessionId = null;
let isEnabled = true;

// --- AWS Signature V4 ---

function getCredentials() {
    return {
        accessKeyId: process.env.AWS_CW_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_CW_SECRET_ACCESS_KEY || '',
        region: process.env.AWS_CW_REGION || 'us-east-1',
    };
}

function hmac(key, data, encoding) {
    return crypto.createHmac('sha256', key).update(data).digest(encoding);
}

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(secretKey, dateStamp, region, service) {
    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    return kSigning;
}

function signRequest(method, host, path, body, credentials) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const { accessKeyId, secretAccessKey, region } = credentials;
    const service = 'monitoring';

    const canonicalHeaders = `content-type:application/x-www-form-urlencoded\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const payloadHash = sha256(body);

    const canonicalRequest = [
        method, path, '', canonicalHeaders, signedHeaders, payloadHash
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)
    ].join('\n');

    const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = hmac(signingKey, stringToSign, 'hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': host,
        'X-Amz-Date': amzDate,
        'Authorization': authHeader,
    };
}

// --- CloudWatch API ---

function buildPutMetricDataBody(metricData) {
    const params = new URLSearchParams();
    params.append('Action', 'PutMetricData');
    params.append('Version', '2010-08-01');
    params.append('Namespace', NAMESPACE);

    metricData.forEach((metric, i) => {
        const prefix = `MetricData.member.${i + 1}`;
        params.append(`${prefix}.MetricName`, metric.metricName);
        params.append(`${prefix}.Value`, String(metric.value));
        params.append(`${prefix}.Unit`, metric.unit || 'Count');
        params.append(`${prefix}.Timestamp`, metric.timestamp);

        if (metric.dimensions) {
            metric.dimensions.forEach((dim, j) => {
                params.append(`${prefix}.Dimensions.member.${j + 1}.Name`, dim.name);
                params.append(`${prefix}.Dimensions.member.${j + 1}.Value`, dim.value);
            });
        }
    });

    return params.toString();
}

async function putMetricData(metricData) {
    const creds = getCredentials();
    if (!creds.accessKeyId || !creds.secretAccessKey) {
        logger.debug('No CloudWatch credentials configured — skipping flush');
        return;
    }

    const host = `monitoring.${creds.region}.amazonaws.com`;
    const reqPath = '/';
    const body = buildPutMetricDataBody(metricData);
    const headers = signRequest('POST', host, reqPath, body, creds);

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: host,
            port: 443,
            path: reqPath,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    logger.warn(`CloudWatch PutMetricData failed (${res.statusCode}): ${data.substring(0, 300)}`);
                    reject(new Error(`CloudWatch error ${res.statusCode}`));
                } else {
                    resolve(data);
                }
            });
        });

        req.on('error', (e) => {
            logger.warn(`CloudWatch request error: ${e.message}`);
            reject(e);
        });
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('CloudWatch timeout')); });
        req.write(body);
        req.end();
    });
}

// --- Helpers ---

function getUserAlias() {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
        return settings.phonetoolAlias || os.userInfo().username || 'unknown';
    } catch {
        return os.userInfo().username || 'unknown';
    }
}

function getPlatform() {
    return os.platform() === 'win32' ? 'Windows' : 'macOS';
}

function getSessionId() {
    if (!sessionId) {
        sessionId = `${getUserAlias()}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }
    return sessionId;
}

function isTrackingEnabled() {
    if (!isEnabled) return false;
    const creds = getCredentials();
    return !!(creds.accessKeyId && creds.secretAccessKey);
}

// --- Event Tracking ---

function trackEvent(metricName, dimensions = {}, value = 1, unit = 'Count') {
    if (!isTrackingEnabled()) return;

    const alias = getUserAlias();
    const allDimensions = [
        { name: 'UserAlias', value: alias },
        ...Object.entries(dimensions).map(([name, value]) => ({ name, value: String(value) })),
    ];

    eventBuffer.push({
        metricName,
        value,
        unit,
        timestamp: new Date().toISOString(),
        dimensions: allDimensions,
    });

    // Force flush if buffer is full
    if (eventBuffer.length >= MAX_BUFFER_SIZE) {
        flush();
    }
}

function trackPageView(pageName) {
    trackEvent('PageView', { PageName: pageName });
}

function trackAPICall(endpoint) {
    trackEvent('APICall', { Endpoint: endpoint });
}

function trackAIGeneration(type) {
    trackEvent('AIGeneration', { Type: type });
}

function trackFeature(feature) {
    trackEvent('FeatureUsage', { Feature: feature });
}

function trackError(module) {
    trackEvent('ErrorCount', { Module: module });
}

function trackSessionStart() {
    trackEvent('SessionStart', { Platform: getPlatform(), SessionId: getSessionId() });
}

function trackDailyActiveUser() {
    trackEvent('DailyActiveUser', { Platform: getPlatform() });
}

// --- Flush ---

async function flush() {
    if (eventBuffer.length === 0) return;

    // CloudWatch PutMetricData supports max 1000 metric data points per call,
    // but we batch in chunks of 20 (recommended for dimensions)
    const events = eventBuffer.splice(0, eventBuffer.length);
    const CHUNK_SIZE = 20;

    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
        const chunk = events.slice(i, i + CHUNK_SIZE);
        try {
            await putMetricData(chunk);
            logger.debug(`Flushed ${chunk.length} metrics to CloudWatch`);
        } catch (e) {
            logger.warn(`Failed to flush ${chunk.length} metrics: ${e.message}`);
            // Don't re-buffer — just log and move on to avoid infinite growth
        }
    }
}

// --- Lifecycle ---

function start() {
    if (!isTrackingEnabled()) {
        logger.info('Usage tracking disabled (no CloudWatch credentials)');
        return;
    }

    logger.info(`Usage tracking enabled — flushing to CloudWatch every ${FLUSH_INTERVAL_MS / 1000}s (namespace: ${NAMESPACE})`);

    // Track session start
    trackSessionStart();
    trackDailyActiveUser();

    // Start periodic flush
    if (!flushTimer) {
        flushTimer = setInterval(() => {
            flush().catch(e => logger.warn('Periodic flush failed:', e.message));
        }, FLUSH_INTERVAL_MS);

        // Don't let the timer keep the process alive
        if (flushTimer.unref) flushTimer.unref();
    }
}

function stop() {
    if (flushTimer) {
        clearInterval(flushTimer);
        flushTimer = null;
    }
    // Final flush
    return flush();
}

function getStats() {
    return {
        enabled: isTrackingEnabled(),
        bufferedEvents: eventBuffer.length,
        sessionId: getSessionId(),
        userAlias: getUserAlias(),
        platform: getPlatform(),
    };
}

// Auto-start on require
start();

// Graceful shutdown
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('beforeExit', () => stop());

module.exports = {
    trackPageView,
    trackAPICall,
    trackAIGeneration,
    trackFeature,
    trackError,
    trackSessionStart,
    trackDailyActiveUser,
    trackEvent,
    flush,
    start,
    stop,
    getStats,
};
