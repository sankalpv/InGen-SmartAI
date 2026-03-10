'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Info, ChevronDown, ChevronUp, ExternalLink, X, AlertTriangle, TrendingUp, TrendingDown, Minus, HelpCircle } from 'lucide-react';
import AIChat from '@/components/AIChat';
import MetricsVisual from '@/components/MetricsVisual';

// ─── Constants ───

const AVATAR_COLORS = [
    'linear-gradient(135deg, #4f8cff, #3b6fd4)',
    'linear-gradient(135deg, #a855f7, #7c3aed)',
    'linear-gradient(135deg, #fb923c, #ea580c)',
    'linear-gradient(135deg, #34d399, #059669)',
    'linear-gradient(135deg, #f472b6, #db2777)',
    'linear-gradient(135deg, #22d3ee, #0891b2)',
    'linear-gradient(135deg, #fbbf24, #d97706)',
    'linear-gradient(135deg, #818cf8, #6366f1)',
    'linear-gradient(135deg, #ef4444, #b91c1c)',
    'linear-gradient(135deg, #14b8a6, #0d9488)',
];

const METRIC_DESCRIPTIONS = {
    crsCreated: {
        title: 'CRs Created',
        description: 'Code Reviews authored and submitted by engineers in your org this week.',
        calculation: 'Counted from code.amazon.com user activity via amzn-mcp search_internal_code (type=user). Each unique CR where the engineer is listed as the author is counted once.',
        benchmark: '5-8 CRs/week is a healthy range for an IC. Higher for senior engineers working on smaller, incremental changes.',
        icon: '📝',
    },
    crsReviewed: {
        title: 'CRs Reviewed',
        description: 'Code Reviews where an engineer provided feedback, comments, or approval.',
        calculation: 'Counted from code.amazon.com user activity. Each CR where the engineer appears as a reviewer (approved, commented, or requested changes) is counted.',
        benchmark: 'A healthy review ratio is 1.5–2× the number of CRs created. This ensures knowledge sharing and reduces bus factor risk.',
        icon: '👀',
    },
    p50Turnaround: {
        title: 'P50 CR Turnaround',
        description: 'Median time from CR submission to first meaningful review across the org.',
        calculation: 'For each engineer, their average CR turnaround time is extracted from code.amazon.com activity. The P50 (median) is then computed across all engineers with data.',
        benchmark: 'Under 4 hours is excellent. 4-8 hours is acceptable. Over 8 hours indicates review bottlenecks that slow development velocity.',
        icon: '⏱️',
    },
    staleCrs: {
        title: 'Stale CRs',
        description: 'Open CRs that have been waiting for review for more than 5 days with no activity. Shown as an org-level alert only — not attributed to individual engineers since reviewers control turnaround.',
        calculation: 'CRs in "open" status where the creation/last-activity date is >5 days ago. Configured via engMetrics.staleCrThresholdDays in settings.json. Aggregated across the entire org.',
        benchmark: 'Target: 0 stale CRs. Each stale CR represents blocked work and potential context-switching cost when the engineer returns to it.',
        icon: '🔴',
    },
    reviewRatio: {
        title: 'Review Ratio',
        description: 'The ratio of CRs reviewed to CRs created for each engineer. Measures engineering citizenship — how much an engineer invests in reviewing teammates\' code relative to their own output.',
        calculation: 'CRs Reviewed ÷ CRs Created for the current week. A ratio of 1.5× means the engineer reviewed 50% more CRs than they authored. Edge cases: if CRs Created = 0 but reviews > 0, shows ∞.',
        benchmark: '≥1.5× is healthy (reviewing more than authoring promotes knowledge sharing). 1.0–1.5× is acceptable. <1.0× means reviewing less than creating — consider encouraging more review activity.',
        icon: '🔄',
    },
};

// ─── Utility Functions ───

function getAvatarColor(index) {
    return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function TurnaroundColor(hours) {
    if (hours <= 4) return '#30d158';
    if (hours <= 6) return '#ff9f0a';
    return '#ff453a';
}

function StaleColor(count) {
    if (count === 0) return '#30d158';
    return '#ff453a';
}

function CrColor(count) {
    if (count >= 6) return '#30d158';
    if (count >= 3) return 'rgba(255,255,255,0.7)';
    return '#ff9f0a';
}

function ReviewColor(count) {
    if (count >= 10) return '#30d158';
    if (count >= 5) return 'rgba(255,255,255,0.7)';
    return '#ff9f0a';
}

// ─── Info Tooltip Component ───
function MetricInfo({ metricKey, style }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const info = METRIC_DESCRIPTIONS[metricKey];
    if (!info) return null;

    // Close on click outside
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <span ref={ref} style={{ position: 'relative', display: 'inline-flex', ...style }}>
            <button
                onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                    color: open ? '#0a84ff' : 'rgba(255,255,255,0.2)', transition: 'color 0.2s',
                    display: 'inline-flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#0a84ff'}
                onMouseLeave={e => { if (!open) e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; }}
                title={`Learn about ${info.title}`}
            >
                <Info size={13} />
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                    marginTop: '8px', width: '340px', zIndex: 100,
                    background: 'rgba(18,18,28,0.98)', backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(10,132,255,0.25)', borderRadius: '14px',
                    padding: '18px 20px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                    animation: 'fadeInUp 0.2s ease-out',
                }}>
                    {/* Arrow */}
                    <div style={{
                        position: 'absolute', top: '-6px', left: '50%', transform: 'translateX(-50%) rotate(45deg)',
                        width: '12px', height: '12px', background: 'rgba(18,18,28,0.98)',
                        border: '1px solid rgba(10,132,255,0.25)', borderBottom: 'none', borderRight: 'none',
                    }} />

                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{info.icon}</span> {info.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.6', marginBottom: '12px' }}>
                        {info.description}
                    </div>

                    <div style={{ background: 'rgba(10,132,255,0.06)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#0a84ff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                            How it&apos;s calculated
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>
                            {info.calculation}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(48,209,88,0.06)', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#30d158', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                            Benchmark
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>
                            {info.benchmark}
                        </div>
                    </div>
                </div>
            )}
        </span>
    );
}

// ─── Trend Delta Component ───
function TrendDelta({ delta, suffix = '' }) {
    if (delta === null || delta === undefined) return <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)', marginLeft: '6px' }}>—</span>;
    if (delta === 0) return <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginLeft: '6px' }}>—</span>;
    const isUp = delta > 0;
    const color = isUp ? '#30d158' : '#ff453a';
    const arrow = isUp ? '▲' : '▼';
    const sign = isUp ? '+' : '';
    return (
        <span style={{ fontSize: '10px', fontWeight: 600, color, marginLeft: '6px' }}>
            {arrow} {sign}{delta}{suffix}
        </span>
    );
}

// ─── Mini Sparkline Component ───
function Sparkline({ data, color = 'rgba(10,132,255,0.5)', highlightColor = 'rgba(48,209,88,0.6)' }) {
    if (!data || data.length === 0) return null;
    const max = Math.max(...data, 1);
    return (
        <span style={{ display: 'inline-flex', gap: '1px', alignItems: 'flex-end', height: '18px', marginLeft: '8px', verticalAlign: 'middle' }}>
            {data.map((val, i) => (
                <span key={i} style={{
                    width: '5px',
                    height: `${Math.max(3, (val / max) * 18)}px`,
                    borderRadius: '1.5px',
                    background: i === data.length - 1 ? highlightColor : color,
                    transition: 'height 0.4s ease-out',
                }} />
            ))}
        </span>
    );
}

// ─── Animated Bar Component ───
function AnimatedBar({ width, maxWidth, children, color, delay = 0 }) {
    const [animated, setAnimated] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setAnimated(true), 50 + delay);
        return () => clearTimeout(timer);
    }, [delay]);

    return (
        <div style={{
            height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center', paddingLeft: '8px',
            fontSize: '10px', fontWeight: 600, color: '#fff', minWidth: '28px',
            width: animated ? `${maxWidth}px` : '28px',
            background: color,
            transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            transitionDelay: `${delay}ms`,
        }}>
            {children}
        </div>
    );
}

// ─── Org Summary Stat Card ───
function OrgStat({ value, label, trend, trendLabel, bgClass, metricKey }) {
    const bgStyles = {
        blue: { background: 'rgba(10,132,255,0.08)', border: '1px solid rgba(10,132,255,0.15)' },
        green: { background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)' },
        purple: { background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' },
        orange: { background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)' },
        red: { background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.15)' },
    };
    const colorMap = { blue: '#0a84ff', green: '#30d158', purple: '#a78bfa', orange: '#ff9f0a', red: '#ff453a' };

    const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

    return (
        <div style={{
            borderRadius: '16px', padding: '18px 24px', minWidth: '130px', textAlign: 'center',
            ...bgStyles[bgClass], position: 'relative', transition: 'transform 0.2s, box-shadow 0.2s',
        }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                <MetricInfo metricKey={metricKey} />
            </div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: colorMap[bgClass], letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '8px', fontWeight: 600 }}>{label}</div>
            {trendLabel && (
                <div style={{ fontSize: '11px', marginTop: '6px', fontWeight: 600, color: trend >= 0 ? '#30d158' : '#ff453a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                    <TrendIcon size={12} />
                    {trendLabel}
                </div>
            )}
        </div>
    );
}

// ─── Alert Card ───
function AlertCard({ icon, count, label, color, description, onClick }) {
    const bgColor = color === 'red' ? 'rgba(255,69,58,0.08)' : color === 'orange' ? 'rgba(255,159,10,0.08)' : 'rgba(255,255,255,0.04)';
    const borderColor = color === 'red' ? 'rgba(255,69,58,0.18)' : color === 'orange' ? 'rgba(255,159,10,0.18)' : 'rgba(255,255,255,0.08)';
    const countColor = color === 'red' ? '#ff453a' : color === 'orange' ? '#ff9f0a' : 'rgba(255,255,255,0.7)';

    return (
        <button onClick={onClick} style={{
            flex: 1, borderRadius: '14px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px',
            cursor: 'pointer', border: `1px solid ${borderColor}`, background: bgColor,
            fontFamily: 'inherit', transition: 'all 0.2s', color: '#fff', textAlign: 'left',
        }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            <span style={{ fontSize: '24px' }}>{icon}</span>
            <div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: countColor, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginTop: '2px', fontWeight: 600 }}>{label}</div>
                {description && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', lineHeight: '1.4' }}>{description}</div>}
            </div>
        </button>
    );
}

// ─── Weekly Trend Bar Chart ───
function TrendChart({ trend }) {
    if (!trend || trend.length === 0) return null;
    const maxCr = Math.max(...trend.map(t => t.crsCreated), 1);
    const maxRv = Math.max(...trend.map(t => t.crsReviewed), 1);
    const maxVal = Math.max(maxCr, maxRv);

    return (
        <div style={{
            background: 'rgba(22,22,30,0.6)', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '16px', padding: '24px 28px', marginBottom: '28px',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    📈 Org CR Velocity — Last {trend.length} Weeks
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <HelpCircle size={12} /> Tracks week-over-week authoring & review throughput
                </div>
            </div>
            {trend.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                    <span style={{ width: '48px', fontSize: '11px', color: i === trend.length - 1 ? '#0a84ff' : 'rgba(255,255,255,0.35)', textAlign: 'right', flexShrink: 0, fontWeight: i === trend.length - 1 ? 700 : 400 }}>
                        {t.weekLabel}
                    </span>
                    <AnimatedBar
                        maxWidth={Math.max(28, (t.crsCreated / maxVal) * 280)}
                        color="linear-gradient(90deg, rgba(10,132,255,0.7), rgba(10,132,255,0.35))"
                        delay={i * 60}
                    >
                        {t.crsCreated}
                    </AnimatedBar>
                    <AnimatedBar
                        maxWidth={Math.max(28, (t.crsReviewed / maxVal) * 280)}
                        color="linear-gradient(90deg, rgba(48,209,88,0.7), rgba(48,209,88,0.35))"
                        delay={i * 60 + 30}
                    >
                        {t.crsReviewed}
                    </AnimatedBar>
                </div>
            ))}
            <div style={{ marginTop: '14px', fontSize: '11px', color: 'rgba(255,255,255,0.3)', display: 'flex', gap: '20px' }}>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(10,132,255,0.6)', verticalAlign: 'middle', marginRight: '5px' }} />CRs Created</span>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(48,209,88,0.5)', verticalAlign: 'middle', marginRight: '5px' }} />CRs Reviewed</span>
            </div>
        </div>
    );
}

// ─── Engineer Detail Panel ───
function EngineerPanel({ alias, onClose }) {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [summaryText, setSummaryText] = useState('');
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryPhase, setSummaryPhase] = useState(''); // 'fetching' | 'generating' | 'done' | 'error'
    const [crDetails, setCrDetails] = useState(null);

    useEffect(() => {
        if (!alias) return;
        setLoading(true);
        fetch(`/api/eng-metrics?view=engineer&alias=${alias}&weeks=12`)
            .then(r => r.json())
            .then(d => { setDetail(d.data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [alias]);

    if (!alias) return null;

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.5)', zIndex: 999, animation: 'fadeIn 0.2s ease-out',
            }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, width: '600px', height: '100vh',
                background: 'rgba(12,12,20,0.98)', backdropFilter: 'blur(24px)',
                borderLeft: '1px solid rgba(10,132,255,0.2)', zIndex: 1000,
                overflowY: 'scroll', WebkitOverflowScrolling: 'touch',
                padding: '32px', paddingBottom: '80px', boxShadow: '-16px 0 60px rgba(0,0,0,0.6)',
                animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0a84ff', display: 'flex', alignItems: 'center', gap: '8px' }}>👤 Engineer Detail</h3>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
                        borderRadius: '10px', padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                        transition: 'all 0.15s',
                    }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    >✕ Close</button>
                </div>

                {loading && (
                    <div style={{ textAlign: 'center', padding: '60px 40px', color: 'rgba(255,255,255,0.4)' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                        <div style={{ fontSize: '14px' }}>Loading engineer data...</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>Fetching 12-week history from eng-metrics.db</div>
                    </div>
                )}

                {!loading && detail && (
                    <>
                        {/* Person Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '28px', paddingBottom: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{
                                width: '60px', height: '60px', borderRadius: '18px', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '22px',
                                color: '#fff', background: 'linear-gradient(135deg, #4f8cff, #3b6fd4)',
                                boxShadow: '0 4px 16px rgba(79,140,255,0.3)',
                            }}>
                                {(detail.name || detail.alias)[0]?.toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>{detail.name}</div>
                                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                                    {detail.alias}@amazon.com · {detail.team || 'Team'}
                                </div>
                            </div>
                        </div>

                        {/* Current Week Stats */}
                        {detail.currentWeek && (
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
                                <OrgStat value={detail.currentWeek.crsCreated} label="CRs Created" bgClass="blue" metricKey="crsCreated" />
                                <OrgStat value={detail.currentWeek.crsReviewed} label="Reviewed" bgClass="green" metricKey="crsReviewed" />
                            </div>
                        )}

                        {/* AI Work Summary */}
                        <div style={{ background: 'linear-gradient(145deg, rgba(10,132,255,0.08), rgba(139,92,246,0.05))', border: '1px solid rgba(10,132,255,0.2)', borderRadius: '14px', padding: '16px 20px', marginBottom: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: summaryText || summaryLoading ? '12px' : '0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '16px' }}>🤖</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa' }}>AI Work Summary</span>
                                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(10,132,255,0.15)', color: '#60a5fa' }}>Live CR Fetch</span>
                                </div>
                                {!summaryLoading && (
                                    <button onClick={async () => {
                                        setSummaryLoading(true);
                                        setSummaryText('');
                                        setCrDetails(null);
                                        setSummaryPhase('fetching');
                                        try {
                                            const res = await fetch(`/api/eng-metrics?view=work-summary&alias=${alias}`);
                                            if (!res.ok) {
                                                const err = await res.json();
                                                setSummaryPhase('error');
                                                setSummaryText(err.error || 'Failed to generate summary');
                                                setSummaryLoading(false);
                                                return;
                                            }
                                            const reader = res.body.getReader();
                                            const decoder = new TextDecoder();
                                            let fullText = '';
                                            while (true) {
                                                const { done, value } = await reader.read();
                                                if (done) break;
                                                const chunk = decoder.decode(value, { stream: true });
                                                for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
                                                    try {
                                                        const data = JSON.parse(line.slice(6));
                                                        if (data.type === 'cr-details') {
                                                            setCrDetails(data.crs);
                                                            setSummaryPhase('generating');
                                                        } else if (data.type === 'chunk') {
                                                            fullText += data.text;
                                                            setSummaryText(fullText);
                                                        } else if (data.type === 'done') {
                                                            setSummaryPhase('done');
                                                        } else if (data.type === 'error') {
                                                            setSummaryPhase('error');
                                                            setSummaryText(data.message);
                                                        }
                                                    } catch (e) { /* skip */ }
                                                }
                                            }
                                        } catch (e) {
                                            setSummaryPhase('error');
                                            setSummaryText(e.message);
                                        }
                                        setSummaryLoading(false);
                                    }} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600, background: 'rgba(10,132,255,0.15)', color: '#60a5fa', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        ✨ {summaryText ? 'Regenerate' : 'Generate Summary'}
                                    </button>
                                )}
                            </div>

                            {/* Loading state */}
                            {summaryLoading && !summaryText && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#60a5fa', animation: 'pulse 1.2s ease-in-out infinite' }} />
                                    <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                        {summaryPhase === 'fetching' ? 'Fetching CR details from code.amazon.com...' : 'Generating AI summary...'}
                                    </span>
                                </div>
                            )}

                            {/* CR Details badges */}
                            {crDetails && crDetails.length > 0 && (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: summaryText ? '10px' : '0' }}>
                                    {crDetails.map((cr, i) => (
                                        <a key={i} href={`https://code.amazon.com/reviews/${cr.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: cr.type === 'created' ? 'rgba(10,132,255,0.1)' : 'rgba(48,209,88,0.1)', color: cr.type === 'created' ? '#0a84ff' : '#30d158', border: `1px solid ${cr.type === 'created' ? 'rgba(10,132,255,0.15)' : 'rgba(48,209,88,0.15)'}`, textDecoration: 'none' }}>
                                            {cr.type === 'created' ? '📝' : '👀'} {cr.id}
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* Summary text (streaming) */}
                            {summaryText && (
                                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                                    {summaryText}
                                    {summaryLoading && <span style={{ display: 'inline-block', width: '6px', height: '14px', background: '#60a5fa', marginLeft: '2px', animation: 'pulse 0.8s ease-in-out infinite', verticalAlign: 'text-bottom' }} />}
                                </div>
                            )}

                            {/* Empty state */}
                            {!summaryLoading && !summaryText && (
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px' }}>
                                    Click &quot;Generate Summary&quot; to fetch live CR details and create an AI-powered work summary
                                </div>
                            )}
                        </div>

                        {/* Weekly History */}
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', margin: '24px 0 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            📊 Weekly History ({detail.weeklyHistory?.length || 0} weeks)
                            <span style={{ fontWeight: 400, fontSize: '10px', color: 'rgba(255,255,255,0.25)', textTransform: 'none', letterSpacing: 0 }}>
                                — CRs created vs reviewed per week
                            </span>
                        </div>
                        <div>
                            {(detail.weeklyHistory || []).slice().reverse().map((h, i) => {
                                const maxCr = Math.max(...detail.weeklyHistory.map(w => w.crsCreated), 1);
                                const maxRv = Math.max(...detail.weeklyHistory.map(w => w.crsReviewed), 1);
                                const maxVal = Math.max(maxCr, maxRv);
                                const isCurrent = i === 0;
                                return (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0',
                                        borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '12px',
                                        background: isCurrent ? 'rgba(10,132,255,0.04)' : 'transparent',
                                        borderRadius: isCurrent ? '6px' : 0, paddingLeft: isCurrent ? '8px' : 0,
                                    }}>
                                        <span style={{ width: '50px', color: isCurrent ? '#0a84ff' : 'rgba(255,255,255,0.35)', flexShrink: 0, fontWeight: isCurrent ? 700 : 400 }}>{h.weekLabel}</span>
                                        <div style={{ flex: 1, display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <div style={{
                                                height: '14px', borderRadius: '3px', display: 'flex', alignItems: 'center', paddingLeft: '6px',
                                                fontSize: '9px', fontWeight: 600, color: '#fff', minWidth: '20px',
                                                width: `${Math.max(20, (h.crsCreated / maxVal) * 160)}px`,
                                                background: 'rgba(10,132,255,0.5)',
                                            }}>{h.crsCreated}</div>
                                            <div style={{
                                                height: '14px', borderRadius: '3px', display: 'flex', alignItems: 'center', paddingLeft: '6px',
                                                fontSize: '9px', fontWeight: 600, color: '#fff', minWidth: '20px',
                                                width: `${Math.max(20, (h.crsReviewed / maxVal) * 160)}px`,
                                                background: 'rgba(48,209,88,0.4)',
                                            }}>{h.crsReviewed}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.25)', display: 'flex', gap: '16px' }}>
                            <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: 'rgba(10,132,255,0.5)', verticalAlign: 'middle', marginRight: '4px' }} />CRs Created</span>
                            <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: 'rgba(48,209,88,0.4)', verticalAlign: 'middle', marginRight: '4px' }} />CRs Reviewed</span>
                        </div>

                        {/* Recent CRs */}
                        {detail.recentCrs?.length > 0 && (
                            <>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', margin: '24px 0 12px' }}>
                                    📝 Recent Code Reviews
                                </div>
                                {detail.recentCrs.slice(0, 5).map((cr, i) => (
                                    <div key={i} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <a href={`https://code.amazon.com/reviews/${cr.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none', flexShrink: 0, fontWeight: 600 }}>{cr.id}</a>
                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.snippet}</span>
                                        <span style={{ color: cr.type === 'reviewed' ? '#30d158' : '#0a84ff', flexShrink: 0, fontSize: '11px' }}>
                                            {cr.type === 'reviewed' ? '✅ Reviewed' : '📝 Created'}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}

                        <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                            Data stored in data/eng-metrics.db · 52 weeks retention · Updated weekly via amzn-mcp
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

// ─── Year Trend Line Chart ───
function YearTrendChart({ data, metric = 'crsCreated' }) {
    if (!data || data.length === 0) return null;
    const metricLabels = { crsCreated: 'CRs Created', crsReviewed: 'CRs Reviewed', linesChanged: 'Lines Changed' };
    const metricColors = { crsCreated: '#0a84ff', crsReviewed: '#30d158', linesChanged: '#a78bfa' };

    const values = data.map(d => d[metric] || 0);
    const maxVal = Math.max(...values, 1);
    const chartWidth = Math.max(data.length * 28, 400);
    const chartHeight = 160;
    const padding = { top: 10, right: 10, bottom: 30, left: 10 };
    const innerW = chartWidth - padding.left - padding.right;
    const innerH = chartHeight - padding.top - padding.bottom;

    const points = values.map((v, i) => {
        const x = padding.left + (i / Math.max(values.length - 1, 1)) * innerW;
        const y = padding.top + innerH - (v / maxVal) * innerH;
        return `${x},${y}`;
    });
    const polyline = points.join(' ');

    // 4-week rolling average
    const rolling = values.map((_, i) => {
        const start = Math.max(0, i - 3);
        const slice = values.slice(start, i + 1);
        return slice.reduce((a, b) => a + b, 0) / slice.length;
    });
    const rollingPoints = rolling.map((v, i) => {
        const x = padding.left + (i / Math.max(values.length - 1, 1)) * innerW;
        const y = padding.top + innerH - (v / maxVal) * innerH;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
            <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                    const y = padding.top + innerH - pct * innerH;
                    return <line key={pct} x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="rgba(255,255,255,0.04)" />;
                })}
                {/* Area fill */}
                <polygon
                    points={`${padding.left},${padding.top + innerH} ${polyline} ${padding.left + innerW},${padding.top + innerH}`}
                    fill={`${metricColors[metric]}15`}
                />
                {/* Main line */}
                <polyline points={polyline} fill="none" stroke={metricColors[metric]} strokeWidth="2" strokeLinejoin="round" />
                {/* Rolling average */}
                <polyline points={rollingPoints} fill="none" stroke={metricColors[metric]} strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
                {/* Data points */}
                {values.map((v, i) => {
                    if (!data[i].hasData) return null;
                    const x = padding.left + (i / Math.max(values.length - 1, 1)) * innerW;
                    const y = padding.top + innerH - (v / maxVal) * innerH;
                    return <circle key={i} cx={x} cy={y} r="3" fill={metricColors[metric]} opacity="0.7" />;
                })}
                {/* Week labels */}
                {data.map((d, i) => {
                    if (i % Math.max(1, Math.floor(data.length / 10)) !== 0) return null;
                    const x = padding.left + (i / Math.max(data.length - 1, 1)) * innerW;
                    return <text key={i} x={x} y={chartHeight - 4} fill="rgba(255,255,255,0.25)" fontSize="9" textAnchor="middle">{d.weekLabel}</text>;
                })}
            </svg>
            <div style={{ display: 'flex', gap: '16px', marginTop: '4px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                <span><span style={{ display: 'inline-block', width: '16px', height: '2px', background: metricColors[metric], verticalAlign: 'middle', marginRight: '4px' }} />{metricLabels[metric]}</span>
                <span><span style={{ display: 'inline-block', width: '16px', height: '2px', background: metricColors[metric], verticalAlign: 'middle', marginRight: '4px', opacity: 0.5, borderBottom: '1px dashed' }} />4-week avg</span>
            </div>
        </div>
    );
}

// ─── Main Page ───
export default function EngMetricsPage() {
    const [dashboard, setDashboard] = useState(null);
    const [trend, setTrend] = useState(null);
    const [yearTrend, setYearTrend] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [error, setError] = useState(null);
    const [selectedEngineer, setSelectedEngineer] = useState(null);
    const [sparklines, setSparklines] = useState({});
    const [refreshProgress, setRefreshProgress] = useState('');
    const [trendMetric, setTrendMetric] = useState('crsCreated');
    const [trendPeriod, setTrendPeriod] = useState('ytd');
    const [missingWeeks, setMissingWeeks] = useState(0);
    const [sortCol, setSortCol] = useState('crsCreated');
    const [sortDir, setSortDir] = useState('desc');
    const [filterTeam, setFilterTeam] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageView, setPageView] = useState('visual'); // 'visual' | 'table'
    const [showStaleCrs, setShowStaleCrs] = useState(false);
    const currentYear = new Date().getFullYear();

    const fetchDashboard = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Fire sync in background — don't block the page
            fetch('/api/eng-metrics?view=sync').catch(() => {});
            // Fire live stale CR count in background
            fetch('/api/eng-metrics?view=stale-crs').then(r => r.json()).then(d => {
                if (d.data?.count !== undefined) {
                    setDashboard(prev => prev ? {
                        ...prev,
                        summary: { ...prev.summary, staleCrs: { value: d.data.count, prev: prev.summary?.staleCrs?.prev || 0 } },
                        alerts: { ...prev.alerts, staleCrs: d.data.count, staleCrDetails: d.data.details || [] }
                    } : prev);
                }
            }).catch(() => {});

            // Load dashboard data from SQLite (fast, no external calls)
            const results = await Promise.allSettled([
                fetch('/api/eng-metrics?view=dashboard').then(r => r.json()),
                fetch('/api/eng-metrics?view=trend&weeks=8').then(r => r.json()),
                fetch(`/api/eng-metrics?view=org-year-trend&year=${currentYear}`).then(r => r.json()),
                fetch(`/api/eng-metrics?view=missing-weeks&year=${currentYear}`).then(r => r.json()),
            ]);

            const [dashResult, trendResult, yearResult, missingResult] = results;

            if (dashResult.status === 'fulfilled' && !dashResult.value.error) {
                setDashboard(dashResult.value.data);
            } else if (dashResult.status === 'fulfilled' && dashResult.value.error) {
                setError(dashResult.value.error);
            }

            if (trendResult.status === 'fulfilled' && trendResult.value.data) {
                setTrend(trendResult.value.data);
            }
            if (yearResult.status === 'fulfilled' && yearResult.value.data) {
                setYearTrend(yearResult.value.data);
            }
            if (missingResult.status === 'fulfilled' && missingResult.value.data) {
                setMissingWeeks(missingResult.value.data.count || 0);
            }
        } catch (e) {
            setError(e.message);
        }
        setIsLoading(false);
    }, [currentYear]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        setRefreshProgress('Fetching code metrics from code.amazon.com via builder-mcp...');
        try {
            const res = await fetch('/api/eng-metrics?view=refresh');
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setRefreshProgress(`Fetched ${data.data?.fetchedCount || 0} engineers. Reloading dashboard...`);
                await fetchDashboard();
            }
        } catch (e) {
            setError(e.message);
        }
        setIsRefreshing(false);
        setRefreshProgress('');
    };

    const [backfillProgress, setBackfillProgress] = useState(null);

    const handleBackfill = async () => {
        setIsBackfilling(true);
        try {
            // Start backfill (returns immediately)
            await fetch(`/api/eng-metrics?view=backfill&year=${currentYear}`);
            // Start polling for progress
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/eng-metrics?view=backfill-status');
                    const statusData = await statusRes.json();
                    const status = statusData.data;
                    setBackfillProgress(status);
                    if (!status.running) {
                        clearInterval(pollInterval);
                        setIsBackfilling(false);
                        setBackfillProgress(null);
                        if (status.result?.status === 'complete') {
                            await fetchDashboard();
                        }
                        if (status.error) setError(status.error);
                    }
                } catch (e) { /* ignore poll errors */ }
            }, 2000);
        } catch (e) {
            setError(e.message);
            setIsBackfilling(false);
        }
    };

    const handleCancelBackfill = async () => {
        try { await fetch('/api/eng-metrics?view=backfill-cancel'); } catch (e) { /* ignore */ }
    };

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    // Fetch sparklines for visible engineers
    useEffect(() => {
        if (!dashboard?.engineers) return;
        dashboard.engineers.forEach(async (eng) => {
            if (sparklines[eng.alias]) return;
            try {
                const res = await fetch(`/api/eng-metrics?view=sparkline&alias=${eng.alias}`);
                const data = await res.json();
                if (data.data) {
                    setSparklines(prev => ({ ...prev, [eng.alias]: data.data }));
                }
            } catch (e) { /* ignore */ }
        });
    }, [dashboard?.engineers]);

    return (
        <div className="dark-inline-page" style={{ zoom: 1.15 }}>
            {/* CSS Animations */}
            <style>{`
                @keyframes fadeInUp { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {dashboard && (
                            <>
                                <span>{dashboard.weekId} · {dashboard.totalEngineers} engineers</span>
                                <button onClick={handleRefresh} disabled={isRefreshing || isBackfilling} style={{
                                    background: isRefreshing ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.15)',
                                    color: isRefreshing ? 'rgba(255,255,255,0.3)' : '#a78bfa', border: 'none',
                                    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                    cursor: isRefreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
                                    transition: 'all 0.2s',
                                }}>
                                    <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} /> {isRefreshing ? 'Refreshing...' : '🔄 Refresh Week'}
                                </button>
                                {missingWeeks > 0 && (
                                    <button onClick={handleBackfill} disabled={isBackfilling || isRefreshing} style={{
                                        background: isBackfilling ? 'rgba(255,255,255,0.05)' : 'rgba(10,132,255,0.15)',
                                        color: isBackfilling ? 'rgba(255,255,255,0.3)' : '#0a84ff', border: 'none',
                                        padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                        cursor: isBackfilling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
                                    }}>
                                        <RefreshCw size={14} className={isBackfilling ? 'spin' : ''} />
                                        {isBackfilling ? 'Backfilling...' : `📥 Fetch ${currentYear} Data (${missingWeeks} weeks)`}
                                    </button>
                                )}
                                {dashboard.lastFetched && (
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                                        Last updated: {new Date(dashboard.lastFetched).toLocaleString()}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Refresh Progress */}
            {refreshProgress && !backfillProgress && (
                <div style={{ padding: '14px 20px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="loading-spinner" style={{ width: '16px', height: '16px' }} />
                    {refreshProgress}
                </div>
            )}

            {/* Backfill Progress Card */}
            {backfillProgress && backfillProgress.running && (
                <div style={{
                    background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.2)',
                    borderRadius: '16px', padding: '24px 28px', marginBottom: '24px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0a84ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📥 Fetching {currentYear} Data
                        </div>
                        <button onClick={handleCancelBackfill} style={{
                            background: 'rgba(255,69,58,0.1)', color: '#ff453a', border: '1px solid rgba(255,69,58,0.2)',
                            padding: '4px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                            Cancel
                        </button>
                    </div>

                    {/* Progress info */}
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '12px' }}>
                        Week {backfillProgress.completedWeeks + 1} of {backfillProgress.totalWeeks}
                        {backfillProgress.currentWeek && <span style={{ color: '#0a84ff', fontWeight: 600 }}> ({backfillProgress.currentWeek})</span>}
                        <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: '8px' }}>
                            · {backfillProgress.totalEngineers} engineers · Phase: {backfillProgress.currentPhase || 'starting'}
                        </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
                        <div style={{
                            height: '100%', borderRadius: '4px',
                            width: `${backfillProgress.totalWeeks > 0 ? Math.round((backfillProgress.completedWeeks / backfillProgress.totalWeeks) * 100) : 0}%`,
                            background: 'linear-gradient(90deg, #0a84ff, #30d158)',
                            transition: 'width 0.5s ease-out',
                        }} />
                    </div>

                    {/* Week checklist */}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {Object.entries(backfillProgress.weekStatuses || {}).map(([week, status]) => (
                            <span key={week} style={{
                                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                background: status === 'done' ? 'rgba(48,209,88,0.1)' : status === 'running' ? 'rgba(10,132,255,0.15)' : 'rgba(255,255,255,0.04)',
                                color: status === 'done' ? '#30d158' : status === 'running' ? '#0a84ff' : 'rgba(255,255,255,0.25)',
                                border: `1px solid ${status === 'done' ? 'rgba(48,209,88,0.15)' : status === 'running' ? 'rgba(10,132,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
                            }}>
                                {status === 'done' ? '✅' : status === 'running' ? '⏳' : '⬜'} {week}
                            </span>
                        ))}
                    </div>

                    {/* Elapsed time */}
                    {backfillProgress.startedAt && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '12px' }}>
                            Started: {new Date(backfillProgress.startedAt).toLocaleTimeString()}
                        </div>
                    )}
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div style={{ padding: '80px', textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 20px' }} />
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>Loading engineering metrics...</div>
                    <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', marginTop: '6px' }}>Reading from data/eng-metrics.db</div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '14px', padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
                    <AlertTriangle size={24} color="#ff453a" style={{ marginBottom: '8px' }} />
                    <div style={{ color: '#ff453a', fontWeight: 700, marginBottom: '6px', fontSize: '15px' }}>Error loading metrics</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{error}</div>
                </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && dashboard?.empty && (
                <div style={{
                    background: 'rgba(22,22,30,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '20px', padding: '80px 40px', textAlign: 'center', marginBottom: '28px'
                }}>
                    <div style={{ fontSize: '56px', marginBottom: '20px' }}>📊</div>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '10px', color: 'rgba(255,255,255,0.85)' }}>No Metrics Data Yet</h2>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', maxWidth: '440px', margin: '0 auto 28px', lineHeight: '1.6' }}>
                        Click &quot;Refresh&quot; to fetch code review metrics from code.amazon.com for all engineers in your org.
                        Make sure your org is synced first (Settings → Org Sync).
                    </p>
                    <button onClick={handleRefresh} disabled={isRefreshing} style={{
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(99,102,241,0.25))',
                        color: '#a78bfa', border: '1px solid rgba(139,92,246,0.35)',
                        padding: '14px 28px', borderRadius: '14px', fontSize: '15px', fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.2s',
                    }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        <RefreshCw size={18} /> Fetch Metrics from code.amazon.com
                    </button>
                    <div style={{ marginTop: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.15)', lineHeight: '1.6' }}>
                        Uses amzn-mcp → search_internal_code (type=user) to query per-engineer CR activity.<br />
                        Data is stored locally in data/eng-metrics.db with 52-week retention.
                    </div>
                </div>
            )}

            {/* Dashboard Content */}
            {!isLoading && !error && dashboard && !dashboard.empty && (
                <>
                    {/* Org Summary Stats */}
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                        <OrgStat value={dashboard.summary.crsCreated.value} label="CRs Created" trend={dashboard.summary.crsCreated.trend} trendLabel={`${Math.abs(dashboard.summary.crsCreated.trend)}% vs last week`} bgClass="blue" metricKey="crsCreated" />
                        <OrgStat value={dashboard.summary.crsReviewed.value} label="CRs Reviewed" trend={dashboard.summary.crsReviewed.trend} trendLabel={`${Math.abs(dashboard.summary.crsReviewed.trend)}%`} bgClass="green" metricKey="crsReviewed" />
                        <OrgStat value={dashboard.summary.staleCrs.value} label="Stale CRs" trend={dashboard.summary.staleCrs.value <= dashboard.summary.staleCrs.prev ? 1 : -1} trendLabel={`was ${dashboard.summary.staleCrs.prev} last week`} bgClass="red" metricKey="staleCrs" />
                    </div>

                    {/* Alerts */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '28px' }}>
                        <AlertCard icon="🔴" count={dashboard.alerts.staleCrs} label="Stale CRs (>5 days)" color="red" description="Open CRs with no reviewer activity for 5+ days" onClick={() => setShowStaleCrs(true)} />
                    </div>

                    {/* Weekly Trend Chart */}
                    <TrendChart trend={trend} />

                    {/* Year Trend Line Chart */}
                    {yearTrend && yearTrend.some(d => d.hasData) && (
                        <div style={{
                            background: 'rgba(22,22,30,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '16px', padding: '24px 28px', marginBottom: '28px',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    📊 {currentYear} Org Trend — Year to Date
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[
                                        { id: 'crsCreated', label: 'CRs Created', color: '#0a84ff' },
                                        { id: 'crsReviewed', label: 'CRs Reviewed', color: '#30d158' },
                                    ].map(m => (
                                        <button key={m.id} onClick={() => setTrendMetric(m.id)} style={{
                                            padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600,
                                            background: trendMetric === m.id ? `${m.color}20` : 'transparent',
                                            color: trendMetric === m.id ? m.color : 'rgba(255,255,255,0.3)',
                                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                        }}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <YearTrendChart data={yearTrend} metric={trendMetric} />
                        </div>
                    )}

                    {/* View Toggle */}
                    <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px', marginTop: '8px' }}>
                        <button onClick={() => setPageView('visual')} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, background: pageView === 'visual' ? 'rgba(10,132,255,0.2)' : 'transparent', color: pageView === 'visual' ? '#60a5fa' : 'rgba(255,255,255,0.35)', transition: 'all 0.25s' }}>
                            🔥 Visual Dashboard
                        </button>
                        <button onClick={() => setPageView('table')} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, background: pageView === 'table' ? 'rgba(10,132,255,0.2)' : 'transparent', color: pageView === 'table' ? '#60a5fa' : 'rgba(255,255,255,0.35)', transition: 'all 0.25s' }}>
                            📋 Table View
                        </button>
                    </div>

                    {/* Visual Dashboard (Heatmap + Leaderboard) */}
                    {pageView === 'visual' && (
                        <MetricsVisual engineers={dashboard.engineers} onEngineerClick={(alias) => setSelectedEngineer(alias)} />
                    )}

                    {/* Table View (original) */}
                    {pageView === 'table' && (
                    <>
                    {/* Engineer Table */}
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', margin: '28px 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        👩‍💻 Engineers
                        <span style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(255,255,255,0.25)' }}>(click any row for 12-week drill-down)</span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {[
                                        { label: 'Engineer', key: 'name', sortable: true },
                                        { label: 'CRs Created', key: 'crsCreated', sortable: true, metricKey: 'crsCreated' },
                                        { label: 'CRs Reviewed', key: 'crsReviewed', sortable: true, metricKey: 'crsReviewed' },
                                        { label: 'Review Ratio', key: 'reviewRatio', sortable: true, metricKey: 'reviewRatio' },
                                    ].map(h => (
                                        <th key={h.label}
                                            onClick={() => {
                                                if (h.sortable) {
                                                    if (sortCol === h.key) {
                                                        setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
                                                    } else {
                                                        setSortCol(h.key);
                                                        setSortDir(h.key === 'name' ? 'asc' : 'desc');
                                                    }
                                                }
                                            }}
                                            style={{
                                                textAlign: 'left', fontSize: '10px', color: sortCol === h.key ? '#0a84ff' : 'rgba(255,255,255,0.35)',
                                                textTransform: 'uppercase', letterSpacing: '1px', padding: '10px 14px',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600,
                                                cursor: h.sortable ? 'pointer' : 'default', userSelect: 'none',
                                                transition: 'color 0.15s',
                                            }}
                                        >
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                {h.label}
                                                {h.sortable && sortCol === h.key && (
                                                    <span style={{ fontSize: '9px', opacity: 0.8 }}>
                                                        {sortDir === 'desc' ? '▼' : '▲'}
                                                    </span>
                                                )}
                                                {h.metricKey && <MetricInfo metricKey={h.metricKey} />}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...dashboard.engineers].sort((a, b) => {
                                    let aVal = a[sortCol];
                                    let bVal = b[sortCol];
                                    // Handle nulls (review ratio can be null)
                                    if (aVal === null || aVal === undefined) aVal = -Infinity;
                                    if (bVal === null || bVal === undefined) bVal = -Infinity;
                                    // String comparison for name
                                    if (sortCol === 'name') {
                                        aVal = (a.name || a.alias || '').toLowerCase();
                                        bVal = (b.name || b.alias || '').toLowerCase();
                                        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                                    }
                                    return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
                                }).map((eng, idx) => {
                                    const isDeclining = eng.decliningStreak;
                                    const rowBg = isDeclining ? 'rgba(255, 159, 10, 0.04)' : 'transparent';
                                    const rowBorder = isDeclining ? '3px solid #ff9f0a' : '3px solid transparent';
                                    return (
                                    <tr key={eng.alias} onClick={() => setSelectedEngineer(eng.alias)}
                                        style={{ cursor: 'pointer', transition: 'background 0.15s', background: rowBg, borderLeft: rowBorder }}
                                        onMouseEnter={e => e.currentTarget.style.background = isDeclining ? 'rgba(255, 159, 10, 0.07)' : 'rgba(255,255,255,0.03)'}
                                        onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                                        <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                                            <span style={{
                                                width: '36px', height: '36px', borderRadius: '11px', display: 'inline-flex',
                                                alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px',
                                                color: '#fff', marginRight: '12px', verticalAlign: 'middle',
                                                background: getAvatarColor(idx), boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                            }}>
                                                {(eng.name || eng.alias)[0]?.toUpperCase()}
                                            </span>
                                            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{eng.name}</span>
                                            {isDeclining && (
                                                <span style={{
                                                    marginLeft: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 8px',
                                                    borderRadius: '6px', background: 'rgba(255,159,10,0.12)', color: '#ff9f0a',
                                                    border: '1px solid rgba(255,159,10,0.2)', verticalAlign: 'middle',
                                                }}>
                                                    ⚠️ 3w decline
                                                </span>
                                            )}
                                            <br />
                                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginLeft: '48px' }}>{eng.alias} · {eng.team}</span>
                                        </td>
                                        <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                                            <span style={{ fontWeight: 600, color: CrColor(eng.crsCreated) }}>{eng.crsCreated}</span>
                                            <TrendDelta delta={eng.crsCreatedDelta} />
                                            <Sparkline data={sparklines[eng.alias]} />
                                        </td>
                                        <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                                            <span style={{ fontWeight: 600, color: ReviewColor(eng.crsReviewed) }}>{eng.crsReviewed}</span>
                                            <TrendDelta delta={eng.crsReviewedDelta} />
                                        </td>
                                        <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                                            <span style={{
                                                fontWeight: 600,
                                                color: eng.reviewRatio === null ? 'rgba(255,255,255,0.3)'
                                                    : eng.reviewRatio >= 1.5 ? '#30d158'
                                                    : eng.reviewRatio >= 1.0 ? '#ff9f0a'
                                                    : '#ff453a',
                                            }}>
                                                {eng.reviewRatioDisplay || '—'}
                                            </span>
                                            <TrendDelta delta={eng.reviewRatioDelta} suffix="×" />
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    </>
                    )}
                </>
            )}

            {/* Stale CRs Panel */}
            {showStaleCrs && (
                <>
                    <div onClick={() => setShowStaleCrs(false)} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 999, animation: 'fadeIn 0.2s ease-out' }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, width: '560px', height: '100vh', background: 'rgba(12,12,20,0.98)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(255,69,58,0.2)', zIndex: 1000, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', padding: '32px', paddingBottom: '80px', boxShadow: '-16px 0 60px rgba(0,0,0,0.6)', animation: 'slideInRight 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#ff453a', display: 'flex', alignItems: 'center', gap: '8px' }}>🔴 Stale CRs ({dashboard?.alerts?.staleCrDetails?.length || dashboard?.alerts?.staleCrs || 0})</h3>
                            <button onClick={() => setShowStaleCrs(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '10px', padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500 }}>✕ Close</button>
                        </div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
                            Open CRs with no reviewer activity for 5+ days. These represent blocked work.
                        </div>

                        {dashboard?.alerts?.staleCrDetails && dashboard.alerts.staleCrDetails.length > 0 ? (
                            dashboard.alerts.staleCrDetails.map((cr, i) => (
                                <a key={i} href={`https://code.amazon.com/reviews/${cr.crId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '16px 18px', marginBottom: '8px', borderRadius: '12px', background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.12)', textDecoration: 'none', color: '#fff', transition: 'all 0.2s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.06)'; e.currentTarget.style.transform = ''; }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                        <span style={{ color: '#818cf8', fontWeight: 700, fontSize: '13px' }}>{cr.crId}</span>
                                        <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,69,58,0.15)', color: '#ff453a' }}>{cr.ageDays}d stale</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                                        <span>👤 Author: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{cr.alias}</strong></span>
                                        <span>📅 Last touched: {cr.lastTouched}</span>
                                    </div>
                                </a>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)' }}>
                                {dashboard?.alerts?.staleCrs > 0 ? (
                                    <>
                                        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>Stale CR details not yet loaded</div>
                                        <div style={{ fontSize: '12px', marginTop: '6px' }}>Details are fetched in the background. Try refreshing the page.</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>No stale CRs!</div>
                                        <div style={{ fontSize: '12px', marginTop: '6px' }}>All open CRs have reviewer activity within the last 5 days.</div>
                                    </>
                                )}
                            </div>
                        )}

                        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
                            Stale threshold: 5 days · Data from code.amazon.com via builder-mcp
                        </div>
                    </div>
                </>
            )}

            {/* Dive Deep Assistant */}
            <AIChat pageContext="eng-metrics" />

            {/* Engineer Detail Panel */}
            {selectedEngineer && (
                <EngineerPanel alias={selectedEngineer} onClose={() => setSelectedEngineer(null)} />
            )}
        </div>
    );
}
