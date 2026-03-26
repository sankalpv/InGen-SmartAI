'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, RefreshCw, Info, ExternalLink, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, BarChart3, Target } from 'lucide-react';
import AIChat from '@/components/AIChat';

const STATUS_COLORS = {
    'Open': { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
    'In Progress': { bg: 'rgba(168,85,247,0.12)', text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
    'Blocked': { bg: 'rgba(244,63,94,0.12)', text: '#fb7185', border: 'rgba(244,63,94,0.25)' },
    'Under Review': { bg: 'rgba(234,179,8,0.12)', text: '#facc15', border: 'rgba(234,179,8,0.25)' },
    'Closed': { bg: 'rgba(34,197,94,0.12)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    'Resolved': { bg: 'rgba(34,197,94,0.12)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    'Completed': { bg: 'rgba(34,197,94,0.12)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    'Done': { bg: 'rgba(34,197,94,0.12)', text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
    'default': { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.1)' },
};

function getStatusStyle(status) {
    return STATUS_COLORS[status] || STATUS_COLORS['default'];
}

function formatDate(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return '—'; }
}

function isOverdue(ecd) {
    if (!ecd) return false;
    return new Date(ecd) < new Date();
}

export default function SDE3FocusPage() {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [syncMessage, setSyncMessage] = useState('');
    const [expandedCards, setExpandedCards] = useState({});
    const [selectedTask, setSelectedTask] = useState(null);
    const [aiSummary, setAiSummary] = useState('');
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
    const modalRef = useRef(null);

    // Fetch AI summary based on loaded task data
    const fetchAiSummary = useCallback(async (sde3s) => {
        if (!sde3s || sde3s.length === 0) return;
        setAiSummaryLoading(true);
        try {
            const res = await fetch('/api/team?view=sde3-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sde3s }),
            });
            if (res.ok) {
                const result = await res.json();
                setAiSummary(result.summary || '');
            }
        } catch (e) {
            console.error('AI summary failed:', e);
        }
        setAiSummaryLoading(false);
    }, []);

    const fetchData = useCallback(async (force = false) => {
        setIsLoading(true);
        setError(null);
        try {
            const url = force ? '/api/team?view=sde3-focus&refresh=true' : '/api/team?view=sde3-focus';
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch SDE3 focus data');
            const result = await res.json();
            
            if (result.data?.sde3s?.length === 0) {
                setSyncMessage(result.data.message || 'No SDE3 data found. Please sync your org.');
            } else {
                setSyncMessage('');
                // Auto-expand all cards on first load
                const expanded = {};
                (result.data?.sde3s || []).forEach(s => { expanded[s.alias] = true; });
                setExpandedCards(expanded);
                // Trigger AI summary generation in background
                fetchAiSummary(result.data.sde3s);
            }
            
            setData(result.data);
        } catch (e) {
            setError(e.message);
        }
        setIsLoading(false);
    }, []);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/team?view=org-sync');
            if (res.ok) {
                await fetchData(true);
            } else {
                setError('Sync failed');
            }
        } catch (e) {
            setError(e.message);
        }
        setIsSyncing(false);
    };

    useEffect(() => { fetchData(); }, [fetchData]);

    // Close modal on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (modalRef.current && !modalRef.current.contains(event.target)) {
                setSelectedTask(null);
            }
        };
        if (selectedTask) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedTask]);

    const toggleCard = (alias) => {
        setExpandedCards(prev => ({ ...prev, [alias]: !prev[alias] }));
    };

    // Compute summary stats
    const sde3s = data?.sde3s || [];
    const totalTasks = sde3s.reduce((sum, s) => sum + s.tasks.length, 0);
    const statusCounts = {};
    sde3s.forEach(s => s.tasks.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    }));

    // Calculate P50 (median) and P99 workload
    const taskCounts = sde3s.map(s => s.tasks.length).sort((a, b) => a - b);
    const p50Workload = taskCounts.length > 0
        ? (taskCounts.length % 2 === 0
            ? (taskCounts[taskCounts.length / 2 - 1] + taskCounts[taskCounts.length / 2]) / 2
            : taskCounts[Math.floor(taskCounts.length / 2)])
        : 0;

    const p99Workload = taskCounts.length > 0
        ? (() => {
            const pos = 0.99 * (taskCounts.length - 1);
            const base = Math.floor(pos);
            const rest = pos - base;
            if (taskCounts[base + 1] !== undefined) {
                return taskCounts[base] + rest * (taskCounts[base + 1] - taskCounts[base]);
            }
            return taskCounts[base];
        })()
        : 0;

    // Sort SDE3s by task count (busiest first)
    const sortedSDE3s = [...sde3s].sort((a, b) => b.tasks.length - a.tasks.length);
    const maxTasks = sortedSDE3s.length > 0 ? sortedSDE3s[0].tasks.length : 1;

    if (isLoading && !data) {
        return (
            <div className="dark-inline-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div className="spinner" />
                <p style={{ marginTop: '20px', color: 'rgba(255,255,255,0.5)' }}>Loading SDE3 workload data...</p>
                <style>{`.spinner { width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div className="dark-inline-page" style={{ position: 'relative' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                        <Users size={28} color="#6366f1" /> SDE3 Focus View
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '15px' }}>
                        Senior engineering workload and project ownership at a glance.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleSync} disabled={isSyncing} style={{
                        background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                        cursor: isSyncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <RefreshCw size={14} className={isSyncing ? 'spin' : ''} /> {isSyncing ? 'Syncing...' : 'Sync Org'}
                    </button>
                    <button onClick={() => fetchData(true)} style={{
                        background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', border: 'none',
                        borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                        cursor: 'pointer', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                    }}>
                        Refresh Data
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ background: 'rgba(244,63,94,0.1)', color: '#fb7185', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
                    {error}
                </div>
            )}

            {syncMessage && (
                <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'center' }}>
                    <Info size={24} color="#6366f1" style={{ marginBottom: '12px' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Incomplete Metadata</h3>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '16px' }}>{syncMessage}</p>
                    <button onClick={handleSync} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', fontWeight: 600, cursor: 'pointer' }}>
                        Run Org Sync Now
                    </button>
                </div>
            )}

            {/* Summary Stats */}
            {!syncMessage && data && (
                <>
                    {/* AI Summary */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.06))',
                        border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: '16px', padding: '20px 24px', marginBottom: '20px',
                        display: 'flex', alignItems: 'flex-start', gap: '14px',
                        minHeight: '60px', transition: 'all 0.3s ease'
                    }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, fontSize: '16px'
                        }}>
                            ✦
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(165,180,252,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                                AI Team Summary
                            </div>
                            {aiSummaryLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div className="shimmer" style={{ height: '14px', width: '90%', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }} />
                                    <div className="shimmer" style={{ height: '14px', width: '70%', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }} />
                                </div>
                            ) : (
                                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(255,255,255,0.75)' }}>
                                    {aiSummary ? aiSummary.split('\n').filter(l => l.trim()).map((line, i) => {
                                        const cleanLine = line.replace(/^[-*•]\s*/, '').trim(); // Remove bullets
                                        const parts = cleanLine.split('**');
                                        if (parts.length >= 3) {
                                            return <div key={i} style={{ marginBottom: '6px', display: 'flex', gap: '8px' }}>
                                                <span style={{ color: '#a5b4fc' }}>●</span>
                                                <div><strong style={{ color: '#fff' }}>{parts[1]}</strong>{parts.slice(2).join('')}</div>
                                            </div>;
                                        }
                                        return <div key={i} style={{ marginBottom: '6px', display: 'flex', gap: '8px' }}>
                                            <span style={{ color: '#a5b4fc' }}>●</span>
                                            <div>{cleanLine}</div>
                                        </div>;
                                    }) : 'Summary will appear once AI analysis completes.'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
                        <div style={{ background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <Users size={18} color="#6366f1" />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Senior Engineers</span>
                            </div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff' }}>{sde3s.length}</div>
                        </div>
                        <div style={{ background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <Target size={18} color="#a855f7" />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Tasks</span>
                            </div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff' }}>{totalTasks}</div>
                        </div>
                        <div style={{ background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <BarChart3 size={18} color="#22c55e" />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Load</span>
                            </div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff' }}>{sde3s.length > 0 ? (totalTasks / sde3s.length).toFixed(1) : 0}</div>
                        </div>
                        <div style={{ background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <Clock size={18} color="#eab308" />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>P50 Load</span>
                            </div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff' }}>{p50Workload.toFixed(1)}</div>
                        </div>
                        <div style={{ background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <AlertTriangle size={18} color="#f43f5e" />
                                <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>P99 Load</span>
                            </div>
                            <div style={{ fontSize: '30px', fontWeight: 800, color: '#fff' }}>{p99Workload.toFixed(1)}</div>
                        </div>
                    </div>

                    {/* Capacity Heatmap */}
                    <div style={{ background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)', padding: '20px', marginBottom: '28px' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>
                            Workload Distribution
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {sortedSDE3s.map(s => {
                                const pct = maxTasks > 0 ? (s.tasks.length / maxTasks) * 100 : 0;
                                const barColor = pct > 80 ? '#f43f5e' : pct > 50 ? '#eab308' : '#6366f1';
                                return (
                                    <div key={s.alias} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '120px', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {s.name?.split(',')[0] || s.alias}
                                        </div>
                                        <div style={{ flex: 1, height: '22px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                                            <div style={{
                                                height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
                                                borderRadius: '6px', transition: 'width 0.5s ease', minWidth: s.tasks.length > 0 ? '20px' : '0'
                                            }} />
                                        </div>
                                        <div style={{ width: '40px', fontSize: '13px', fontWeight: 700, color: barColor, textAlign: 'right' }}>
                                            {s.tasks.length}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Per-SDE3 Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {sortedSDE3s.map(s => {
                            const isExpanded = expandedCards[s.alias];
                            const taskOverdue = s.tasks.filter(t => isOverdue(t.ecd)).length;
                            return (
                                <div key={s.alias} style={{
                                    background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)',
                                    overflow: 'hidden', transition: 'border-color 0.2s',
                                }}>
                                    {/* Card Header */}
                                    <div 
                                        onClick={() => toggleCard(s.alias)}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '18px 24px', cursor: 'pointer', userSelect: 'none'
                                        }}
                                        className="card-header"
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            {isExpanded ? <ChevronDown size={16} color="rgba(255,255,255,0.3)" /> : <ChevronRight size={16} color="rgba(255,255,255,0.3)" />}
                                            <div>
                                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{s.name}</div>
                                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                                                    @{s.alias} · L{s.level || 6} SDE
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {taskOverdue > 0 && (
                                                <span style={{ fontSize: '11px', fontWeight: 700, background: 'rgba(244,63,94,0.12)', color: '#fb7185', padding: '4px 10px', borderRadius: '20px' }}>
                                                    {taskOverdue} overdue
                                                </span>
                                            )}
                                            {/* Status mini-pills */}
                                            {Object.entries(
                                                s.tasks.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {})
                                            ).map(([status, count]) => {
                                                const style = getStatusStyle(status);
                                                return (
                                                    <span key={status} style={{ fontSize: '11px', fontWeight: 700, background: style.bg, color: style.text, padding: '4px 10px', borderRadius: '20px' }}>
                                                        {count} {status}
                                                    </span>
                                                );
                                            })}
                                            <span style={{ fontSize: '14px', fontWeight: 800, color: 'rgba(255,255,255,0.5)', minWidth: '30px', textAlign: 'right' }}>
                                                {s.tasks.length}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Performance Scorecard & Task Table */}
                                    {isExpanded && (
                                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                            
                                            {/* SDE3 Performance Scorecard */}
                                            {/* SDE3 Performance Scorecard */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '32px', padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.2)' }}>
                                                
                                                {/* Pillar 1: Deliverables */}
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <h4 style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px', fontWeight: 700 }}>1. Deliverables Matrix</h4>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                                        {s.topDeliverables?.length > 0 ? s.topDeliverables.map(d => (
                                                            <div key={d.id} style={{ fontSize: '12px', color: '#fff', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{d.title}</div>
                                                                <div style={{ fontSize: '10px', fontWeight: 700, color: '#a5b4fc', background: 'rgba(99,102,241,0.15)', padding: '2px 8px', borderRadius: '12px', whiteSpace: 'nowrap' }}>{d.taskCount} tasks</div>
                                                            </div>
                                                        )) : (
                                                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', padding: '10px' }}>No strategic deliverables found</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Pillar 2: Team Output & On-call Performance */}
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <h4 style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '16px', fontWeight: 700 }}>2. Team Output & On-call Performance</h4>
                                                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
                                                        
                                                        {/* Code Metrics Column */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderRight: '1px solid rgba(255,255,255,0.06)', paddingRight: '20px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>PRs Authored</span>
                                                                <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{s.codeMetrics?.crsCreated || 0}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>PRs Reviewed</span>
                                                                <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{s.codeMetrics?.crsReviewed || 0}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                                                <span style={{ fontSize: '11px', color: 'rgba(168, 85, 247, 0.8)', fontWeight: 800, textTransform: 'uppercase' }}>Review Ratio</span>
                                                                <span style={{ fontSize: '16px', fontWeight: 800, color: '#a855f7' }}>{s.codeMetrics?.reviewRatioDisplay || '0.0'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Ticketing Column */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Resolved Tickets</span>
                                                                <span style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{s.ticketing?.total || 0}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, marginTop: '-8px' }}>
                                                                <span>S2: {s.ticketing?.sev2 || 0} | S3: {s.ticketing?.sev3 || 0}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontSize: '11px', color: 'rgba(74, 222, 128, 0.8)', fontWeight: 800, textTransform: 'uppercase' }}>On-call MTTR</span>
                                                                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#4ade80' }}>{s.ticketing?.mttrHours || '0.0'}h</span>
                                                                </div>
                                                                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textAlign: 'right', fontStyle: 'italic' }}>
                                                                    Based on {s.ticketing?.oncallCount || 0} on-call resolutions
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Task Table */}
                                            {s.tasks.length > 0 ? (
                                                <div style={{ background: 'rgba(255,255,255,0.01)' }}>
                                                    {/* Table Header */}
                                                    <div style={{
                                                        display: 'grid', gridTemplateColumns: 'minmax(80px, 0.8fr) minmax(200px, 2.5fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(100px, 1.1fr) minmax(100px, 1.1fr) minmax(150px, 1.5fr) 40px',
                                                        padding: '12px 24px', fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.3)',
                                                        textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid rgba(255,255,255,0.06)'
                                                    }}>
                                                        <div>Task ID</div>
                                                        <div>Title</div>
                                                        <div>Priority</div>
                                                        <div>Status</div>
                                                        <div>Need By</div>
                                                        <div>ECD</div>
                                                        <div>Deliverable</div>
                                                        <div></div>
                                                    </div>
                                                    {/* Task Rows */}
                                                    {s.tasks.map(t => {
                                                        const statusStyle = getStatusStyle(t.status);
                                                        const overdue = isOverdue(t.ecd);
                                                        return (
                                                            <div
                                                                key={t.id}
                                                                className="task-row"
                                                                onClick={() => setSelectedTask({ ...t, assignee: s.name, alias: s.alias })}
                                                                style={{
                                                                    display: 'grid', gridTemplateColumns: 'minmax(80px, 0.8fr) minmax(200px, 2.5fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(100px, 1.1fr) minmax(100px, 1.1fr) minmax(150px, 1.5fr) 40px',
                                                                    padding: '12px 24px', fontSize: '13px', cursor: 'pointer',
                                                                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                                                                    alignItems: 'center', transition: 'background 0.15s',
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: 700, color: '#a5b4fc', fontSize: '12px' }}>{t.id}</div>
                                                                <div style={{ color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '12px' }}>
                                                                    {t.title}
                                                                </div>
                                                                <div style={{ fontSize: '11px', fontWeight: 700, color: t.priority === 'High' || t.priority === 'Critical' ? '#fb7185' : 'rgba(255,255,255,0.45)' }}>
                                                                    {t.priority}
                                                                </div>
                                                                <div>
                                                                    <span style={{
                                                                        fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                                        background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.border}`
                                                                    }}>
                                                                        {t.status}
                                                                    </span>
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                                                                    {formatDate(t.needBy)}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: overdue ? '#fb7185' : 'rgba(255,255,255,0.45)', fontWeight: overdue ? 700 : 400 }}>
                                                                    {overdue && <AlertTriangle size={11} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
                                                                    {formatDate(t.ecd)}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {t.parentGoalTitle || '—'}
                                                                </div>
                                                                <div>
                                                                    <ExternalLink size={12} color="rgba(255,255,255,0.15)" />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ padding: '30px 24px', color: 'rgba(255,255,255,0.3)', fontSize: '13px', fontStyle: 'italic', textAlign: 'center' }}>
                                                    No active or completed tasks assigned for the current year.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Timestamp */}
                    {data?.timestamp && (
                        <div style={{ marginTop: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'right' }}>
                            Last updated: {new Date(data.timestamp).toLocaleString()}
                        </div>
                    )}
                </>
            )}

            {/* Task Detail Modal */}
            {selectedTask && (
                <div style={{
                    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.7)', zIndex: 1000, backdropFilter: 'blur(4px)'
                }}>
                    <div ref={modalRef} style={{
                        width: '480px', background: '#1c1c24', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)',
                        padding: '32px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', position: 'relative'
                    }}>
                        <button onClick={() => setSelectedTask(null)} style={{
                            position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.05)', border: 'none',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', width: '28px', height: '28px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                        }}>
                            ✕
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                            <div style={{ padding: '6px 10px', background: 'rgba(99,102,241,0.1)', color: '#a5b4fc', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>
                                {selectedTask.id}
                            </div>
                            <div style={{
                                fontSize: '12px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px',
                                ...(() => { const s = getStatusStyle(selectedTask.status); return { background: s.bg, color: s.text }; })()
                            }}>
                                {selectedTask.status?.toUpperCase()}
                            </div>
                        </div>

                        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', lineHeight: 1.4 }}>
                            {selectedTask.title}
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase' }}>Assignee</div>
                                <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedTask.assignee}</div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>@{selectedTask.alias}</div>
                            </div>
                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase' }}>Target Date</div>
                                <div style={{ fontSize: '14px', fontWeight: 600, color: isOverdue(selectedTask.ecd) ? '#fb7185' : '#fff' }}>
                                    {formatDate(selectedTask.ecd)}
                                </div>
                                {isOverdue(selectedTask.ecd) && (
                                    <div style={{ fontSize: '10px', color: '#fb7185', marginTop: '4px', fontWeight: 700 }}>⚠ OVERDUE</div>
                                )}
                            </div>
                        </div>

                        <div style={{ background: 'rgba(99,102,241,0.05)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.1)', marginBottom: '24px' }}>
                            <div style={{ fontSize: '11px', color: 'rgba(99,102,241,0.6)', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>Parent Room</div>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>{selectedTask.parentGoalTitle || '—'}</div>
                        </div>

                        {selectedTask.id && selectedTask.id !== 'Unknown' ? (
                            <a
                                href={`https://taskei.amazon.dev/tasks/${selectedTask.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                    width: '100%', background: '#6366f1', color: '#fff', border: 'none',
                                    borderRadius: '12px', padding: '14px', fontSize: '14px', fontWeight: 700,
                                    textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                                }}
                                className="modal-btn"
                            >
                                Open in Taskei <ExternalLink size={16} />
                            </a>
                        ) : (
                            <div style={{
                                width: '100%', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.3)',
                                borderRadius: '12px', padding: '14px', fontSize: '14px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)'
                            }}>
                                Direct Link Unavailable
                            </div>
                        )}
                    </div>
                </div>
            )}

            <AIChat pageContext="sde3-focus" />

            <style>{`
                .dark-inline-page::-webkit-scrollbar { width: 8px; height: 8px; }
                .dark-inline-page::-webkit-scrollbar-track { background: transparent; }
                .dark-inline-page::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
                .dark-inline-page::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
                .card-header:hover { background: rgba(255,255,255,0.02); }
                .task-row:hover { background: rgba(99,102,241,0.05) !important; }
                .modal-btn:hover { transform: translateY(-2px); background: #4f46e5 !important; }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .shimmer { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%) !important; background-size: 200% 100%; animation: shimmer 1.5s infinite; }
                @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
            `}</style>
        </div>
    );
}
