'use client';

import { useState, useEffect, useCallback } from 'react';

const GRADS = ['linear-gradient(135deg,#4f8cff,#3b6fd4)','linear-gradient(135deg,#a855f7,#7c3aed)','linear-gradient(135deg,#34d399,#059669)','linear-gradient(135deg,#fb923c,#ea580c)','linear-gradient(135deg,#22d3ee,#0891b2)','linear-gradient(135deg,#f472b6,#db2777)','linear-gradient(135deg,#fbbf24,#d97706)','linear-gradient(135deg,#818cf8,#6366f1)','linear-gradient(135deg,#ef4444,#b91c1c)','linear-gradient(135deg,#14b8a6,#0d9488)'];

function getHeatColor(val, max) {
    if (val === 0) return 'rgba(255,255,255,0.03)';
    const pct = Math.min(val / Math.max(max, 1), 1);
    if (pct < 0.25) return 'rgba(48,209,88,0.15)';
    if (pct < 0.5) return 'rgba(48,209,88,0.35)';
    if (pct < 0.75) return 'rgba(48,209,88,0.6)';
    return 'rgba(48,209,88,0.9)';
}

function HeatmapTooltip({ data, position }) {
    if (!data) return null;
    return (
        <div style={{ position: 'fixed', left: position.x + 16, top: position.y - 10, background: 'rgba(15,15,25,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', fontSize: '12px', color: '#e2e8f0', pointerEvents: 'none', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxWidth: '220px' }}>
            <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: '4px' }}>{data.name}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginBottom: '6px' }}>{data.alias} · {data.week}</div>
            <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#0a84ff' }}>{data.created}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Created</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#30d158' }}>{data.reviewed}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>Reviewed</div>
                </div>
            </div>
        </div>
    );
}

function Heatmap({ heatmapData, metric, onMetricChange, onEngineerClick }) {
    const [tooltip, setTooltip] = useState(null);
    const [tipPos, setTipPos] = useState({ x: 0, y: 0 });

    if (!heatmapData || !heatmapData.engineers || heatmapData.engineers.length === 0) {
        return <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '40px' }}>No heatmap data. Backfill weekly data first.</div>;
    }

    const weeks = heatmapData.weekIds?.map(w => w.split('-')[1]) || [];
    const engineers = heatmapData.engineers;

    // Find max for color scaling
    let maxVal = 0;
    engineers.forEach(e => e.weeks.forEach(w => {
        const v = metric === 'created' ? w.crsCreated : metric === 'reviewed' ? w.crsReviewed : w.crsCreated + w.crsReviewed;
        if (v > maxVal) maxVal = v;
    }));

    // Sort by current week metric
    const sorted = [...engineers].sort((a, b) => {
        const wa = a.weeks[a.weeks.length - 1] || {};
        const wb = b.weeks[b.weeks.length - 1] || {};
        const va = metric === 'created' ? (wa.crsCreated || 0) : metric === 'reviewed' ? (wa.crsReviewed || 0) : (wa.crsCreated || 0) + (wa.crsReviewed || 0);
        const vb = metric === 'created' ? (wb.crsCreated || 0) : metric === 'reviewed' ? (wb.crsReviewed || 0) : (wb.crsCreated || 0) + (wb.crsReviewed || 0);
        return vb - va;
    });

    return (
        <div>
            <style>{`
                @keyframes cellPop{from{opacity:0;transform:scale(0)}to{opacity:1;transform:scale(1)}}
            `}</style>
            {/* Metric toggle */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', marginLeft: '120px' }}>
                {[{ id: 'created', l: 'CRs Created', c: '#0a84ff' }, { id: 'reviewed', l: 'CRs Reviewed', c: '#30d158' }, { id: 'total', l: 'Total', c: '#a78bfa' }].map(m => (
                    <button key={m.id} onClick={() => onMetricChange(m.id)} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: metric === m.id ? `${m.c}20` : 'transparent', color: metric === m.id ? m.c : 'rgba(255,255,255,0.3)', transition: 'all 0.2s' }}>{m.l}</button>
                ))}
            </div>

            {/* Week labels */}
            <div style={{ display: 'flex', marginLeft: '120px', marginBottom: '4px' }}>
                {weeks.map(w => <div key={w} style={{ width: '16px', textAlign: 'center', fontSize: '8px', color: 'rgba(255,255,255,0.15)' }}>{w.replace('W', '')}</div>)}
            </div>

            {/* Rows */}
            <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
                {sorted.map((e, ei) => {
                    const vals = e.weeks.map(w => metric === 'created' ? w.crsCreated : metric === 'reviewed' ? w.crsReviewed : w.crsCreated + w.crsReviewed);
                    const sparkMax = Math.max(...vals, 1);
                    return (
                        <div key={e.alias} style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '2px' }}>
                            <div onClick={() => onEngineerClick?.(e.alias)} style={{ width: '120px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', textAlign: 'right', paddingRight: '10px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'color 0.2s' }}
                                onMouseEnter={ev => ev.currentTarget.style.color = '#60a5fa'}
                                onMouseLeave={ev => ev.currentTarget.style.color = 'rgba(255,255,255,0.5)'}>
                                {e.name}
                            </div>
                            {e.weeks.map((w, wi) => {
                                const v = metric === 'created' ? w.crsCreated : metric === 'reviewed' ? w.crsReviewed : w.crsCreated + w.crsReviewed;
                                return (
                                    <div key={wi} style={{ width: '14px', height: '14px', borderRadius: '3px', margin: '1px', background: getHeatColor(v, maxVal), transition: 'all 0.2s', cursor: 'pointer', animation: `cellPop 0.15s ${(ei * weeks.length + wi) * 0.005}s both` }}
                                        onMouseEnter={ev => { setTooltip({ name: e.name, alias: e.alias, week: w.weekLabel || weeks[wi], created: w.crsCreated, reviewed: w.crsReviewed }); setTipPos({ x: ev.clientX, y: ev.clientY }); }}
                                        onMouseMove={ev => setTipPos({ x: ev.clientX, y: ev.clientY })}
                                        onMouseLeave={() => setTooltip(null)}
                                    />
                                );
                            })}
                            {/* Mini sparkline */}
                            <div style={{ display: 'flex', gap: '1px', alignItems: 'flex-end', height: '14px', marginLeft: '8px' }}>
                                {vals.map((v, si) => (
                                    <div key={si} style={{ width: '3px', height: `${Math.max(2, (v / sparkMax) * 14)}px`, borderRadius: '1px', background: si === vals.length - 1 ? 'rgba(48,209,88,0.7)' : 'rgba(10,132,255,0.4)' }} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', marginLeft: '120px', fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>
                <span>Less</span>
                {['rgba(255,255,255,0.03)', 'rgba(48,209,88,0.15)', 'rgba(48,209,88,0.35)', 'rgba(48,209,88,0.6)', 'rgba(48,209,88,0.9)'].map((c, i) => (
                    <div key={i} style={{ width: '12px', height: '12px', borderRadius: '2px', background: c }} />
                ))}
                <span>More</span>
            </div>

            <HeatmapTooltip data={tooltip} position={tipPos} />
        </div>
    );
}

function Leaderboard({ engineers, onEngineerClick }) {
    if (!engineers || engineers.length === 0) return null;

    const maxCreated = Math.max(...engineers.map(e => e.crsCreated || 0), 1);
    const maxReviewed = Math.max(...engineers.map(e => e.crsReviewed || 0), 1);
    const maxTotal = Math.max(maxCreated, maxReviewed);

    const sorted = [...engineers].sort((a, b) => (b.crsCreated || 0) - (a.crsCreated || 0));

    return (
        <div>
            <style>{`
                @keyframes springIn{0%{opacity:0;transform:translateY(15px) scale(0.98)}70%{transform:translateY(-2px) scale(1.003)}100%{opacity:1;transform:translateY(0) scale(1)}}
            `}</style>
            {sorted.map((e, i) => {
                const ratio = e.crsCreated > 0 ? (e.crsReviewed / e.crsCreated).toFixed(1) : '∞';
                const ratioColor = parseFloat(ratio) >= 1.5 ? '#30d158' : parseFloat(ratio) >= 1.0 ? '#ff9f0a' : '#ff453a';
                const delta = e.crsCreatedDelta;
                const deltaColor = delta > 0 ? '#30d158' : delta < 0 ? '#ff453a' : 'rgba(255,255,255,0.25)';
                const grad = GRADS[e.alias?.charCodeAt(0) % GRADS.length];
                const init = (e.name || e.alias || '?')[0].toUpperCase();
                const rankClass = i === 0 ? 'background:linear-gradient(135deg,#fbbf24,#d97706);color:#000' : i === 1 ? 'background:linear-gradient(135deg,#94a3b8,#64748b);color:#000' : i === 2 ? 'background:linear-gradient(135deg,#cd7f32,#8b5e3c);color:#fff' : 'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.3)';
                const createdW = Math.max(8, ((e.crsCreated || 0) / maxTotal) * 100);
                const reviewedW = Math.max(8, ((e.crsReviewed || 0) / maxTotal) * 100);

                return (
                    <div key={e.alias} onClick={() => onEngineerClick?.(e.alias)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '14px', marginBottom: '6px', background: e.decliningStreak ? 'rgba(255,159,10,0.04)' : 'rgba(22,22,30,0.6)', border: e.decliningStreak ? '1px solid rgba(255,159,10,0.15)' : '1px solid rgba(255,255,255,0.04)', borderLeft: e.decliningStreak ? '3px solid #ff9f0a' : undefined, cursor: 'pointer', transition: 'all 0.25s', animation: `springIn 0.5s ${i * 0.06}s both` }}
                        onMouseEnter={ev => { ev.currentTarget.style.background = e.decliningStreak ? 'rgba(255,159,10,0.07)' : 'rgba(255,255,255,0.03)'; ev.currentTarget.style.transform = 'translateX(4px)'; }}
                        onMouseLeave={ev => { ev.currentTarget.style.background = e.decliningStreak ? 'rgba(255,159,10,0.04)' : 'rgba(22,22,30,0.6)'; ev.currentTarget.style.transform = ''; }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px', flexShrink: 0, ...Object.fromEntries(rankClass.split(';').map(s => s.split(':').map(p => p.trim()))) }}>{i + 1}</div>
                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: grad, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px', color: '#fff', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>{init}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                                {e.name}
                                {e.decliningStreak && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,159,10,0.12)', color: '#ff9f0a' }}>⚠️ 3w decline</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '1px' }}>{e.alias} · {e.team}</div>
                        </div>
                        {/* Dual bars */}
                        <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ height: '20px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', flex: 1, overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '4px', width: `${createdW}%`, background: 'linear-gradient(90deg,rgba(10,132,255,0.7),rgba(10,132,255,0.35))', display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '10px', fontWeight: 700, color: '#fff', transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }}>{e.crsCreated}</div>
                            </div>
                            <div style={{ height: '20px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', flex: 1, overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '4px', width: `${reviewedW}%`, background: 'linear-gradient(90deg,rgba(48,209,88,0.7),rgba(48,209,88,0.35))', display: 'flex', alignItems: 'center', paddingLeft: '8px', fontSize: '10px', fontWeight: 700, color: '#fff', transition: 'width 1s cubic-bezier(0.4,0,0.2,1)' }}>{e.crsReviewed}</div>
                            </div>
                        </div>
                        <div style={{ width: '50px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: ratioColor, flexShrink: 0 }}>{e.reviewRatioDisplay || `${ratio}×`}</div>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: deltaColor, width: '40px', textAlign: 'center', flexShrink: 0 }}>{delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : '—'}</span>
                    </div>
                );
            })}
            <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(10,132,255,0.6)', verticalAlign: 'middle', marginRight: '4px' }} />CRs Created</span>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(48,209,88,0.5)', verticalAlign: 'middle', marginRight: '4px' }} />CRs Reviewed</span>
            </div>
        </div>
    );
}

export default function MetricsVisual({ engineers, onEngineerClick }) {
    const [view, setView] = useState('heatmap');
    const [heatMetric, setHeatMetric] = useState('created');
    const [heatmapData, setHeatmapData] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchHeatmap = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/eng-metrics?view=heatmap&weeks=12');
            const json = await res.json();
            setHeatmapData(json.data);
        } catch (e) { console.error('Failed to fetch heatmap:', e); }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (view === 'heatmap' || view === 'both') fetchHeatmap();
    }, [view, fetchHeatmap]);

    const views = [{ id: 'heatmap', l: '🔥 Heatmap' }, { id: 'leaderboard', l: '🏆 Leaderboard' }, { id: 'both', l: '📊 Combined' }];

    return (
        <div>
            {/* View Switcher */}
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                {views.map(v => (
                    <button key={v.id} onClick={() => setView(v.id)} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, background: view === v.id ? 'rgba(10,132,255,0.2)' : 'transparent', color: view === v.id ? '#60a5fa' : 'rgba(255,255,255,0.35)', transition: 'all 0.25s' }}>{v.l}</button>
                ))}
            </div>

            {/* Heatmap */}
            {(view === 'heatmap' || view === 'both') && (
                <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔥 Activity Heatmap
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>hover for details · click name for drill-down</span>
                    </div>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.4)' }}>
                            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                            Loading heatmap data...
                        </div>
                    ) : (
                        <Heatmap heatmapData={heatmapData} metric={heatMetric} onMetricChange={setHeatMetric} onEngineerClick={onEngineerClick} />
                    )}
                </div>
            )}

            {/* Leaderboard */}
            {(view === 'leaderboard' || view === 'both') && engineers && engineers.length > 0 && (
                <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏆 Engineer Leaderboard
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>click any row for 12-week drill-down</span>
                    </div>
                    <Leaderboard engineers={engineers} onEngineerClick={onEngineerClick} />
                </div>
            )}
        </div>
    );
}