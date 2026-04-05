'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Activity,
  Shield,
  Users,
  UsersRound,
  GraduationCap,
  CheckCircle2,
  Wallet,
  ArrowRight,
  Send,
  Check,
  Loader2,
  Hash,
} from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Monthly' },
  { value: 'report_week', label: 'Weekly' },
  { value: 'quarter', label: 'Quarterly' },
];

const RANGE_OPTIONS = [
  { value: '3', label: 'Last 3 Months' },
  { value: '6', label: 'Last 6 Months' },
  { value: '12', label: 'Last 12 Months' },
];

const CATEGORY_ORDER = ['velocity', 'quality', 'scale', 'onboarding'];

const CATEGORY_META = {
  velocity: { label: 'Delivery Velocity', icon: TrendingUp, color: '#3b82f6', emoji: '🚀' },
  quality: { label: 'Quality & Reliability', icon: Shield, color: '#10b981', emoji: '🛡️' },
  scale: { label: 'Scale & Capacity', icon: Users, color: '#8b5cf6', emoji: '📊' },
  onboarding: { label: 'Builder Onboarding', icon: GraduationCap, color: '#f59e0b', emoji: '🎓' },
};

function formatValue(val, format) {
  if (val == null || isNaN(val)) return '—';
  switch (format) {
    case 'percent':
      return `${(val * 100).toFixed(1)}%`;
    case 'hours':
      return `${Number(val).toFixed(1)}h`;
    case 'integer':
      return Math.round(val).toLocaleString();
    case 'decimal':
      return Number(val).toFixed(2);
    default:
      return String(val);
  }
}

function getTrend(dataPoints) {
  if (!dataPoints || dataPoints.length < 2) return null;
  const sorted = [...dataPoints].sort((a, b) =>
    (a.timePeriod || a.date || '').localeCompare(b.timePeriod || b.date || '')
  );
  const prev = sorted[sorted.length - 2]?.value;
  const curr = sorted[sorted.length - 1]?.value;
  if (prev == null || curr == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function TrendBadge({ trend }) {
  if (trend == null)
    return <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>—</span>;
  const isUp = trend > 0;
  const isFlat = Math.abs(trend) < 1;
  const color = isFlat ? 'var(--text-tertiary)' : isUp ? '#30d158' : '#ff453a';
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        color,
        fontSize: '0.8rem',
        fontWeight: 600,
      }}
    >
      <Icon size={13} style={{ order: isUp ? 2 : 0 }} />
      <span style={{ order: 1 }}>{Math.abs(trend).toFixed(1)}%</span>
    </span>
  );
}

function MetricCard({ metric, isNew, color = '#3b82f6' }) {
  const dataPoints = metric.dataPoints || [];
  const sorted = [...dataPoints].sort((a, b) =>
    (a.timePeriod || a.date || '').localeCompare(b.timePeriod || b.date || '')
  );
  const latest = sorted[sorted.length - 1];
  const latestValue = latest?.value;
  const trend = getTrend(dataPoints);

  return (
    <div
      style={{
        background: 'rgba(20, 20, 30, 0.45)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        backdropFilter: 'blur(16px)',
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
        animation: isNew ? 'bp-fadeIn 0.4s ease-out' : 'none',
      }}
    >
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
        {metric.label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {formatValue(latestValue, metric.format)}
        </span>
        <TrendBadge trend={trend} />
      </div>
      {sorted.length > 1 && <MetricChart data={sorted} format={metric.format} color={color} />}
      {latest?.timePeriod && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          {latest.timePeriod}
        </div>
      )}
    </div>
  );
}

function MetricChart({ data, format, color = '#3b82f6' }) {
  const validData = data.filter((d) => d.value != null);
  if (validData.length < 2) return null;

  const [uid] = useState(() => Math.random().toString(36).slice(2));

  const values = validData.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padTop = 18,
    padBot = 22,
    padLeft = 42,
    padRight = 8;
  const w = 280,
    h = 100;
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBot;

  const pts = validData.map((d, i) => {
    const x = padLeft + (i / (validData.length - 1)) * chartW;
    const y = padTop + chartH - ((d.value - min) / range) * chartH;
    return { x, y, label: d.timePeriod || '', value: d.value };
  });

  // Generate smooth cubic bezier curve
  const generatePath = (points) => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cp1x = points[i].x + (points[i + 1].x - points[i].x) / 2;
      const cp1y = points[i].y;
      const cp2x = points[i].x + (points[i + 1].x - points[i].x) / 2;
      const cp2y = points[i + 1].y;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return d;
  };

  const linePath = generatePath(pts);
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${padTop + chartH} L${pts[0].x},${padTop + chartH} Z`;

  // Y-axis labels
  const yLabels = [
    { value: max, y: padTop },
    { value: min, y: padTop + chartH },
  ];
  if (range > 0) {
    const mid = min + range / 2;
    yLabels.push({ value: mid, y: padTop + chartH / 2 });
  }

  // X-axis: show first, middle, last
  const xLabels = [];
  if (validData.length >= 3) {
    const midIdx = Math.floor(validData.length / 2);
    xLabels.push({ label: validData[0].timePeriod, x: pts[0].x });
    xLabels.push({ label: validData[midIdx].timePeriod, x: pts[midIdx].x });
    xLabels.push({ label: validData[validData.length - 1].timePeriod, x: pts[pts.length - 1].x });
  } else {
    validData.forEach((d, i) => xLabels.push({ label: d.timePeriod, x: pts[i].x }));
  }

  const gradientId = `grad-${uid}`;
  const glowId = `glow-${uid}`;

  return (
    <svg width={w} height={h} style={{ display: 'block', marginTop: '4px', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Grid lines */}
      {yLabels.map((yl, i) => (
        <line
          key={i}
          x1={padLeft}
          y1={yl.y}
          x2={w - padRight}
          y2={yl.y}
          stroke="var(--border-primary)"
          strokeWidth="0.5"
          strokeDasharray="3,3"
        />
      ))}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Smooth glowing bezier line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={`url(#${glowId})`}
      />

      {/* Data dots with tooltips */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="var(--card-bg)" stroke={color} strokeWidth="2" />
          <title>{`${p.label}: ${formatValue(p.value, format)}`}</title>
          {/* Invisible hit area for tooltip */}
          <circle cx={p.x} cy={p.y} r="10" fill="transparent">
            <title>{`${p.label}: ${formatValue(p.value, format)}`}</title>
          </circle>
        </g>
      ))}

      {/* Y-axis labels */}
      {yLabels.map((yl, i) => (
        <text
          key={i}
          x={padLeft - 4}
          y={yl.y + 3}
          textAnchor="end"
          fontSize="9"
          fill="var(--text-tertiary)"
          fontFamily="inherit"
        >
          {formatValue(yl.value, format)}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((xl, i) => (
        <text
          key={i}
          x={xl.x}
          y={h - 4}
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-tertiary)"
          fontFamily="inherit"
        >
          {xl.label}
        </text>
      ))}
    </svg>
  );
}

function TelemetryLog({ logs, loadedCount, totalCount }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      style={{
        background: 'rgba(5, 5, 10, 0.65)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '24px',
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        animation: 'bp-fadeIn 0.5s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: '#a1a1aa',
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          <Activity size={14} style={{ color: '#0ea5e9' }} /> SMARTAI TELEMETRY STREAM
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            color: '#30d158',
            fontWeight: 600,
          }}
        >
          {loadedCount} / {totalCount} DATASETS HYDRATED
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          height: '140px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          scrollBehavior: 'smooth',
        }}
      >
        {logs.map((log, i) => {
          let color = '#a1a1aa';
          if (log.msg.includes('[SUCCESS]')) color = '#30d158';
          if (log.msg.includes('[PROCESS]')) color = '#a855f7';
          if (log.msg.includes('[WARN]')) color = '#f59e0b';
          if (log.msg.includes('[ERROR]')) color = '#ef4444';
          return (
            <div
              key={i}
              style={{
                fontSize: '0.85rem',
                fontFamily: 'SFMono-Regular, Consolas, monospace',
                lineHeight: 1.4,
              }}
            >
              <span style={{ color: '#52525b', marginRight: '8px' }}>{log.time}</span>
              <span style={{ color }}>{log.msg.replace(/\[.*?\] /, '')}</span>
            </div>
          );
        })}
        {loadedCount < totalCount && (
          <div
            style={{
              fontSize: '0.85rem',
              fontFamily: 'SFMono-Regular, Consolas, monospace',
              color: '#52525b',
              marginTop: '4px',
              animation: 'bp-pulse 1.5s infinite',
            }}
          >
            <span style={{ opacity: 0.5 }}>_</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Key metrics for the heat map table ────────────────────────────────────────
const HEATMAP_METRICS = [
  { key: 'builder_count', label: 'Builder Count', format: 'integer', higher: 'neutral' },
  { key: 'pipeline_count', label: 'Pipelines', format: 'integer', higher: 'neutral' },
  {
    key: 'pipeline_normalized_deployments_per_builder_week',
    label: 'Deploys / Builder / Wk',
    format: 'decimal',
    higher: 'better',
  },
  { key: 'code_review_open_to_merge_p50', label: 'CR Merge P50', format: 'hours', higher: 'worse' },
  { key: 'pipeline_freshness', label: 'Freshness', format: 'percent', higher: 'better' },
  { key: 'pipeline_rollback_rate', label: 'Rollback Rate', format: 'percent', higher: 'worse' },
  {
    key: 'pipeline_deploys_per_week',
    label: 'Deploys / Week',
    format: 'decimal',
    higher: 'better',
  },
];

function heatColor(value, allValues, higherIs) {
  if (value == null || allValues.length < 2 || higherIs === 'neutral') return 'transparent';
  const sorted = [...allValues].filter((v) => v != null).sort((a, b) => a - b);
  if (sorted.length < 2) return 'transparent';
  const min = sorted[0],
    max = sorted[sorted.length - 1];
  const range = max - min;
  if (range === 0) return 'transparent';
  // Normalize 0 → 1  (0 = worst, 1 = best)
  let norm = (value - min) / range;
  if (higherIs === 'worse') norm = 1 - norm;

  // Color: red for low (opportunity), fading to transparent for high
  if (norm >= 0.6) return 'transparent';
  // Intensity: deeper red for lower values
  const intensity = Math.round((1 - norm / 0.6) * 0.35 * 255);
  return `rgba(220, 38, 38, ${intensity / 255})`;
}

function InlineSparkline({ dataPoints }) {
  if (!dataPoints || dataPoints.length < 2) return null;
  const values = dataPoints.map((d) => d.value).filter((v) => v != null);
  if (values.length < 2) return null;
  const min = Math.min(...values),
    max = Math.max(...values);
  const range = max - min || 1;
  const w = 60,
    h = 18;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} style={{ verticalAlign: 'middle', marginLeft: '4px' }}>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent-primary, #8b5cf6)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ManagerHeatMapTable({ managers, metricsData, loadedCount, loading }) {
  // Collect all values per metric for heat coloring
  const allVals = {};
  for (const hm of HEATMAP_METRICS) allVals[hm.key] = [];
  for (const [, data] of Object.entries(metricsData)) {
    for (const hm of HEATMAP_METRICS) {
      const m = data.metrics?.[hm.key];
      const pts = m?.dataPoints || [];
      const last = pts[pts.length - 1];
      if (last?.value != null) allVals[hm.key].push(last.value);
    }
  }

  const thStyle = {
    padding: '8px 10px',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    borderBottom: '2px solid var(--border-primary)',
    position: 'sticky',
    top: 0,
    background: 'var(--card-bg)',
  };
  const tdStyle = {
    padding: '6px 10px',
    fontSize: '0.8rem',
    borderBottom: '1px solid var(--border-primary)',
    whiteSpace: 'nowrap',
  };

  return (
    <div
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: '12px',
        overflow: 'auto',
        maxHeight: '500px',
      }}
    >
      {loading && loadedCount > 0 && (
        <div
          style={{
            padding: '6px 16px',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          Loading metrics: {loadedCount} / {managers.length} managers...
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Leader</th>
            {HEATMAP_METRICS.map((hm) => (
              <th key={hm.key} style={{ ...thStyle, textAlign: 'center' }}>
                {hm.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {managers.map((mgr) => {
            const data = metricsData[mgr.alias];
            const isLoaded = !!data;
            return (
              <tr
                key={mgr.alias}
                style={{
                  animation: isLoaded ? 'bp-fadeIn 0.3s ease-out' : 'none',
                  opacity: isLoaded ? 1 : 0.4,
                }}
              >
                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {mgr.name || mgr.alias}
                  <div
                    style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-tertiary)' }}
                  >
                    {mgr.alias}
                  </div>
                </td>
                {HEATMAP_METRICS.map((hm) => {
                  if (!isLoaded) {
                    return (
                      <td
                        key={hm.key}
                        style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-tertiary)' }}
                      >
                        {loading ? '...' : '—'}
                      </td>
                    );
                  }
                  const m = data.metrics?.[hm.key];
                  const pts = m?.dataPoints || [];
                  const last = pts[pts.length - 1];
                  const val = last?.value;
                  const bg = heatColor(val, allVals[hm.key], hm.higher);
                  return (
                    <td key={hm.key} style={{ ...tdStyle, textAlign: 'center', background: bg }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatValue(val, hm.format)}
                      </span>
                      <InlineSparkline dataPoints={pts} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function BuilderProductivityPage() {
  const [alias, setAlias] = useState('');
  const [viewAsInput, setViewAsInput] = useState('');
  const [periodType, setPeriodType] = useState('month');
  const [rangeMonths, setRangeMonths] = useState('3');
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedCategories, setLoadedCategories] = useState(0);
  const [newCategories, setNewCategories] = useState(new Set());
  const [statusLogs, setStatusLogs] = useState([]);
  const [aiInsights, setAiInsights] = useState({});
  const abortRef = useRef(null);

  // Direct reports heat map state
  const [reportManagers, setReportManagers] = useState([]);
  const [reportMetrics, setReportMetrics] = useState({});
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoadedCount, setReportsLoadedCount] = useState(0);
  const reportsAbortRef = useRef(null);

  // Slack integration state
  const [slackChannel, setSlackChannel] = useState('');
  const [slackStatus, setSlackStatus] = useState(null);
  const [slackError, setSlackError] = useState('');

  const totalCategories = CATEGORY_ORDER.length;

  const fetchData = useCallback(async (targetAlias, period, months) => {
    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setMetrics(null);
    setLoadedCategories(0);
    setNewCategories(new Set());
    setStatusLogs([]);
    setAiInsights({});

    let resolvedAlias = targetAlias;

    try {
      const endD = new Date();
      endD.setDate(endD.getDate() - 1);
      const end = endD.toISOString().slice(0, 10);
      const start = new Date();
      start.setMonth(start.getMonth() - parseInt(months));
      const startStr = start.toISOString().slice(0, 10);

      const params = new URLSearchParams({
        periodType: period,
        windowStart: startStr,
        windowEnd: end,
        stream: '1',
      });
      if (targetAlias) params.set('alias', targetAlias);

      const res = await fetch(`/api/builder-productivity?${params}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let catCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line

        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            const data = JSON.parse(line.slice(6));
            if (eventType === 'init') {
              resolvedAlias = data.alias || targetAlias;
              setAlias(resolvedAlias);
            } else if (eventType === 'category') {
              catCount++;
              setMetrics((prev) => ({
                ...(prev || {}),
                [data.category]: data.metrics,
              }));
              setLoadedCategories(catCount);
              setNewCategories((prev) => new Set(prev).add(data.category));
              // Clear "new" flag after animation
              setTimeout(() => {
                setNewCategories((prev) => {
                  const next = new Set(prev);
                  next.delete(data.category);
                  return next;
                });
              }, 500);
            } else if (eventType === 'status') {
              setStatusLogs((prev) => [
                ...prev,
                { time: new Date().toLocaleTimeString(), msg: data.msg },
              ]);
            } else if (eventType === 'insight') {
              setAiInsights((prev) => ({
                ...prev,
                [data.category]: data.insights,
              }));
            } else if (eventType === 'error') {
              setError(data.error);
            }
            eventType = null;
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }

    // After main data finishes, fetch reports (sequenced to avoid MCP overload)
    if (resolvedAlias) {
      fetchReports(resolvedAlias, period, months);
    }
  }, []);

  // Fetch direct-report managers and their metrics
  const fetchReports = useCallback(async (targetAlias, period, months) => {
    if (reportsAbortRef.current) reportsAbortRef.current.abort();
    const ctrl = new AbortController();
    reportsAbortRef.current = ctrl;

    setReportsLoading(true);
    setReportManagers([]);
    setReportMetrics({});
    setReportsLoadedCount(0);

    try {
      const endD = new Date();
      endD.setDate(endD.getDate() - 1);
      const startD = new Date();
      startD.setMonth(startD.getMonth() - parseInt(months));
      const params = new URLSearchParams({
        alias: targetAlias,
        periodType: period,
        windowStart: startD.toISOString().slice(0, 10),
        windowEnd: endD.toISOString().slice(0, 10),
      });

      const res = await fetch(`/api/builder-productivity/reports?${params}`, {
        signal: ctrl.signal,
      });
      if (!res.ok) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let count = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let eventType = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim();
          else if (line.startsWith('data: ') && eventType) {
            const data = JSON.parse(line.slice(6));
            if (eventType === 'reports') {
              setReportManagers(data.managers || []);
            } else if (eventType === 'manager') {
              count++;
              setReportMetrics((prev) => ({
                ...prev,
                [data.alias]: { name: data.name, metrics: data.metrics },
              }));
              setReportsLoadedCount(count);
            }
            eventType = null;
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Reports fetch error:', e);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData('', periodType, rangeMonths);
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (reportsAbortRef.current) reportsAbortRef.current.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewAs = (e) => {
    e.preventDefault();
    if (viewAsInput.trim()) {
      fetchData(viewAsInput.trim(), periodType, rangeMonths);
    }
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriodType(newPeriod);
    fetchData(alias, newPeriod, rangeMonths);
  };

  const handleRangeChange = (newRange) => {
    setRangeMonths(newRange);
    fetchData(alias, periodType, newRange);
  };

  // ─── Slack Integration ──────────────────────────────────────────────────
  const buildProductivitySummary = () => {
    const periodLabel = PERIOD_OPTIONS.find((o) => o.value === periodType)?.label || periodType;
    const rangeLabel =
      RANGE_OPTIONS.find((o) => o.value === rangeMonths)?.label || `${rangeMonths}mo`;
    const lines = [
      `*📊 Builder Productivity — ${alias || 'My Org'} | ${periodLabel} | ${rangeLabel}*\n`,
    ];

    // Per-category metrics
    if (metrics) {
      for (const catKey of CATEGORY_ORDER) {
        const catMeta = CATEGORY_META[catKey];
        const catMetrics = metrics[catKey];
        if (!catMetrics || catMetrics.length === 0) continue;
        const hasData = catMetrics.some((m) => m.dataPoints && m.dataPoints.length > 0);
        if (!hasData) continue;

        lines.push(`${catMeta.emoji} *${catMeta.label}:*`);
        for (const m of catMetrics) {
          const pts = m.dataPoints || [];
          const sorted = [...pts].sort((a, b) =>
            (a.timePeriod || '').localeCompare(b.timePeriod || '')
          );
          const latest = sorted[sorted.length - 1];
          if (latest?.value == null) continue;
          const trend = getTrend(pts);
          const trendStr =
            trend != null
              ? ` (${trend > 0 ? '📈' : '📉'} ${trend > 0 ? '+' : ''}${trend.toFixed(1)}%)`
              : '';
          lines.push(`• ${m.label}: ${formatValue(latest.value, m.format)}${trendStr}`);
        }
        lines.push('');
      }
    }

    // AI Insights
    const allInsights = Object.entries(aiInsights).filter(([, v]) => v && v.length > 0);
    if (allInsights.length > 0) {
      lines.push(`*⚡ InGen Insights:*`);
      for (const [catKey, insights] of allInsights) {
        const catMeta = CATEGORY_META[catKey];
        for (const insight of insights) {
          lines.push(`• ${catMeta?.emoji || '💡'} ${insight}`);
        }
      }
      lines.push('');
    }

    // Manager comparison table
    if (reportManagers.length > 0 && Object.keys(reportMetrics).length > 0) {
      // Collect best/worst per metric for highlighting
      const allVals = {};
      for (const hm of HEATMAP_METRICS) allVals[hm.key] = [];
      for (const [, data] of Object.entries(reportMetrics)) {
        for (const hm of HEATMAP_METRICS) {
          const m = data.metrics?.[hm.key];
          const pts = m?.dataPoints || [];
          const last = pts[pts.length - 1];
          if (last?.value != null) allVals[hm.key].push(last.value);
        }
      }
      const bestWorst = {};
      for (const hm of HEATMAP_METRICS) {
        const vals = allVals[hm.key].filter((v) => v != null);
        if (vals.length < 2) continue;
        const sorted = [...vals].sort((a, b) => a - b);
        if (hm.higher === 'better') {
          bestWorst[hm.key] = { best: sorted[sorted.length - 1], worst: sorted[0] };
        } else if (hm.higher === 'worse') {
          bestWorst[hm.key] = { best: sorted[0], worst: sorted[sorted.length - 1] };
        }
      }

      lines.push(`*👥 Manager Comparison (${reportManagers.length} Direct Reports):*`);
      for (const mgr of reportManagers) {
        const data = reportMetrics[mgr.alias];
        if (!data) continue;
        const name = data.name || mgr.name || mgr.alias;
        const parts = [];
        for (const hm of HEATMAP_METRICS) {
          const m = data.metrics?.[hm.key];
          const pts = m?.dataPoints || [];
          const last = pts[pts.length - 1];
          if (last?.value == null) continue;
          const val = last.value;
          let indicator = '';
          if (bestWorst[hm.key]) {
            if (val === bestWorst[hm.key].best) indicator = ' 🟢';
            else if (val === bestWorst[hm.key].worst) indicator = ' 🔴';
          }
          parts.push(`${hm.label}: ${formatValue(val, hm.format)}${indicator}`);
        }
        lines.push(`• *${name}* (${mgr.alias}): ${parts.join(' | ')}`);
      }
      lines.push('');
    }

    lines.push(`_Generated by InGen SmartAI — Builder Productivity Insights_`);
    return lines.join('\n');
  };

  const sendToSlack = async () => {
    if (!metrics || !slackChannel.trim()) return;
    setSlackStatus('sending');
    setSlackError('');
    try {
      const text = buildProductivitySummary();
      const res = await fetch('/api/slack/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: slackChannel.trim(), text }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Send failed');
      }
      setSlackStatus('sent');
      setTimeout(() => setSlackStatus(null), 3000);
    } catch (e) {
      setSlackStatus('error');
      setSlackError(e.message);
      setTimeout(() => setSlackStatus(null), 5000);
    }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1200px', margin: '0 auto' }}>
      <style>{`
                @keyframes bp-spin { to { transform: rotate(360deg); } }
                @keyframes bp-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
                @keyframes bp-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <BarChart3 size={22} /> Builder Productivity
          </h1>
          {alias && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Showing metrics for{' '}
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{alias}</span>&apos;s
              org
            </div>
          )}
        </div>
        <button
          onClick={() => fetchData(alias, periodType, rangeMonths)}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: 'var(--card-bg)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: '0.85rem',
          }}
        >
          <RefreshCw
            size={14}
            style={loading ? { animation: 'bp-spin 1.2s linear infinite' } : {}}
          />
          Refresh
        </button>
      </div>

      {/* View As + Controls */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'var(--card-bg)',
          border: '1px solid var(--border-primary)',
          borderRadius: '12px',
          padding: '12px 16px',
        }}
      >
        <form
          onSubmit={handleViewAs}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}
        >
          <label
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            View As:
          </label>
          <input
            type="text"
            value={viewAsInput}
            onChange={(e) => setViewAsInput(e.target.value)}
            placeholder={alias || 'Enter alias...'}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.85rem',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              minWidth: '120px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Search size={13} style={{ marginRight: '4px', verticalAlign: '-2px' }} />
            Go
          </button>
        </form>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '2px',
          }}
        >
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePeriodChange(opt.value)}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background:
                  periodType === opt.value ? 'var(--accent-primary, #8b5cf6)' : 'transparent',
                color: periodType === opt.value ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--bg-secondary)',
            borderRadius: '8px',
            padding: '2px',
          }}
        >
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleRangeChange(opt.value)}
              style={{
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background:
                  rangeMonths === opt.value ? 'var(--accent-primary, #8b5cf6)' : 'transparent',
                color: rangeMonths === opt.value ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Slack Share Bar ── */}
      {metrics && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.06))',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '12px',
            padding: '12px 18px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 4px 20px rgba(59,130,246,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59,130,246,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={15} color="#60a5fa" />
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Share to Slack
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                Send productivity report to a channel or DM
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              gap: '0',
              borderRadius: '8px',
              overflow: 'hidden',
              border: `1px solid ${slackChannel.startsWith('@') ? 'rgba(34,211,238,0.25)' : 'rgba(59,130,246,0.25)'}`,
              marginLeft: '8px',
            }}
          >
            <span
              style={{
                padding: '7px 10px',
                fontSize: '13px',
                background: slackChannel.startsWith('@')
                  ? 'rgba(34,211,238,0.08)'
                  : 'rgba(59,130,246,0.08)',
                color: slackChannel.startsWith('@')
                  ? 'rgba(34,211,238,0.5)'
                  : 'rgba(59,130,246,0.5)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {slackChannel.startsWith('@') ? '👤' : <Hash size={13} />}
            </span>
            <input
              type="text"
              value={slackChannel}
              onChange={(e) => setSlackChannel(e.target.value)}
              placeholder="channel or @user"
              style={{
                flex: 1,
                padding: '7px 10px',
                border: 'none',
                outline: 'none',
                background: 'rgba(255,255,255,0.04)',
                color: slackChannel.startsWith('@') ? '#22d3ee' : '#60a5fa',
                fontSize: '13px',
                fontWeight: 500,
              }}
            />
          </div>
          <button
            onClick={sendToSlack}
            disabled={slackStatus === 'sending' || !slackChannel.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: 'none',
              cursor: slackStatus === 'sending' || !slackChannel.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              background:
                slackStatus === 'sent'
                  ? 'rgba(48,209,88,0.2)'
                  : slackStatus === 'error'
                    ? 'rgba(255,69,58,0.2)'
                    : 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.2))',
              color:
                slackStatus === 'sent'
                  ? '#30d158'
                  : slackStatus === 'error'
                    ? '#ff453a'
                    : '#60a5fa',
            }}
          >
            {slackStatus === 'sending' ? (
              <Loader2 size={14} style={{ animation: 'bp-spin 0.8s linear infinite' }} />
            ) : slackStatus === 'sent' ? (
              <Check size={14} />
            ) : (
              <Send size={14} />
            )}
            {slackStatus === 'sending'
              ? 'Sending...'
              : slackStatus === 'sent'
                ? 'Sent!'
                : slackStatus === 'error'
                  ? 'Failed'
                  : 'Send Report'}
          </button>
          {slackStatus === 'error' && slackError && (
            <span style={{ fontSize: '11px', color: '#ff453a', flexShrink: 0 }} title={slackError}>
              ⚠️ {slackError.substring(0, 40)}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '20px',
            background: 'rgba(255,69,58,0.1)',
            border: '1px solid rgba(255,69,58,0.2)',
            color: '#ff453a',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Telemetry Stream — always visible when there are logs */}
      {(loading || statusLogs.length > 0) && (
        <div style={{ marginBottom: '16px' }}>
          <TelemetryLog
            logs={statusLogs}
            loadedCount={loadedCategories}
            totalCount={totalCategories}
          />
        </div>
      )}

      {/* Loading (no data yet) */}
      {loading && !metrics && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
          <RefreshCw
            size={24}
            style={{
              margin: '0 auto 12px',
              display: 'block',
              animation: 'bp-spin 1.2s linear infinite',
            }}
          />
          <div style={{ animation: 'bp-pulse 1.8s ease-in-out infinite' }}>
            Fetching metrics from Builder Insights...
          </div>
        </div>
      )}

      {/* Metric Categories — render progressively as they arrive */}
      {metrics &&
        CATEGORY_ORDER.map((catKey) => {
          const catMeta = CATEGORY_META[catKey];
          const catMetrics = metrics[catKey];
          if (!catMetrics) {
            // Not loaded yet — show skeleton if still loading
            if (loading) {
              return (
                <div
                  key={catKey}
                  style={{ marginBottom: '28px', animation: 'bp-pulse 1.8s ease-in-out infinite' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{catMeta.emoji}</span>
                    <h2
                      style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: 'var(--text-tertiary)',
                        margin: 0,
                      }}
                    >
                      {catMeta.label}
                    </h2>
                    <RefreshCw
                      size={13}
                      style={{
                        color: 'var(--text-tertiary)',
                        animation: 'bp-spin 1.2s linear infinite',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--card-bg)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '12px',
                          padding: '16px',
                          height: '100px',
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          }

          const hasData = catMetrics.some((m) => m.dataPoints && m.dataPoints.length > 0);
          const isNew = newCategories.has(catKey);

          return (
            <div
              key={catKey}
              style={{
                marginBottom: '28px',
                animation: isNew ? 'bp-fadeIn 0.4s ease-out' : 'none',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <span style={{ fontSize: '1.1rem' }}>{catMeta.emoji}</span>
                <h2
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {catMeta.label}
                </h2>
                <CheckCircle2 size={14} style={{ color: '#30d158', opacity: 0.6 }} />
              </div>
              {!hasData ? (
                <div
                  style={{
                    padding: '20px',
                    color: 'var(--text-tertiary)',
                    fontSize: '0.85rem',
                    fontStyle: 'italic',
                  }}
                >
                  No data available for this category in the selected range.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                    gap: '12px',
                  }}
                >
                  {catMetrics.map((m) => (
                    <MetricCard key={m.name} metric={m} isNew={isNew} color={catMeta.color} />
                  ))}
                </div>
              )}

              {/* SmartAI Insights Container */}
              {aiInsights[catKey] && aiInsights[catKey].length > 0 && (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    background: 'rgba(14, 165, 233, 0.08)',
                    borderLeft: '3px solid #0ea5e9',
                    borderRadius: '4px 8px 8px 4px',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    animation: 'bp-fadeIn 0.6s ease-out',
                  }}
                >
                  {aiInsights[catKey].map((insight, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                        marginBottom: idx !== aiInsights[catKey].length - 1 ? '8px' : '0',
                      }}
                    >
                      <Activity
                        size={14}
                        style={{ color: '#0ea5e9', flexShrink: 0, marginTop: '2px' }}
                      />
                      <span style={{ lineHeight: 1.5 }}>
                        <strong style={{ color: '#0ea5e9' }}>{insight.split(':')[0]}:</strong>{' '}
                        {insight.split(':').slice(1).join(':')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {/* Empty state */}
      {!loading && !metrics && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
          No metrics loaded. Enter an alias above to get started.
        </div>
      )}

      {/* ─── Direct Reports Heat Map ─── */}
      {(reportManagers.length > 0 || reportsLoading) && (
        <div style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <UsersRound size={18} style={{ color: 'var(--accent-primary, #8b5cf6)' }} />
            <h2
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Direct Reports — Metric Comparison
            </h2>
            {reportsLoading && (
              <RefreshCw
                size={14}
                style={{ color: 'var(--text-tertiary)', animation: 'bp-spin 1.2s linear infinite' }}
              />
            )}
            {!reportsLoading && reportManagers.length > 0 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                {reportManagers.length} manager{reportManagers.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {reportsLoading && reportManagers.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '30px 0',
                color: 'var(--text-tertiary)',
                animation: 'bp-pulse 1.8s ease-in-out infinite',
              }}
            >
              Loading direct reports...
            </div>
          )}
          {reportManagers.length > 0 && (
            <ManagerHeatMapTable
              managers={reportManagers}
              metricsData={reportMetrics}
              loadedCount={reportsLoadedCount}
              loading={reportsLoading}
            />
          )}
        </div>
      )}
    </div>
  );
}
