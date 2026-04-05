const logger = require('./logger').child('CloudTuneService');
const mcpClient = require('./mcp-client');
const { readSetting } = require('./settings');

// ─── Authentication via builder-mcp ReadInternalWebsites ────────────────────────
// builder-mcp's MidwayHttpClient handles APES device compliance auth automatically.
// We call the Cerberus REST API URLs (not the SPA) to get structured JSON responses.
const MCP_SERVER = 'builder-mcp';
const MCP_TOOL = 'ReadInternalWebsites';

// ─── In-Memory Cache (24h TTL) ─────────────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

function cacheKey(...parts) {
  return parts.join('|');
}
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key, data) {
  if (data == null) return; // Never cache null/undefined results
  cache.set(key, { data, ts: Date.now() });
}
function clearCache(fleetId) {
  if (!fleetId) {
    cache.clear();
    return;
  }
  for (const k of cache.keys()) {
    if (k.startsWith(fleetId)) cache.delete(k);
  }
}

/**
 * Parse JSON from builder-mcp ReadInternalWebsites response text.
 */
function parseJsonFromMcpResponse(result) {
  try {
    let rawText = result?.content?.[0]?.text || result?.content?.content || '';
    if (!rawText) return null;

    // Step 1: The InGen mcp-client wraps the response in a JSON envelope:
    // {"content":{"status":"success","content":"# Content from ...\n```\n{actual JSON}\n```"}}
    // We need to unwrap it first.
    let innerContent = rawText;
    try {
      const envelope = JSON.parse(rawText);
      if (envelope?.content?.status === 'error') {
        logger.warn(`MCP returned error: ${envelope.content.error}`);
        return null;
      }
      if (envelope?.content?.content) {
        innerContent = envelope.content.content;
      }
    } catch {
      /* rawText is not JSON envelope, use as-is */
    }

    // Step 2: Extract JSON from markdown code block
    const jsonMatch = innerContent.match(/```[\s\S]*?\n([\s\S]*?)\n\s*```/);
    if (jsonMatch) innerContent = jsonMatch[1].trim();

    // Step 3: Find the first { or [ and extract the JSON portion
    const firstBrace = innerContent.indexOf('{');
    const firstBracket = innerContent.indexOf('[');
    let start = -1;
    if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) start = firstBrace;
    else if (firstBracket >= 0) start = firstBracket;

    if (start >= 0) {
      const isArray = innerContent[start] === '[';
      const lastClose = isArray ? innerContent.lastIndexOf(']') : innerContent.lastIndexOf('}');
      if (lastClose > start) {
        innerContent = innerContent.substring(start, lastClose + 1);
      }
    }

    // Step 4: Parse the JSON
    try {
      return JSON.parse(innerContent);
    } catch (e1) {
      // Step 5: Aggressive cleanup — strip all control characters
      // eslint-disable-next-line no-control-regex
      const cleaned = innerContent.replace(/[\x00-\x1F\x7F]/g, ' ');
      try {
        return JSON.parse(cleaned);
      } catch (e2) {
        logger.warn(`JSON parse failed: ${e2.message}`);
        logger.info(`Inner content (first 200): ${innerContent.substring(0, 200)}`);
      }
    }
    return null;
  } catch (e) {
    logger.warn(`Failed to parse MCP response: ${e.message}`);
    return null;
  }
}

class CloudTuneService {
  constructor() {
    this.apiBase = 'https://api.monthly-statement.cloudtune.amazon.dev';
  }

  getDefaultParams(month, scenario) {
    if (!month) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (!scenario) scenario = readSetting('cloudtuneDefaultScenario', 'Default CPT++');
    return { month, scenario, rateCard: 'yearly', fleetType: 'CONTAINER' };
  }

  // ─── Fetch via builder-mcp (handles Midway auth) ─────────────────────
  async _mcpFetch(url, ck) {
    const cached = getCached(ck);
    if (cached) return cached;

    logger.info(`MCP fetch: ${url.substring(0, 100)}...`);
    try {
      const result = await mcpClient.callTool(MCP_SERVER, MCP_TOOL, { inputs: [url] });
      // Debug: log the raw MCP response structure (INFO level so it shows)
      const rawText = result?.content?.[0]?.text || '';
      logger.info(
        `MCP raw response type=${typeof rawText}, len=${rawText.length}, first100=${JSON.stringify(rawText.substring(0, 100))}`
      );
      const parsed = parseJsonFromMcpResponse(result);
      if (parsed) {
        setCache(ck, parsed);
        return parsed;
      }
      logger.warn(`MCP returned no parseable JSON for ${ck}`);
      return null;
    } catch (e) {
      logger.error(`MCP fetch failed (${ck}): ${e.message}`);
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. FLEET COST SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  async fetchFleetSummary(fleetId, month = null, scenario = null) {
    const { month: m, scenario: s, rateCard, fleetType } = this.getDefaultParams(month, scenario);
    const ck = cacheKey(fleetId, m, s, 'summary');
    const url = `${this.apiBase}/fleets/${fleetId}/usage-costs/summary?rateCard=${encodeURIComponent(rateCard)}&fleetType=${encodeURIComponent(fleetType)}&month=${encodeURIComponent(m)}&scenario=${encodeURIComponent(s)}`;

    logger.info(`Fetching summary for fleet ${fleetId} (${m})`);
    const data = await this._mcpFetch(url, ck);
    if (data?.totalMonthToDateActuals != null) return data;

    // Fallback to previous month
    const prevMonth = this._prevMonth(m);
    const ck2 = cacheKey(fleetId, prevMonth, s, 'summary');
    const url2 = `${this.apiBase}/fleets/${fleetId}/usage-costs/summary?rateCard=${encodeURIComponent(rateCard)}&fleetType=${encodeURIComponent(fleetType)}&month=${encodeURIComponent(prevMonth)}&scenario=${encodeURIComponent(s)}`;
    const data2 = await this._mcpFetch(url2, ck2).catch(() => null);
    if (data2?.totalMonthToDateActuals != null) return { ...data2, _fallbackMonth: prevMonth };
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. USAGE-COSTS FETCHER (all tab views)
  // ═══════════════════════════════════════════════════════════════════════
  async _fetchUsageCosts(
    fleetId,
    month,
    scenario,
    {
      groupBy = 'PRODUCT',
      productCategories = ['AWS'],
      period = 'MONTH',
      plannable = null,
      dataTransfer = null,
    } = {}
  ) {
    const { month: m, scenario: s, rateCard, fleetType } = this.getDefaultParams(month, scenario);
    const ck = cacheKey(
      fleetId,
      m,
      s,
      groupBy,
      productCategories.join('+'),
      period,
      plannable || '',
      dataTransfer ?? ''
    );

    const cached = getCached(ck);
    if (cached) return cached;

    // Build URL with query params
    const parts = [
      `rateCard=${encodeURIComponent(rateCard)}`,
      `fleetType=${encodeURIComponent(fleetType)}`,
      `month=${encodeURIComponent(m)}`,
      `scenario=${encodeURIComponent(s)}`,
      `currentEstimateScenario=${encodeURIComponent(s)}`,
      `period=${encodeURIComponent(period)}`,
      `groupBy=${encodeURIComponent(groupBy)}`,
    ];
    productCategories.forEach((pc) => parts.push(`productCategories=${encodeURIComponent(pc)}`));
    if (plannable) parts.push(`plannable=${encodeURIComponent(plannable)}`);
    if (dataTransfer !== null) parts.push(`dataTransfer=${encodeURIComponent(dataTransfer)}`);

    const url = `${this.apiBase}/fleets/${fleetId}/usage-costs?${parts.join('&')}`;
    const data = await this._mcpFetch(url, ck);
    const result = data?.fleetUsageCosts || [];
    if (result.length > 0) setCache(ck, result);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TAB-SPECIFIC FETCHERS
  // ═══════════════════════════════════════════════════════════════════════
  async fetchAwsInfraByFleet(fid, m, s) {
    return this._normalizeFleets(
      await this._fetchUsageCosts(fid, m, s, { groupBy: 'FLEET', productCategories: ['AWS'] })
    );
  }
  async fetchAwsInfraSummary(fid, m, s) {
    return this._normalizeProducts(
      await this._fetchUsageCosts(fid, m, s, { groupBy: 'PRODUCT', productCategories: ['AWS'] })
    );
  }
  async fetchAwsPlannedProducts(fid, m, s) {
    return this._normalizeProducts(
      await this._fetchUsageCosts(fid, m, s, {
        groupBy: 'PRODUCT',
        productCategories: ['AWS'],
        plannable: 'DOLLAR_PLANNABLE',
        dataTransfer: false,
      })
    );
  }
  async fetchAwsOtherProducts(fid, m, s) {
    return this._normalizeProducts(
      await this._fetchUsageCosts(fid, m, s, {
        groupBy: 'PRODUCT',
        productCategories: ['AWS'],
        plannable: 'NON_DOLLAR_PLANNABLE',
        dataTransfer: false,
      })
    );
  }
  async fetchAwsDataTransfer(fid, m, s) {
    return this._normalizeProducts(
      await this._fetchUsageCosts(fid, m, s, {
        groupBy: 'PRODUCT',
        productCategories: ['AWS'],
        dataTransfer: true,
      })
    );
  }
  async fetchAllInfraByFleet(fid, m, s) {
    return this._normalizeFleets(
      await this._fetchUsageCosts(fid, m, s, {
        groupBy: 'FLEET',
        productCategories: ['AWS', 'MAWS'],
      })
    );
  }
  async fetchSdoServicesSummary(fid, m, s) {
    return this._normalizeProducts(
      await this._fetchUsageCosts(fid, m, s, { groupBy: 'PRODUCT', productCategories: ['MAWS'] })
    );
  }
  async fetchImrGoalByFleet(fid, m, s) {
    return this._normalizeFleets(
      await this._fetchUsageCosts(fid, m, s, {
        groupBy: 'FLEET',
        productCategories: ['AWS', 'MAWS'],
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FETCH ALL TABS IN PARALLEL
  // ═══════════════════════════════════════════════════════════════════════
  async fetchAllTabs(fleetId, month = null, scenario = null) {
    logger.info(`Fetching ALL tab data for fleet ${fleetId} via builder-mcp...`);
    const [
      summary,
      awsFleet,
      awsProducts,
      awsPlanned,
      awsOther,
      awsDataXfer,
      allFleet,
      sdoProducts,
      imrGoal,
    ] = await Promise.allSettled([
      this.fetchFleetSummary(fleetId, month, scenario),
      this.fetchAwsInfraByFleet(fleetId, month, scenario),
      this.fetchAwsInfraSummary(fleetId, month, scenario),
      this.fetchAwsPlannedProducts(fleetId, month, scenario),
      this.fetchAwsOtherProducts(fleetId, month, scenario),
      this.fetchAwsDataTransfer(fleetId, month, scenario),
      this.fetchAllInfraByFleet(fleetId, month, scenario),
      this.fetchSdoServicesSummary(fleetId, month, scenario),
      this.fetchImrGoalByFleet(fleetId, month, scenario),
    ]);

    const val = (r) => (r.status === 'fulfilled' ? r.value : null);
    const errMsg = (r) => (r.status === 'rejected' ? r.reason?.message : null);

    const errors = [];
    if (summary.status === 'rejected') errors.push(`Summary: ${errMsg(summary)}`);
    [
      awsFleet,
      awsProducts,
      awsPlanned,
      awsOther,
      awsDataXfer,
      allFleet,
      sdoProducts,
      imrGoal,
    ].forEach((r, i) => {
      if (r.status === 'rejected') errors.push(`Tab ${i + 1}: ${errMsg(r)}`);
    });

    const result = {
      summary: val(summary),
      errors,
      tabs: {
        awsInfraByFleet: val(awsFleet) || [],
        awsInfraSummary: val(awsProducts) || [],
        awsPlannedProducts: val(awsPlanned) || [],
        awsOtherProducts: val(awsOther) || [],
        awsDataTransfer: val(awsDataXfer) || [],
        allInfraByFleet: val(allFleet) || [],
        sdoServicesSummary: val(sdoProducts) || [],
        imrGoalByFleet: val(imrGoal) || [],
      },
    };

    // Compute summary cards
    const s = result.summary || {};
    const actuals = s.totalMonthToDateActuals || 0;
    const scenarioCost = s.totalScenarioCost || 0;
    const lastDate = s.lastProcessedDate;
    const daysInMonth = lastDate
      ? new Date(new Date(lastDate).getFullYear(), new Date(lastDate).getMonth() + 1, 0).getDate()
      : 30;
    const dayOfMonth = lastDate ? new Date(lastDate).getDate() : 15;
    const runRate = dayOfMonth > 0 ? (actuals / dayOfMonth) * daysInMonth : actuals;

    result.summaryCards = {
      actualsForMonth: {
        value: actuals,
        momPct: s.varianceToPreviousMonth,
        yoyPct: s.varianceToPreviousYear,
      },
      totalScenarioCost: { value: scenarioCost, variancePct: s.monthToDateVarianceToScenario },
      estimatedSpendActuals: {
        value: s.totalMonthToDateEstimateByActuals || runRate,
        variancePct:
          s.estimatedByActualsVarianceToScenario ||
          (scenarioCost > 0 ? ((runRate - scenarioCost) / scenarioCost) * 100 : 0),
        projectedDirection:
          (s.totalMonthToDateEstimateByActuals || runRate) < scenarioCost
            ? 'underspend'
            : 'overspend',
      },
      estimatedSpendScenario: {
        value: s.totalMonthToDateEstimateByScenario || scenarioCost,
        variancePct: s.estimatedByScenarioVarianceToScenario || 0,
        projectedDirection: 'neutral',
      },
    };

    const totalRows = Object.values(result.tabs).reduce((sum, t) => sum + t.length, 0);
    logger.info(`All tabs fetched: ${totalRows} total rows, ${errors.length} errors`);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NORMALIZERS
  // ═══════════════════════════════════════════════════════════════════════
  _normalizeProducts(raw) {
    return (raw || [])
      .filter((p) => p.usageCostSummary?.current?.actualCost != null)
      .map((p) => ({
        productName: p.productName || p.fleetName || 'Unknown',
        actualCost: p.usageCostSummary.current.actualCost,
        scenarioCost: p.usageCostSummary.current.scenarioCost || 0,
        previousMonth: p.usageCostSummary.previousMonth?.actualCost || null,
        previousYear: p.usageCostSummary.previousYear?.actualCost || null,
        isNonGoalProduct: p.isNonGoalProduct || false,
      }))
      .sort((a, b) => b.actualCost - a.actualCost);
  }

  _normalizeFleets(raw) {
    return (raw || [])
      .filter((f) => f.usageCostSummary?.current?.actualCost != null)
      .map((f) => ({
        fleetName: f.fleetName || 'Unknown',
        resourceId: f.resourceId || '',
        hasChildren: f.hasChildren || false,
        actualCost: f.usageCostSummary.current.actualCost,
        scenarioCost: f.usageCostSummary.current.scenarioCost || 0,
        previousMonth: f.usageCostSummary.previousMonth?.actualCost || null,
        previousYear: f.usageCostSummary.previousYear?.actualCost || null,
      }))
      .sort((a, b) => b.actualCost - a.actualCost);
  }

  async resolveFleetFromAlias(alias) {
    const mapping = { sankalpv: '11740979', ingen: '2539268' };
    return mapping[(alias || '').toLowerCase()] || null;
  }

  _prevMonth(monthStr) {
    const d = new Date(monthStr);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  clearCache(fleetId) {
    clearCache(fleetId);
  }
}

module.exports = new CloudTuneService();
