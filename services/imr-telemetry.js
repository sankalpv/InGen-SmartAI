/**
 * IMR Telemetry Service — interfaces with Cerberus/CloudTune
 * Streams all tab data (summary, 8 views, AI insights + LLM narrative) via SSE.
 */

const logger = require('./logger').child('IMRTelemetry');
const cloudtune = require('./cloudtune');
const { readSetting, writeSetting } = require('./settings');

// Try to load AI service for LLM narrative
let ai;
try {
  ai = require('./ai');
} catch {
  ai = null;
}

async function streamIMRData(fleetId, month, scenario, forceRefresh, onEvent, onStatus) {
  onStatus('[INFO] Initializing Cerberus Financial Mission Control...');

  try {
    if (!fleetId) {
      const alias = readSetting('phonetoolAlias', '');
      fleetId =
        readSetting('cloudtuneFleetId') ||
        (alias ? await cloudtune.resolveFleetFromAlias(alias) : null);
    }

    if (!fleetId) {
      onStatus('[WARN] No Cerberus Fleet ID configured. Please set cloudtuneFleetId in settings.');
      return null;
    }

    if (!readSetting('cloudtuneFleetId')) writeSetting('cloudtuneFleetId', fleetId);

    if (forceRefresh) {
      onStatus('[INFO] Force refresh — clearing 24h cache...');
      cloudtune.clearCache(fleetId);
    }

    onStatus(
      `[PROCESS] Querying Cerberus for Fleet ${fleetId} — fetching all views in parallel...`
    );

    const allData = await cloudtune.fetchAllTabs(fleetId, month, scenario);

    if (allData.errors?.length > 0) {
      for (const err of allData.errors) onStatus(`[ERROR] ${err}`);
    }

    // ─── 1. Summary ──────────────────────────────────────────────────────
    if (allData.summary) {
      onStatus(
        `[SUCCESS] Summary synchronized — Last processed: ${allData.summary.lastProcessedDate || 'N/A'}`
      );
      onEvent('summary', {
        fleetId,
        lastProcessedDate: allData.summary.lastProcessedDate,
        totalMonthToDateActuals: allData.summary.totalMonthToDateActuals,
        totalScenarioCost: allData.summary.totalScenarioCost,
        varianceToScenario: allData.summary.monthToDateVarianceToScenario,
        varianceMoM: allData.summary.varianceToPreviousMonth,
        varianceYoY: allData.summary.varianceToPreviousYear,
      });
      onEvent('summaryCards', allData.summaryCards);
      onStatus('[SUCCESS] Enhanced summary cards computed.');
    } else {
      onStatus('[ERROR] No summary data from Cerberus.');
      onEvent('error', {
        error: `No summary for fleet ${fleetId}. Run "mwinit" and verify access.`,
      });
    }

    // ─── 2. Budget Pacing Gauge ─────────────────────────────────────────
    if (allData.summary) {
      const pacing = computeBudgetPacing(allData.summary);
      onEvent('pacing', pacing);
      onStatus(
        `[SUCCESS] Budget pacing: ${pacing.pacingLabel} (${pacing.projectedPct.toFixed(1)}% of budget)`
      );
    }

    // ─── 3. Tab Views ───────────────────────────────────────────────────
    const tabMeta = [
      { key: 'awsInfraByFleet', label: 'AWS Infrastructure by Fleet', type: 'fleet' },
      { key: 'awsInfraSummary', label: 'AWS Infrastructure Summary', type: 'product' },
      { key: 'awsPlannedProducts', label: 'AWS Planned Products', type: 'product' },
      { key: 'awsOtherProducts', label: 'AWS Other Products', type: 'product' },
      { key: 'awsDataTransfer', label: 'AWS Data Transfer', type: 'product' },
      { key: 'allInfraByFleet', label: 'All Infrastructure (AWS+SDO)', type: 'fleet' },
      { key: 'sdoServicesSummary', label: 'SDO Services', type: 'product' },
      { key: 'imrGoalByFleet', label: 'IMR Goal by Fleet', type: 'fleet' },
    ];

    for (const tab of tabMeta) {
      const data = allData.tabs[tab.key] || [];
      onEvent('tab', { key: tab.key, label: tab.label, type: tab.type, data });
      onStatus(`[SUCCESS] ${tab.label} — ${data.length} rows.`);
    }

    // ─── 4. Heuristic Insights + Anomaly Detection ──────────────────────
    onStatus('[PROCESS] Running InGen cost analysis...');
    const insights = generateInsights(allData.summary, allData.tabs, fleetId);
    onEvent('insights', { insights });
    onStatus(`[SUCCESS] ${insights.length} insights generated.`);

    // ─── 5. LLM Executive Narrative ─────────────────────────────────────
    if (ai && allData.summary) {
      onStatus('[PROCESS] Generating AI executive narrative via Bedrock...');
      try {
        const narrative = await generateLLMNarrative(allData, fleetId);
        if (narrative) {
          onEvent('narrative', { text: narrative });
          onStatus('[SUCCESS] AI executive narrative ready.');
        }
      } catch (e) {
        onStatus(`[WARN] LLM narrative failed: ${e.message}`);
      }
    }

    onStatus('[SUCCESS] All Cerberus telemetry streams synchronized.');
    return allData;
  } catch (e) {
    logger.error(`Failed to stream IMR data: ${e.message}`);
    onStatus(`[ERROR] Cerberus link failure: ${e.message}`);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGET PACING
// ═══════════════════════════════════════════════════════════════════════════════

function computeBudgetPacing(summary) {
  const actuals = summary.totalMonthToDateActuals || 0;
  const budget = summary.totalScenarioCost || 0;
  const estByActuals = summary.totalMonthToDateEstimateByActuals || 0;
  const estByScenario = summary.totalMonthToDateEstimateByScenario || 0;
  const lastDate = summary.lastProcessedDate;

  const daysInMonth = lastDate
    ? new Date(new Date(lastDate).getFullYear(), new Date(lastDate).getMonth() + 1, 0).getDate()
    : 30;
  const dayOfMonth = lastDate ? new Date(lastDate).getDate() : 1;
  const daysRemaining = daysInMonth - dayOfMonth;
  const pctMonthComplete = dayOfMonth / daysInMonth;

  const projectedTotal =
    estByActuals || (dayOfMonth > 0 ? (actuals / dayOfMonth) * daysInMonth : actuals);
  const projectedPct = budget > 0 ? (projectedTotal / budget) * 100 : 0;
  const surplus = budget - projectedTotal;

  let pacingLabel, pacingColor;
  if (projectedPct > 110) {
    pacingLabel = 'OVER BUDGET';
    pacingColor = '#ef4444';
  } else if (projectedPct > 100) {
    pacingLabel = 'AT RISK';
    pacingColor = '#f59e0b';
  } else if (projectedPct > 85) {
    pacingLabel = 'ON TRACK';
    pacingColor = '#10b981';
  } else {
    pacingLabel = 'UNDER BUDGET';
    pacingColor = '#3b82f6';
  }

  return {
    actuals,
    budget,
    projectedTotal,
    projectedPct,
    surplus,
    daysInMonth,
    dayOfMonth,
    daysRemaining,
    pctMonthComplete,
    estByActuals,
    estByScenario,
    pacingLabel,
    pacingColor,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED HEURISTIC INSIGHTS + ANOMALY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function generateInsights(summary, tabs, fleetId) {
  const insights = [];
  if (!summary) {
    insights.push({
      severity: 'warning',
      category: 'auth',
      text: `No summary data for fleet ${fleetId}. Check Midway authentication.`,
    });
    return insights;
  }

  const variance = summary.monthToDateVarianceToScenario || 0;
  const mom = summary.varianceToPreviousMonth;
  const yoy = summary.varianceToPreviousYear;
  const actuals = summary.totalMonthToDateActuals || 0;
  const budget = summary.totalScenarioCost || 0;

  // ─── Budget Health ────────────────────────────────────────────────────
  if (Math.abs(variance) > 90) {
    insights.push({
      severity: 'info',
      category: 'pacing',
      text: `Early billing cycle — actuals ${fmtK(actuals)} are ${Math.abs(variance).toFixed(0)}% below the ${fmtK(budget)} scenario. Expected for early month.`,
    });
  } else if (variance > 10) {
    insights.push({
      severity: 'warning',
      category: 'budget',
      text: `⚠️ Fleet is ${variance.toFixed(1)}% OVER budget (${fmtK(actuals)} vs ${fmtK(budget)} scenario). Immediate review needed.`,
    });
  } else if (variance > 0) {
    insights.push({
      severity: 'info',
      category: 'budget',
      text: `Spend is ${variance.toFixed(1)}% above scenario — within tolerance but monitor closely.`,
    });
  } else if (variance < -5 && Math.abs(variance) < 90) {
    insights.push({
      severity: 'success',
      category: 'budget',
      text: `✅ ${Math.abs(variance).toFixed(1)}% under budget — surplus of ${fmtK(budget - actuals)} available for reinvestment.`,
    });
  } else {
    insights.push({
      severity: 'success',
      category: 'budget',
      text: `✅ Spend aligned with targets (${variance.toFixed(1)}% variance).`,
    });
  }

  // ─── MoM Trend ────────────────────────────────────────────────────────
  if (mom != null) {
    if (Math.abs(mom) > 30) {
      insights.push({
        severity: mom > 0 ? 'warning' : 'success',
        category: 'trend',
        text: `📊 MoM: Costs ${mom > 0 ? 'surged' : 'dropped'} ${Math.abs(mom).toFixed(1)}% vs last month. ${mom > 30 ? 'Investigate new workloads or pricing changes.' : 'Optimization efforts paying off.'}`,
      });
    } else if (Math.abs(mom) > 10) {
      insights.push({
        severity: 'info',
        category: 'trend',
        text: `📊 MoM: ${mom > 0 ? '+' : ''}${mom.toFixed(1)}% vs previous month — ${mom > 0 ? 'moderate increase' : 'moderate decrease'}.`,
      });
    }
  }

  // ─── YoY Trend ────────────────────────────────────────────────────────
  if (yoy != null && Math.abs(yoy) > 20) {
    insights.push({
      severity: yoy > 0 ? 'warning' : 'success',
      category: 'trend',
      text: `📈 YoY: ${yoy > 0 ? '+' : ''}${yoy.toFixed(1)}% vs same month last year. ${yoy > 30 ? 'Growth significantly outpacing historical patterns.' : ''}`,
    });
  }

  // ─── Product Anomalies ────────────────────────────────────────────────
  const products = tabs.awsInfraSummary || [];
  if (products.length > 0) {
    const totalActual = products.reduce((s, p) => s + p.actualCost, 0);

    // Top spender
    const top = products[0];
    const topPct = totalActual > 0 ? (top.actualCost / totalActual) * 100 : 0;
    insights.push({
      severity: 'info',
      category: 'product',
      text: `🏆 Top AWS service: ${top.productName} at ${fmtK(top.actualCost)} (${topPct.toFixed(1)}% of total).`,
    });

    // Anomaly detection: products with >50% MoM change
    for (const p of products) {
      if (p.previousMonth && p.previousMonth > 100) {
        const pMom = ((p.actualCost - p.previousMonth) / p.previousMonth) * 100;
        if (pMom > 50) {
          insights.push({
            severity: 'warning',
            category: 'anomaly',
            text: `🔺 ANOMALY: ${p.productName} costs jumped +${pMom.toFixed(0)}% MoM (${fmtK(p.previousMonth)} → ${fmtK(p.actualCost)}). Investigate.`,
          });
        } else if (pMom < -40) {
          insights.push({
            severity: 'success',
            category: 'anomaly',
            text: `🔻 ${p.productName} costs dropped ${Math.abs(pMom).toFixed(0)}% MoM — decommissioned workload or optimization?`,
          });
        }
      }
    }

    // Concentration risk
    if (topPct > 60) {
      insights.push({
        severity: 'info',
        category: 'risk',
        text: `⚡ Concentration risk: ${top.productName} represents ${topPct.toFixed(0)}% of AWS spend. Consider diversification.`,
      });
    }
  }

  // ─── Fleet Anomalies ──────────────────────────────────────────────────
  const fleets = tabs.allInfraByFleet || [];
  if (fleets.length > 0) {
    const overBudget = fleets.filter(
      (f) => f.scenarioCost > 0 && f.actualCost > f.scenarioCost * 1.1
    );
    if (overBudget.length > 0) {
      insights.push({
        severity: 'warning',
        category: 'fleet',
        text: `🚨 ${overBudget.length} fleet(s) >10% over budget: ${overBudget
          .slice(0, 3)
          .map(
            (f) => `${f.fleetName} (+${((f.actualCost / f.scenarioCost - 1) * 100).toFixed(0)}%)`
          )
          .join(', ')}${overBudget.length > 3 ? ` + ${overBudget.length - 3} more` : ''}.`,
      });
    }

    const underUtilized = fleets.filter(
      (f) => f.scenarioCost > 10000 && f.actualCost < f.scenarioCost * 0.3
    );
    if (underUtilized.length > 0) {
      insights.push({
        severity: 'info',
        category: 'fleet',
        text: `💤 ${underUtilized.length} fleet(s) significantly under-utilized (<30% of budget): ${underUtilized
          .slice(0, 3)
          .map((f) => f.fleetName)
          .join(', ')}.`,
      });
    }
  }

  // ─── Actionable Recommendations ───────────────────────────────────────
  if (products.length > 0) {
    const ec2 = products.find((p) => p.productName?.includes('EC2'));
    const s3 = products.find((p) => p.productName?.includes('S3'));
    const rds = products.find((p) => p.productName?.includes('RDS'));

    if (ec2 && ec2.actualCost > totalCostOf(products) * 0.4) {
      insights.push({
        severity: 'info',
        category: 'recommendation',
        text: `💡 EC2 is >40% of spend. Review: (1) Reserved Instance coverage (2) Right-sizing opportunities (3) Spot instance eligibility.`,
      });
    }
    if (s3 && s3.actualCost > 5000) {
      insights.push({
        severity: 'info',
        category: 'recommendation',
        text: `💡 S3 spend at ${fmtK(s3.actualCost)}. Consider: lifecycle policies, Intelligent-Tiering, or Glacier for cold data.`,
      });
    }
    if (rds && rds.actualCost > 10000) {
      insights.push({
        severity: 'info',
        category: 'recommendation',
        text: `💡 RDS at ${fmtK(rds.actualCost)}. Evaluate: Reserved DB instances, Aurora Serverless for variable workloads, or read replica consolidation.`,
      });
    }
  }

  return insights;
}

function totalCostOf(products) {
  return products.reduce((s, p) => s + (p.actualCost || 0), 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM EXECUTIVE NARRATIVE
// ═══════════════════════════════════════════════════════════════════════════════

async function generateLLMNarrative(allData, fleetId) {
  if (!ai) return null;

  const s = allData.summary;
  const products = (allData.tabs.awsInfraSummary || []).slice(0, 8);
  const fleets = (allData.tabs.allInfraByFleet || []).slice(0, 5);

  const prompt = `You are a senior FinOps analyst writing a concise executive briefing for a CloudTune fleet cost review.

Fleet ID: ${fleetId}
Billing Period: ${s.lastProcessedDate || 'current month'}
Month-to-Date Actuals: $${(s.totalMonthToDateActuals || 0).toLocaleString()}
Scenario Budget: $${(s.totalScenarioCost || 0).toLocaleString()}
Estimated Full-Month (by actuals): $${(s.totalMonthToDateEstimateByActuals || 0).toLocaleString()}
Estimated Full-Month (by scenario): $${(s.totalMonthToDateEstimateByScenario || 0).toLocaleString()}
Variance to Scenario: ${s.monthToDateVarianceToScenario?.toFixed(2) || 'N/A'}%
MoM Change: ${s.varianceToPreviousMonth?.toFixed(2) || 'N/A'}%
YoY Change: ${s.varianceToPreviousYear?.toFixed(2) || 'N/A'}%

Top AWS Products:
${products.map((p) => `- ${p.productName}: $${p.actualCost.toLocaleString()} (budget: $${p.scenarioCost.toLocaleString()})${p.previousMonth ? `, prev month: $${p.previousMonth.toLocaleString()}` : ''}`).join('\n')}

${fleets.length > 0 ? `Top Fleets:\n${fleets.map((f) => `- ${f.fleetName} (${f.resourceId}): $${f.actualCost.toLocaleString()} (budget: $${f.scenarioCost.toLocaleString()})`).join('\n')}` : ''}

Write a 2-3 paragraph executive narrative that:
1. Summarizes the financial position (are we on track, over/under budget?)
2. Highlights the top cost drivers and any anomalies
3. Provides 2-3 specific, actionable recommendations

Be concise, data-driven, and direct. Use specific dollar amounts and percentages. Do NOT use markdown headers.`;

  try {
    const response = await ai.generateCompletion(prompt, { maxTokens: 500, temperature: 0.3 });
    return response;
  } catch (e) {
    logger.warn(`LLM narrative generation failed: ${e.message}`);
    return null;
  }
}

function fmtK(val) {
  if (val == null) return '—';
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

module.exports = { streamIMRData };
