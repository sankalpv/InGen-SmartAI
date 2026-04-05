/**
 * Builder Productivity Metrics — fetches SDH metrics from the
 * software-builder-insights-prod-mcp server via MCP.
 */

const mcpClient = require('./mcp-client');
const logger = require('./logger').child('BuilderProductivity');
const { readSetting } = require('./settings');

const SERVER = 'software-builder-insights-prod-mcp';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── In-memory cache ──────────────────────────────────────────────────────────
const metricsCache = new Map();

function getCacheKey(alias, periodType, windowStart, windowEnd) {
  return `${alias}|${periodType}|${windowStart}|${windowEnd}`;
}

function getCached(key) {
  const entry = metricsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    metricsCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  metricsCache.set(key, { data, ts: Date.now() });
}

// ─── Concurrency helper ──────────────────────────────────────────────────────
async function mapWithConcurrency(items, fn, limit = 3) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ─── Metric catalog ──────────────────────────────────────────────────────────
const METRIC_CATALOG = {
  velocity: [
    {
      name: 'pipeline_normalized_deployments_per_builder_week',
      version: 'v5_1',
      label: 'Normalized Deployments / Builder / Week',
      unit: 'count',
      format: 'decimal',
    },
    {
      name: 'code_review_open_to_merge_p50',
      version: 'v2_0',
      label: 'CR Open-to-Merge P50',
      unit: 'hours',
      format: 'hours',
    },
    {
      name: 'code_review_open_to_merge_p90',
      version: 'v2_0',
      label: 'CR Open-to-Merge P90',
      unit: 'hours',
      format: 'hours',
    },
    {
      name: 'pipeline_interventions_per_deploy',
      version: 'v8_0',
      label: 'Manual Interventions / Deploy',
      unit: 'ratio',
      format: 'decimal',
    },
    {
      name: 'pipeline_freshness',
      version: 'v3_0',
      label: 'Pipeline Freshness',
      unit: '%',
      format: 'percent',
    },
  ],
  quality: [
    {
      name: 'pipeline_rollback_rate',
      version: 'v4_0',
      label: 'Rollback Rate',
      unit: '%',
      format: 'percent',
    },
    {
      name: 'pipeline_rollbacks',
      version: 'v4_0',
      label: 'Rollbacks',
      unit: 'count',
      format: 'integer',
    },
  ],
  scale: [
    {
      name: 'builder_count',
      version: 'v1_4',
      label: 'Builder Count',
      unit: 'count',
      format: 'integer',
    },
    {
      name: 'pipeline_count',
      version: 'v2_0',
      label: 'Pipeline Count',
      unit: 'count',
      format: 'integer',
    },
    {
      name: 'pipeline_deploys_per_week',
      version: 'v4_1',
      label: 'Deploys / Week',
      unit: 'count',
      format: 'decimal',
    },
  ],
  onboarding: [
    {
      name: 'time_to_first_shipped_code_review_p50',
      version: 'v2_1',
      label: 'Time to First CR (P50)',
      unit: 'days',
      format: 'decimal',
    },
    {
      name: 'time_to_team_velocity_p50',
      version: 'v1_2',
      label: 'Time to Team Velocity (P50)',
      unit: 'days',
      format: 'decimal',
    },
  ],
};

function parseResult(result) {
  try {
    const text = result?.content?.[0]?.text || '';
    return typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return result?.content?.[0]?.text || result;
  }
}

/**
 * Convert a YYYY-MM-DD date string to the report format the API expects.
 */
function toReportFormat(dateStr, periodType) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  switch (periodType) {
    case 'month':
      return `${year}-${String(month).padStart(2, '0')}`;
    case 'quarter': {
      const q = Math.ceil(month / 3);
      return `${year}-Q${q}`;
    }
    case 'report_week': {
      const jan1 = new Date(Date.UTC(year, 0, 1));
      const dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
      const weekNum = Math.ceil(dayOfYear / 7);
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    }
    default:
      return dateStr;
  }
}

/**
 * Fetch a single metric for a leader alias over a time period.
 */
async function fetchMetric(metricDef, leaderAlias, periodType = 'month', windowStart, windowEnd) {
  try {
    const timePeriod = { periodType };

    if (periodType === 'day' || periodType.startsWith('last')) {
      timePeriod.periodDateRange = { windowStart, windowEnd };
    } else {
      timePeriod.periodReportRange = {
        windowStart: toReportFormat(windowStart, periodType),
        windowEnd: toReportFormat(windowEnd, periodType),
      };
    }

    const args = {
      getMetricDataRequest: {
        metricIdentifier: {
          metric: { domain: 'sdh', name: metricDef.name, version: metricDef.version },
          aggregateResource: { name: 'leader_login', value: leaderAlias },
        },
        timePeriod,
      },
    };
    const result = await mcpClient.callTool(SERVER, 'GetMetricData', args);
    if (result?.isError) {
      logger.warn(`Metric ${metricDef.name} returned error for ${leaderAlias}`);
      return null;
    }
    return parseResult(result);
  } catch (e) {
    if (
      e.code === -32602 ||
      (e.message && e.message.includes('Structured content does not match'))
    ) {
      if (e.data?.structuredContent) return e.data.structuredContent;
      if (e.data?.content) return parseResult(e.data);
    }
    // NoDataFoundException is expected for metrics that don't have data — don't pollute logs
    if (e.message && e.message.includes('NoDataFoundException')) {
      logger.debug(`No data for ${metricDef.name} (${leaderAlias})`);
      return null;
    }
    logger.warn(`Failed to fetch ${metricDef.name}: ${e.message}`);
    return null;
  }
}

/** Normalize raw data points: MCP returns `metricValue`, frontend expects `value`. */
function normalizeDataPoints(raw) {
  const rawPoints = raw?.metricData || raw?.data || [];
  return (Array.isArray(rawPoints) ? rawPoints : []).map((dp) => ({
    ...dp,
    value: dp.value ?? dp.metricValue,
  }));
}

/**
 * Fetch metrics for a single category using limited concurrency.
 */
async function fetchCategoryMetrics(category, leaderAlias, periodType, windowStart, windowEnd) {
  const metrics = METRIC_CATALOG[category];
  if (!metrics) return [];
  return mapWithConcurrency(
    metrics,
    async (metricDef) => {
      const raw = await fetchMetric(metricDef, leaderAlias, periodType, windowStart, windowEnd);
      return { ...metricDef, dataPoints: normalizeDataPoints(raw) };
    },
    2
  );
}

/**
 * Fetch all metrics (with cache + concurrency).
 */
async function fetchAllMetrics(leaderAlias, periodType = 'month', windowStart, windowEnd) {
  const cacheKey = getCacheKey(leaderAlias, periodType, windowStart, windowEnd);
  const cached = getCached(cacheKey);
  if (cached) {
    logger.info(`Cache hit for ${leaderAlias} (${periodType})`);
    return cached;
  }

  const results = {};
  for (const category of Object.keys(METRIC_CATALOG)) {
    results[category] = await fetchCategoryMetrics(
      category,
      leaderAlias,
      periodType,
      windowStart,
      windowEnd
    );
  }

  setCache(cacheKey, results);
  return results;
}

/**
 * Stream metrics category-by-category via a callback.
 * Calls onCategory(categoryKey, metricsArray) as each category completes.
 */
async function streamMetricsByCategory(
  leaderAlias,
  periodType,
  windowStart,
  windowEnd,
  onCategory
) {
  const cacheKey = getCacheKey(leaderAlias, periodType, windowStart, windowEnd);
  const cached = getCached(cacheKey);
  if (cached) {
    logger.info(`Cache hit (stream) for ${leaderAlias} (${periodType})`);
    for (const [cat, metrics] of Object.entries(cached)) {
      onCategory(cat, metrics);
    }
    return cached;
  }

  const results = {};
  for (const category of Object.keys(METRIC_CATALOG)) {
    results[category] = await fetchCategoryMetrics(
      category,
      leaderAlias,
      periodType,
      windowStart,
      windowEnd
    );
    onCategory(category, results[category]);
  }

  setCache(cacheKey, results);
  return results;
}

function getDefaultAlias() {
  return readSetting('phonetoolAlias', '');
}

module.exports = {
  fetchAllMetrics,
  fetchMetric,
  fetchCategoryMetrics,
  streamMetricsByCategory,
  getDefaultAlias,
  METRIC_CATALOG,
};
