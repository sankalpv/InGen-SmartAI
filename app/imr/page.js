'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Search,
  TrendingUp,
  TrendingDown,
  Activity,
  Wallet,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  ExternalLink,
  Cloud,
  Database,
  Box,
  Cpu,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Info,
  Zap,
  ChevronRight,
  BarChart3,
  Send,
  Check,
  Loader2,
  Hash,
} from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(val) {
  if (val == null || isNaN(val)) return '—';
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function fmtPct(val) {
  if (val == null || isNaN(val)) return '—';
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function getHealthColor(variance) {
  if (variance == null) return { text: '#3b82f6' };
  const abs = Math.abs(variance);
  if (abs <= 5) return { text: '#10b981' };
  if (abs <= 15) return { text: '#f59e0b' };
  return { text: '#ef4444' };
}

function getProductIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('ec2') || n.includes('compute')) return Cpu;
  if (n.includes('s3') || n.includes('storage')) return Database;
  if (n.includes('rds') || n.includes('dynamo') || n.includes('aurora')) return Database;
  if (n.includes('lambda') || n.includes('function')) return Zap;
  if (n.includes('ecs') || n.includes('container') || n.includes('ecr')) return Box;
  if (n.includes('cloud')) return Cloud;
  return Layers;
}

function getMonthOptions() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    months.push({ value: val, label });
  }
  return months;
}

// ─── Tab Definitions ────────────────────────────────────────────────────────────

const TAB_DEFS = [
  { key: 'awsInfraByFleet', label: 'AWS Infra by Fleet', shortLabel: 'AWS Fleet', type: 'fleet' },
  {
    key: 'awsInfraSummary',
    label: 'AWS Infra Summary',
    shortLabel: 'AWS Summary',
    type: 'product',
  },
  {
    key: 'awsPlannedProducts',
    label: 'AWS Planned Products',
    shortLabel: 'Planned',
    type: 'product',
  },
  { key: 'awsOtherProducts', label: 'AWS Other Products', shortLabel: 'Other', type: 'product' },
  { key: 'awsDataTransfer', label: 'AWS Data Transfer', shortLabel: 'Data Xfer', type: 'product' },
  {
    key: 'allInfraByFleet',
    label: 'All Infra (AWS+SDO) by Fleet',
    shortLabel: 'All Fleet',
    type: 'fleet',
  },
  { key: 'sdoServicesSummary', label: 'SDO Services', shortLabel: 'SDO', type: 'product' },
  { key: 'imrGoalByFleet', label: 'IMR Goal by Fleet', shortLabel: 'IMR Goal', type: 'fleet' },
];

// ─── Animated Number ────────────────────────────────────────────────────────────

function AnimatedNumber({ value, format = 'currency', duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    if (value == null || isNaN(value)) return;
    const end = value;
    const startTime = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(end * eased);
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  if (value == null || isNaN(value)) return <span>—</span>;
  if (format === 'currency') return <span>{fmtCurrency(display)}</span>;
  if (format === 'percent') return <span>{fmtPct(display)}</span>;
  return <span>{display.toFixed(2)}</span>;
}

// ─── Cerberus-Style Summary Card ────────────────────────────────────────────────

function CerberusSummaryCard({
  title,
  value,
  format,
  subLines,
  color,
  delay = 0,
  projectedDirection,
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      style={{
        background: 'rgba(20, 20, 30, 0.55)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '20px 24px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        opacity: visible ? 1 : 0,
        transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          fontSize: '0.72rem',
          color: 'var(--text-tertiary)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '8px',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: '1.8rem',
          fontWeight: 800,
          color: 'var(--text-primary)',
          letterSpacing: '-1px',
          lineHeight: 1,
          marginBottom: '10px',
        }}
      >
        <AnimatedNumber value={value} format={format} />
      </div>
      {subLines &&
        subLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '3px',
            }}
          >
            {line.icon && <line.icon size={12} color={line.color || 'var(--text-tertiary)'} />}
            <span style={{ color: line.color || 'var(--text-tertiary)' }}>{line.text}</span>
          </div>
        ))}
      {projectedDirection && projectedDirection !== 'neutral' && (
        <div
          style={{
            marginTop: '8px',
            padding: '4px 10px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background:
              projectedDirection === 'underspend'
                ? 'rgba(16,185,129,0.12)'
                : 'rgba(239,68,68,0.12)',
            color: projectedDirection === 'underspend' ? '#10b981' : '#ef4444',
          }}
        >
          {projectedDirection === 'underspend' ? (
            <TrendingDown size={12} />
          ) : (
            <TrendingUp size={12} />
          )}
          Projected to {projectedDirection}
        </div>
      )}
    </div>
  );
}

// ─── Freshness Indicator ────────────────────────────────────────────────────────

function FreshnessIndicator({ date }) {
  if (!date) return null;
  const d = new Date(date);
  const diffDays = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24));
  const color = diffDays <= 1 ? '#10b981' : diffDays <= 3 ? '#f59e0b' : '#ef4444';
  const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.78rem',
        color: 'var(--text-tertiary)',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: diffDays <= 1 ? 'imr-pulse 2s ease-in-out infinite' : 'none',
        }}
      />
      Data as of{' '}
      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ({label})
    </div>
  );
}

// ─── Inline Bar ─────────────────────────────────────────────────────────────────

function InlineBar({ actual, scenario, maxVal }) {
  if (!actual || !maxVal) return null;
  const actualPct = Math.min((actual / maxVal) * 100, 100);
  const scenarioPct = scenario ? Math.min((scenario / maxVal) * 100, 100) : 0;
  const barColor = actual > scenario ? '#ef4444' : '#10b981';
  return (
    <div
      style={{
        position: 'relative',
        height: '5px',
        background: 'rgba(255,255,255,0.06)',
        borderRadius: '3px',
        width: '80px',
        marginTop: '3px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          height: '100%',
          borderRadius: '3px',
          width: `${actualPct}%`,
          background: barColor,
          transition: 'width 0.8s ease-out',
        }}
      />
      {scenarioPct > 0 && (
        <div
          style={{
            position: 'absolute',
            left: `${scenarioPct}%`,
            top: '-2px',
            bottom: '-2px',
            width: '2px',
            background: '#8b5cf6',
            borderRadius: '1px',
          }}
        />
      )}
    </div>
  );
}

// ─── Product Table ──────────────────────────────────────────────────────────────

function ProductTable({ products }) {
  if (!products || products.length === 0)
    return (
      <div
        style={{
          padding: '24px',
          color: 'var(--text-tertiary)',
          fontSize: '0.85rem',
          textAlign: 'center',
        }}
      >
        No data for this view.
      </div>
    );
  const maxCost = Math.max(...products.map((p) => p.actualCost));
  const thStyle = {
    padding: '12px 14px',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: 'left' }}>Service</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Actual</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Budget</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Variance</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>MoM</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>YoY</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p, i) => {
          const Icon = getProductIcon(p.productName);
          const variance =
            p.scenarioCost > 0 ? ((p.actualCost - p.scenarioCost) / p.scenarioCost) * 100 : 0;
          const mom = p.previousMonth
            ? ((p.actualCost - p.previousMonth) / p.previousMonth) * 100
            : null;
          const yoy = p.previousYear
            ? ((p.actualCost - p.previousYear) / p.previousYear) * 100
            : null;
          const td = {
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            fontSize: '0.83rem',
            fontVariantNumeric: 'tabular-nums',
          };
          return (
            <tr key={i} style={{ animation: `imr-slideIn 0.3s ease-out ${i * 40}ms both` }}>
              <td style={{ ...td, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: 'rgba(59,130,246,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={12} color="#3b82f6" />
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.productName}
                  </span>
                </div>
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  {fmtCurrency(p.actualCost)}
                </div>
                <InlineBar actual={p.actualCost} scenario={p.scenarioCost} maxVal={maxCost} />
              </td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                {fmtCurrency(p.scenarioCost)}
              </td>
              <td
                style={{
                  ...td,
                  textAlign: 'right',
                  fontWeight: 700,
                  color:
                    variance > 5 ? '#ef4444' : variance < -5 ? '#10b981' : 'var(--text-secondary)',
                }}
              >
                {fmtPct(variance)}
              </td>
              <td style={{ ...td, textAlign: 'right', color: mom > 0 ? '#f59e0b' : '#10b981' }}>
                {mom != null ? fmtPct(mom) : '—'}
              </td>
              <td style={{ ...td, textAlign: 'right', color: yoy > 0 ? '#ef4444' : '#10b981' }}>
                {yoy != null ? fmtPct(yoy) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Fleet Table ────────────────────────────────────────────────────────────────

function FleetTable({ fleets, onDrillDown }) {
  if (!fleets || fleets.length === 0)
    return (
      <div
        style={{
          padding: '24px',
          color: 'var(--text-tertiary)',
          fontSize: '0.85rem',
          textAlign: 'center',
        }}
      >
        No data for this view.
      </div>
    );
  const totalCost = fleets.reduce((s, f) => s + f.actualCost, 0);
  const thStyle = {
    padding: '12px 14px',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thStyle, textAlign: 'left' }}>Fleet</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Actual</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Budget</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>% Total</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Variance</th>
        </tr>
      </thead>
      <tbody>
        {fleets.map((f, i) => {
          const pct = totalCost > 0 ? (f.actualCost / totalCost) * 100 : 0;
          const variance =
            f.scenarioCost > 0 ? ((f.actualCost - f.scenarioCost) / f.scenarioCost) * 100 : 0;
          const td = {
            padding: '10px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            fontSize: '0.83rem',
            fontVariantNumeric: 'tabular-nums',
          };
          return (
            <tr
              key={i}
              style={{
                animation: `imr-slideIn 0.3s ease-out ${i * 50}ms both`,
                cursor: f.hasChildren ? 'pointer' : 'default',
              }}
              onClick={() => f.hasChildren && onDrillDown?.(f.resourceId)}
            >
              <td style={{ ...td, textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {f.fleetName}
                  </span>
                  {f.hasChildren && <ChevronRight size={14} color="var(--text-tertiary)" />}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
                  ID: {f.resourceId}
                </span>
              </td>
              <td
                style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}
              >
                {fmtCurrency(f.actualCost)}
              </td>
              <td style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)' }}>
                {fmtCurrency(f.scenarioCost)}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '50px',
                      height: '5px',
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: '#8b5cf6',
                        borderRadius: '3px',
                        transition: 'width 0.8s',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      minWidth: '36px',
                    }}
                  >
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </td>
              <td
                style={{
                  ...td,
                  textAlign: 'right',
                  fontWeight: 700,
                  color: variance > 10 ? '#ef4444' : variance > 0 ? '#f59e0b' : '#10b981',
                }}
              >
                {fmtPct(variance)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── AI Insights ────────────────────────────────────────────────────────────────

function InsightsPanel({ insights }) {
  if (!insights || insights.length === 0) return null;
  const cfg = {
    success: { icon: CheckCircle2, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
    info: { icon: Info, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
    warning: { icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
  };
  return (
    <div
      style={{
        background: 'rgba(20,20,30,0.45)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '18px',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <Zap size={15} color="#8b5cf6" />
        <span
          style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          InGen Cost Analysis
        </span>
      </div>
      {insights.map((ins, i) => {
        const c = cfg[ins.severity] || cfg.info;
        const Icon = c.icon;
        return (
          <div
            key={i}
            style={{
              padding: '10px 14px',
              background: c.bg,
              borderRadius: '8px',
              borderLeft: `3px solid ${c.color}`,
              display: 'flex',
              gap: '8px',
              alignItems: 'flex-start',
              marginBottom: '8px',
              animation: `imr-fadeIn 0.4s ease-out ${i * 120}ms both`,
            }}
          >
            <Icon size={14} color={c.color} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {ins.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Telemetry Stream ───────────────────────────────────────────────────────────

function TelemetryStream({ logs, loading }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs]);
  if (logs.length === 0 && !loading) return null;
  return (
    <div
      style={{
        background: 'rgba(5,5,10,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '14px 16px',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#71717a',
            letterSpacing: '0.5px',
          }}
        >
          <Activity size={13} color="#10b981" /> CERBERUS TELEMETRY STREAM
        </div>
        {loading && (
          <div
            style={{
              fontSize: '0.72rem',
              color: '#10b981',
              fontWeight: 600,
              animation: 'imr-pulse 1.5s infinite',
            }}
          >
            LIVE
          </div>
        )}
      </div>
      <div
        ref={scrollRef}
        style={{ maxHeight: '100px', overflowY: 'auto', scrollBehavior: 'smooth' }}
      >
        {logs.map((log, i) => {
          let color = '#52525b';
          if (log.includes('[SUCCESS]')) color = '#10b981';
          if (log.includes('[PROCESS]')) color = '#a855f7';
          if (log.includes('[WARN]')) color = '#f59e0b';
          if (log.includes('[ERROR]')) color = '#ef4444';
          if (log.includes('[INFO]')) color = '#3b82f6';
          return (
            <div
              key={i}
              style={{
                fontSize: '0.75rem',
                fontFamily: 'SFMono-Regular, Consolas, monospace',
                color,
                lineHeight: 1.5,
              }}
            >
              {log.replace(/\[.*?\]\s?/, '')}
            </div>
          );
        })}
        {loading && (
          <div
            style={{
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: '#52525b',
              animation: 'imr-pulse 1.5s infinite',
            }}
          >
            _
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════════

export default function IMRMissionControl() {
  const [fleetIdInput, setFleetIdInput] = useState('');
  const [activeFleetId, setActiveFleetId] = useState('');
  const [month, setMonth] = useState('');
  const [summary, setSummary] = useState(null);
  const [summaryCards, setSummaryCards] = useState(null);
  const [tabs, setTabs] = useState({});
  const [tabMeta, setTabMeta] = useState([]);
  const [activeTab, setActiveTab] = useState('awsInfraByFleet');
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [slackChannel, setSlackChannel] = useState('cpp-stores-automation-sdm');
  const [slackStatus, setSlackStatus] = useState(null);
  const [slackError, setSlackError] = useState('');
  const [narrative, setNarrative] = useState('');
  const [pacing, setPacing] = useState(null);
  const abortRef = useRef(null);
  const monthOptions = getMonthOptions();

  const fetchData = useCallback(async (fid, m, forceRefresh = false) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setSummary(null);
    setSummaryCards(null);
    setTabs({});
    setTabMeta([]);
    setInsights([]);
    setLogs([]);

    try {
      const params = new URLSearchParams();
      if (fid) params.set('fleetId', fid);
      if (m) params.set('month', m);
      if (forceRefresh) params.set('refresh', '1');

      const res = await fetch(`/api/imr?${params}`, { signal: controller.signal });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let et = null;
        for (const l of lines) {
          if (l.startsWith('event: ')) et = l.slice(7).trim();
          else if (l.startsWith('data: ') && et) {
            const data = JSON.parse(l.slice(6));
            if (et === 'summary') {
              setSummary(data);
              setActiveFleetId(data.fleetId || fid);
            } else if (et === 'summaryCards') setSummaryCards(data);
            else if (et === 'tab') {
              setTabs((prev) => ({ ...prev, [data.key]: data.data }));
              setTabMeta((prev) => {
                if (prev.find((t) => t.key === data.key)) return prev;
                return [...prev, { key: data.key, label: data.label, type: data.type }];
              });
            } else if (et === 'insights') setInsights(data.insights || []);
            else if (et === 'narrative') setNarrative(data.text || '');
            else if (et === 'pacing') setPacing(data);
            else if (et === 'status') setLogs((prev) => [...prev, data.msg]);
            else if (et === 'error') setError(data.error);
            et = null;
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData('', '');
  }, [fetchData]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchData(fleetIdInput.trim(), month);
  };
  const handleDrillDown = (childFleetId) => {
    setFleetIdInput(childFleetId);
    fetchData(childFleetId, month);
  };

  // ─── Slack Integration ──────────────────────────────────────────────────
  const buildIMRSummary = () => {
    const monthLabel = summary?.lastProcessedDate
      ? new Date(summary.lastProcessedDate).toLocaleString('en-US', {
          month: 'long',
          year: 'numeric',
        })
      : month
        ? new Date(month).toLocaleString('en-US', { month: 'long', year: 'numeric' })
        : 'Current Month';
    const lines = [`*📊 IMR Mission Control — Fleet ${activeFleetId} | ${monthLabel}*`];
    if (summary?.lastProcessedDate) lines.push(`_Data as of ${summary.lastProcessedDate}_\n`);
    if (summaryCards) {
      lines.push(`*Summary:*`);
      lines.push(
        `• Actuals MTD: ${fmtCurrency(summaryCards.actualsForMonth?.value)} (MoM: ${fmtPct(summaryCards.actualsForMonth?.momPct)}, YoY: ${fmtPct(summaryCards.actualsForMonth?.yoyPct)})`
      );
      lines.push(
        `• Budget (CPT++): ${fmtCurrency(summaryCards.totalScenarioCost?.value)} | Variance: ${fmtPct(summaryCards.totalScenarioCost?.variancePct)}`
      );
      lines.push(
        `• Est. spend (actuals): ${fmtCurrency(summaryCards.estimatedSpendActuals?.value)} → ${summaryCards.estimatedSpendActuals?.projectedDirection || 'neutral'}`
      );
    }
    if (pacing) {
      lines.push(
        `\n*Budget Pacing:* ${pacing.pacingLabel} — ${pacing.projectedPct?.toFixed(1)}% of budget | ${pacing.daysRemaining}d remaining`
      );
    }
    const products = tabs.awsInfraSummary || [];
    if (products.length > 0) {
      lines.push(`\n*Top AWS Services:*`);
      products.slice(0, 5).forEach((p) => {
        const v = p.scenarioCost > 0 ? ((p.actualCost - p.scenarioCost) / p.scenarioCost) * 100 : 0;
        lines.push(
          `• ${p.productName}: ${fmtCurrency(p.actualCost)} (${v > 0 ? '🔴' : '🟢'} ${fmtPct(v)} vs budget)`
        );
      });
    }
    // Fleet breakdown comparison
    const fleets = tabs.awsInfraByFleet || tabs.allInfraByFleet || [];
    if (fleets.length > 0) {
      const totalFleetCost = fleets.reduce((s, f) => s + (f.actualCost || 0), 0);
      lines.push(`\n*🏗️ Fleet Breakdown (${fleets.length} sub-fleets):*`);
      const sorted = [...fleets].sort((a, b) => (b.actualCost || 0) - (a.actualCost || 0));
      sorted.slice(0, 10).forEach((f) => {
        const pct = totalFleetCost > 0 ? ((f.actualCost / totalFleetCost) * 100).toFixed(1) : '0.0';
        const variance =
          f.scenarioCost > 0 ? ((f.actualCost - f.scenarioCost) / f.scenarioCost) * 100 : 0;
        const icon = variance > 5 ? '🔴' : variance > 0 ? '🟡' : '🟢';
        lines.push(
          `• ${f.fleetName || f.resourceId}: ${fmtCurrency(f.actualCost)} (${pct}% of total) — Budget: ${fmtCurrency(f.scenarioCost)} | ${icon} ${fmtPct(variance)}`
        );
      });
      if (sorted.length > 10) {
        lines.push(`  _...and ${sorted.length - 10} more fleets_`);
      }
    }
    if (insights.length > 0) {
      lines.push(`\n*⚡ InGen Cost Analysis:*`);
      const warnings = insights.filter((i) => i.severity === 'warning');
      const successes = insights.filter((i) => i.severity === 'success');
      const infos = insights.filter((i) => i.severity === 'info');
      if (warnings.length > 0) {
        lines.push(`\n⚠️ *Alerts & Warnings:*`);
        warnings.forEach((ins) => lines.push(`• ${ins.text}`));
      }
      if (successes.length > 0) {
        lines.push(`\n✅ *Positive Signals:*`);
        successes.forEach((ins) => lines.push(`• ${ins.text}`));
      }
      if (infos.length > 0) {
        lines.push(`\nℹ️ *Observations & Recommendations:*`);
        infos.forEach((ins) => lines.push(`• ${ins.text}`));
      }
    }
    if (narrative) {
      lines.push(`\n*Executive Narrative:*\n${narrative}`);
    }
    lines.push(
      `\n_Generated by InGen SmartAI — <https://cerberus.cloudtune.amazon.dev/usage?fleetId=${activeFleetId}|Open in Cerberus>_`
    );
    return lines.join('\n');
  };

  const sendToSlack = async () => {
    if (!summaryCards || !slackChannel.trim()) return;
    setSlackStatus('sending');
    setSlackError('');
    try {
      const text = buildIMRSummary();
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

  // Active tab data
  const activeTabData = tabs[activeTab] || [];
  const activeTabDef = TAB_DEFS.find((t) => t.key === activeTab) || TAB_DEFS[0];

  return (
    <div style={{ minHeight: '100vh', padding: '24px 32px', maxWidth: '1300px', margin: '0 auto' }}>
      <style>{`
        @keyframes imr-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes imr-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes imr-slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
            }}
          >
            <Wallet size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              IMR Mission Control
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-tertiary)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Cerberus Financial Telemetry
              </span>
              {activeFleetId && (
                <a
                  href={`https://cerberus.cloudtune.amazon.dev/usage?fleetId=${activeFleetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.72rem',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    textDecoration: 'none',
                  }}
                >
                  Open in Cerberus <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FreshnessIndicator date={summary?.lastProcessedDate} />
          <button
            onClick={() => fetchData(activeFleetId, month, true)}
            disabled={loading}
            title="Force refresh (clears 24h cache)"
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw
              size={16}
              style={loading ? { animation: 'imr-pulse 0.8s linear infinite' } : {}}
            />
          </button>
        </div>
      </header>

      {/* ── Controls ── */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          alignItems: 'center',
          background: 'rgba(20,20,30,0.4)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '14px',
          padding: '10px 16px',
          backdropFilter: 'blur(16px)',
        }}
      >
        <form
          onSubmit={handleSearch}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}
        >
          <Search size={14} color="var(--text-tertiary)" />
          <input
            value={fleetIdInput}
            onChange={(e) => setFleetIdInput(e.target.value)}
            placeholder={activeFleetId || 'Fleet ID (e.g. 11740979)'}
            style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Go
          </button>
        </form>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={14} color="var(--text-tertiary)" />
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              fetchData(activeFleetId, e.target.value);
            }}
            style={{
              padding: '7px 12px',
              borderRadius: '8px',
              fontSize: '0.82rem',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--text-primary)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Current Month</option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Telemetry Stream ── */}
      <div style={{ marginBottom: '20px' }}>
        <TelemetryStream logs={logs} loading={loading} />
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '20px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {/* ── 4 Cerberus Summary Cards ── */}
      {summaryCards && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '14px',
            marginBottom: '28px',
          }}
        >
          <CerberusSummaryCard
            title="Actuals for the month"
            value={summaryCards.actualsForMonth?.value}
            format="currency"
            color="#3b82f6"
            delay={0}
            subLines={[
              {
                text: `Actuals ${summaryCards.actualsForMonth.momPct > 0 ? 'up' : 'down'} ${Math.abs(summaryCards.actualsForMonth.momPct || 0).toFixed(2)}% vs last month`,
                icon: summaryCards.actualsForMonth.momPct > 0 ? TrendingUp : TrendingDown,
                color: summaryCards.actualsForMonth.momPct > 0 ? '#ef4444' : '#10b981',
              },
              {
                text: `Actuals ${summaryCards.actualsForMonth.yoyPct > 0 ? 'up' : 'down'} ${Math.abs(summaryCards.actualsForMonth.yoyPct || 0).toFixed(2)}% vs same month last year`,
                icon: summaryCards.actualsForMonth.yoyPct > 0 ? TrendingUp : TrendingDown,
                color: summaryCards.actualsForMonth.yoyPct > 0 ? '#ef4444' : '#10b981',
              },
            ]}
          />
          <CerberusSummaryCard
            title="Total Default CPT++ cost"
            value={summaryCards.totalScenarioCost.value}
            format="currency"
            color="#8b5cf6"
            delay={100}
            subLines={[
              {
                text: `Actuals ${summaryCards.totalScenarioCost.variancePct > 0 ? 'up' : 'down'} ${Math.abs(summaryCards.totalScenarioCost.variancePct || 0).toFixed(2)}% vs selected scenario`,
                icon:
                  summaryCards.totalScenarioCost.variancePct > 0 ? ArrowUpRight : ArrowDownRight,
                color: summaryCards.totalScenarioCost.variancePct > 0 ? '#ef4444' : '#10b981',
              },
            ]}
          />
          <CerberusSummaryCard
            title="Estimated spend using actuals"
            value={summaryCards.estimatedSpendActuals.value}
            format="currency"
            color="#10b981"
            delay={200}
            subLines={[
              {
                text: `Actuals ${summaryCards.estimatedSpendActuals.variancePct > 0 ? 'up' : 'down'} ${Math.abs(summaryCards.estimatedSpendActuals.variancePct || 0).toFixed(1)}% vs selected scenario`,
                icon:
                  summaryCards.estimatedSpendActuals.variancePct > 0
                    ? ArrowUpRight
                    : ArrowDownRight,
                color: summaryCards.estimatedSpendActuals.variancePct > 0 ? '#ef4444' : '#10b981',
              },
            ]}
            projectedDirection={summaryCards.estimatedSpendActuals.projectedDirection}
          />
          <CerberusSummaryCard
            title="Estimated spend using Default CPT++"
            value={summaryCards.estimatedSpendScenario.value}
            format="currency"
            color="#f59e0b"
            delay={300}
            subLines={[
              {
                text: `${summaryCards.estimatedSpendScenario.variancePct === 0 ? 'Aligned' : `Down ${Math.abs(summaryCards.estimatedSpendScenario.variancePct).toFixed(2)}%`} vs selected scenario`,
              },
            ]}
            projectedDirection={summaryCards.estimatedSpendScenario.projectedDirection}
          />
        </div>
      )}

      {/* ── Slack Share Bar (prominent placement) ── */}
      {summaryCards && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.06))',
            border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: '14px',
            padding: '12px 18px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 4px 20px rgba(139,92,246,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(139,92,246,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Send size={15} color="#a78bfa" />
            </div>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Share to Slack
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                Send IMR report to a channel or DM
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
              border: `1px solid ${slackChannel.startsWith('@') ? 'rgba(34,211,238,0.25)' : 'rgba(139,92,246,0.25)'}`,
              marginLeft: '8px',
            }}
          >
            <span
              style={{
                padding: '7px 10px',
                fontSize: '13px',
                background: slackChannel.startsWith('@')
                  ? 'rgba(34,211,238,0.08)'
                  : 'rgba(139,92,246,0.08)',
                color: slackChannel.startsWith('@')
                  ? 'rgba(34,211,238,0.5)'
                  : 'rgba(139,92,246,0.5)',
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
                color: slackChannel.startsWith('@') ? '#22d3ee' : '#a78bfa',
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
                    : 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.2))',
              color:
                slackStatus === 'sent'
                  ? '#30d158'
                  : slackStatus === 'error'
                    ? '#ff453a'
                    : '#a78bfa',
            }}
          >
            {slackStatus === 'sending' ? (
              <Loader2 size={14} style={{ animation: 'imr-pulse 0.8s linear infinite' }} />
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

      {/* ── AI Insights ── */}
      {insights.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <InsightsPanel insights={insights} />
        </div>
      )}

      {/* ── Tab Bar ── */}
      {Object.keys(tabs).length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              gap: '4px',
              flexWrap: 'wrap',
              background: 'rgba(20,20,30,0.4)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              padding: '4px',
              backdropFilter: 'blur(16px)',
            }}
          >
            {TAB_DEFS.map((tab) => {
              const isActive = activeTab === tab.key;
              const hasData = tabs[tab.key] && tabs[tab.key].length > 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: isActive
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'transparent',
                    color: isActive
                      ? '#fff'
                      : hasData
                        ? 'var(--text-secondary)'
                        : 'var(--text-tertiary)',
                    opacity: hasData || isActive ? 1 : 0.5,
                  }}
                >
                  {tab.shortLabel}
                  {hasData && (
                    <span style={{ marginLeft: '4px', fontSize: '0.65rem', opacity: 0.7 }}>
                      ({tabs[tab.key].length})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Active Tab Content ── */}
      {Object.keys(tabs).length > 0 && (
        <div
          style={{
            background: 'rgba(20,20,30,0.45)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px',
            overflow: 'hidden',
            backdropFilter: 'blur(16px)',
            marginBottom: '32px',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {activeTabDef.type === 'fleet' ? (
              <Layers size={16} color="#8b5cf6" />
            ) : (
              <BarChart3 size={16} color="#3b82f6" />
            )}
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeTabDef.label}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
              {activeTabData.length} {activeTabDef.type === 'fleet' ? 'fleets' : 'services'}
              {activeTabDef.type === 'fleet' && ' • click to drill down'}
            </span>
          </div>
          {activeTabDef.type === 'product' ? (
            <ProductTable products={activeTabData} />
          ) : (
            <FleetTable fleets={activeTabData} onDrillDown={handleDrillDown} />
          )}
        </div>
      )}

      {/* ── Open Cerberus Dashboard ── */}
      <div style={{ marginBottom: '32px' }}>
        <a
          href={`https://cerberus.cloudtune.amazon.dev/usage?fleetId=${activeFleetId || '11740979'}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '20px 32px',
            borderRadius: '16px',
            textDecoration: 'none',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))',
            border: '1px solid rgba(16,185,129,0.25)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <ExternalLink size={20} color="#10b981" />
          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#10b981' }}>
            Open Cerberus Dashboard
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            — Fleet {activeFleetId || '11740979'} • Full interactive view with your Midway session
          </span>
        </a>
      </div>

      {/* ── Loading ── */}
      {loading && !summary && (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-tertiary)' }}>
          <RefreshCw
            size={28}
            style={{
              margin: '0 auto 16px',
              display: 'block',
              animation: 'imr-pulse 1s linear infinite',
            }}
          />
          <div style={{ fontSize: '0.9rem', animation: 'imr-pulse 2s ease-in-out infinite' }}>
            Establishing Cerberus link...
          </div>
        </div>
      )}
    </div>
  );
}
