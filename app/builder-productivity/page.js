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
  GraduationCap,
  CheckCircle2,
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
      <Icon size={13} />
      {Math.abs(trend).toFixed(1)}%
    </span>
  );
}

function MetricCard({ metric, isNew }) {
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
        background: 'var(--card-bg)',
        border: '1px solid var(--border-primary)',
        borderRadius: '12px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
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
      {sorted.length > 1 && <MetricChart data={sorted} format={metric.format} />}
      {latest?.timePeriod && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          {latest.timePeriod}
        </div>
      )}
    </div>
  );
}

function MetricChart({ data, format }) {
  const validData = data.filter((d) => d.value != null);
  if (validData.length < 2) return null;

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

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
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

  const gradientId = `grad-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg width={w} height={h} style={{ display: 'block', marginTop: '4px' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-primary, #8b5cf6)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--accent-primary, #8b5cf6)" stopOpacity="0.02" />
        </linearGradient>
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

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--accent-primary, #8b5cf6)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Data dots with tooltips */}
      {pts.map((p, i) => (
        <g key={i}>
          <circle
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill="var(--card-bg)"
            stroke="var(--accent-primary, #8b5cf6)"
            strokeWidth="1.5"
          />
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

function ProgressIndicator({ loaded, total }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.78rem',
        color: 'var(--text-tertiary)',
      }}
    >
      <div
        style={{
          flex: 1,
          height: '3px',
          borderRadius: '2px',
          background: 'var(--border-primary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            borderRadius: '2px',
            background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
            width: `${(loaded / total) * 100}%`,
            transition: 'width 0.5s ease-out',
          }}
        />
      </div>
      <span>
        {loaded}/{total} categories
      </span>
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
  const abortRef = useRef(null);

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
              setAlias(data.alias || targetAlias);
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
  }, []);

  useEffect(() => {
    fetchData('', periodType, rangeMonths);
    return () => {
      if (abortRef.current) abortRef.current.abort();
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

      {/* Progress bar while streaming */}
      {loading && loadedCategories > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <ProgressIndicator loaded={loadedCategories} total={totalCategories} />
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
                    <MetricCard key={m.name} metric={m} isNew={isNew} />
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
    </div>
  );
}
