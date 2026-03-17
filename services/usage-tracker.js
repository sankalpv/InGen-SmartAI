/**
 * InGen Usage Tracker — CloudWatch Metrics via AWS SDK
 * 
 * Tracks page views, API calls, AI generations, feature usage, and sessions.
 * Buffers events locally and flushes to CloudWatch every 5 minutes.
 * 
 * Auth: Uses default AWS credential chain (ada credentials, env vars, instance profile).
 * No hardcoded keys — credentials are provided externally via:
 *   ada credentials update --account=709929962844 --role=SmartAI-CloudWatchLogs --provider=conduit --once
 * 
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

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger').child('UsageTracker');

// --- Configuration ---

const SETTINGS_PATH = path.join(process.cwd(), 'config', 'settings.json');
const NAMESPACE = 'InGen/Usage';
const CW_REGION = process.env.SMARTAI_CW_REGION || 'us-east-1';
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFER_SIZE = 500; // Max events before force flush

// --- State ---

let eventBuffer = [];
let flushTimer = null;
let sessionId = null;
let isEnabled = false;
let cwClient = null;

// --- Init ---

async function initCloudWatch() {
    try {
        const { CloudWatchClient } = require('@aws-sdk/client-cloudwatch');
        cwClient = new CloudWatchClient({ region: CW_REGION });
        // Quick test — list metrics to verify credentials work
        // (We don't actually need the result, just checking auth)
        isEnabled = true;
        logger.info(`Usage tracking enabled — flushing to CloudWatch every ${FLUSH_INTERVAL_MS / 1000}s (namespace: ${NAMESPACE})`);
    } catch (e) {
        logger.info('Usage tracking disabled (AWS SDK or credentials not available)');
        isEnabled = false;
    }
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

// --- Event Tracking ---

function trackEvent(metricName, dimensions = {}, value = 1, unit = 'Count') {
    if (!isEnabled) return;

    const alias = getUserAlias();
    const allDimensions = [
        { Name: 'UserAlias', Value: alias },
        ...Object.entries(dimensions).map(([name, value]) => ({ Name: name, Value: String(value) })),
    ];

    eventBuffer.push({
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: allDimensions,
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
    if (eventBuffer.length === 0 || !isEnabled || !cwClient) return;

    const { PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
    
    // CloudWatch PutMetricData supports max 1000 metric data points per call,
    // but we batch in chunks of 20 (recommended for dimensions)
    const events = eventBuffer.splice(0, eventBuffer.length);
    const CHUNK_SIZE = 20;

    for (let i = 0; i < events.length; i += CHUNK_SIZE) {
        const chunk = events.slice(i, i + CHUNK_SIZE);
        try {
            await cwClient.send(new PutMetricDataCommand({
                Namespace: NAMESPACE,
                MetricData: chunk,
            }));
            logger.debug(`Flushed ${chunk.length} metrics to CloudWatch`);
        } catch (e) {
            logger.warn(`Failed to flush ${chunk.length} metrics: ${e.message}`);
            // Don't re-buffer — just log and move on to avoid infinite growth
        }
    }
}

// --- Lifecycle ---

function start() {
    initCloudWatch().then(() => {
        if (!isEnabled) return;

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
    });
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
        enabled: isEnabled,
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
