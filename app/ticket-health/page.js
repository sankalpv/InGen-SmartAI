'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, ExternalLink, ChevronRight, Send, Check, Loader2 } from 'lucide-react';
import AIChat from '@/components/AIChat';

const STATUS_COLORS = {
    'Assigned': { bg: 'rgba(10,132,255,0.12)', color: '#0a84ff', border: 'rgba(10,132,255,0.25)' },
    'Work In Progress': { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.25)' },
    'Pending': { bg: 'rgba(255,159,10,0.12)', color: '#ff9f0a', border: 'rgba(255,159,10,0.25)' },
    'Researching': { bg: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: 'rgba(34,211,238,0.25)' },
};

const AGE_COLORS = {
    critical: { bg: 'rgba(255,69,58,0.1)', color: '#ff453a', border: 'rgba(255,69,58,0.2)' },
    warning: { bg: 'rgba(255,159,10,0.1)', color: '#ff9f0a', border: 'rgba(255,159,10,0.2)' },
    attention: { bg: 'rgba(255,214,10,0.1)', color: '#ffd60a', border: 'rgba(255,214,10,0.2)' },
    ok: { bg: 'rgba(48,209,88,0.1)', color: '#30d158', border: 'rgba(48,209,88,0.2)' },
};

const ROLE_STYLES = {
    'Primary Owner': { bg: 'rgba(255,69,58,0.1)', color: '#ff453a', border: 'rgba(255,69,58,0.2)' },
    'Secondary Owner': { bg: 'rgba(255,159,10,0.1)', color: '#ff9f0a', border: 'rgba(255,159,10,0.2)' },
    'Member': { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.1)' },
};

function formatAge(days) {
    if (days >= 30) return `${Math.floor(days / 30)}mo ${days % 30}d`;
    return `${days}d`;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ticketUrl(id) {
    return `https://t.corp.amazon.com/${id}`;
}

function openCountColor(count) {
    if (count === 0) return '#30d158';
    if (count >= 10) return '#ff453a';
    if (count >= 5) return '#ff9f0a';
    return 'rgba(255,255,255,0.8)';
}

function StatusPill({ status }) {
    const s = STATUS_COLORS[status] || { bg: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: 'rgba(255,255,255,0.1)' };
    return (
        <span style={{
            padding: '3px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
            background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
        }}>
            {status}
        </span>
    );
}

function AgeBadge({ days, bucket }) {
    const s = AGE_COLORS[bucket] || AGE_COLORS.ok;
    return (
        <span style={{
            padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
            background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontVariantNumeric: 'tabular-nums',
        }}>
            {formatAge(days)}
        </span>
    );
}

function StatCard({ value, label, icon, color, bgColor, borderColor, onClick }) {
    return (
        <div style={{
            borderRadius: '16px', padding: '20px 24px', minWidth: '130px', textAlign: 'center',
            background: bgColor, border: `1px solid ${borderColor}`,
            transition: 'transform 0.2s, box-shadow 0.2s', cursor: onClick ? 'pointer' : 'default',
        }}
            onClick={onClick}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.3)${onClick ? ', 0 0 0 2px ' + color + '40' : ''}`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
        >
            <div style={{ fontSize: '14px', marginBottom: '8px' }}>{icon}</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color, letterSpacing: '-1px', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '8px', fontWeight: 600 }}>{label}</div>
            {onClick && <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.2)', marginTop: '6px' }}>Click for details →</div>}
        </div>
    );
}

function TicketListPanel({ title, icon, color, tickets, resolvedTickets, groups, onClose }) {
    const items = tickets || [];
    const resolved = resolvedTickets || [];
    const showResolved = resolved.length > 0 && items.length === 0;
    const displayItems = showResolved ? resolved : items;

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.5)', zIndex: 999, animation: 'fadeIn 0.2s ease-out',
            }} />
            <div className="slide-panel" style={{
                position: 'fixed', top: 0, right: 0, width: '680px', height: '100vh',
                background: 'rgba(12,12,20,0.98)', backdropFilter: 'blur(24px)',
                borderLeft: `2px solid ${color}40`, zIndex: 1000, overflowY: 'auto',
                padding: '32px', boxShadow: '-16px 0 60px rgba(0,0,0,0.6)',
                animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color }}>
                        {icon} {title} ({displayItems.length})
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
                        borderRadius: '10px', padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                    }}>
                        ✕ Close
                    </button>
                </div>

                {/* Group breakdown summary if applicable */}
                {groups && groups.length > 0 && (
                    <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '8px' }}>By Resolver Group</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {groups.map((g, i) => (
                                <span key={i} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '8px', background: `${color}12`, color, border: `1px solid ${color}25`, fontWeight: 600 }}>
                                    {g.name}: {g.count}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {displayItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                        <div style={{ fontSize: '15px', fontWeight: 600 }}>No tickets in this category!</div>
                    </div>
                ) : (
                    <div>
                        {displayItems.map((t) => (
                            <TicketRow key={t.id} ticket={t} />
                        ))}
                    </div>
                )}

                <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
                    Data fetched live from ticketing API via builder-mcp
                </div>
            </div>
        </>
    );
}

function BaselineBadge({ status }) {
    if (status === 'UP_TO_DATE') {
        return <span style={{ fontSize: '11px', color: '#30d158', fontWeight: 600 }}>✅ Current</span>;
    }
    const label = status?.replace('DUE_', '').replace('_', ' ') || 'Unknown';
    return (
        <span style={{
            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
            background: 'rgba(255,69,58,0.1)', color: '#ff453a', border: '1px solid rgba(255,69,58,0.15)',
        }}>
            ⚠️ {label}
        </span>
    );
}

function TicketRow({ ticket }) {
    return (
        <a href={ticketUrl(ticket.id)} target="_blank" rel="noopener noreferrer"
            style={{
                display: 'block', padding: '14px 16px', marginBottom: '6px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                textDecoration: 'none', color: '#fff', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(10,132,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', lineHeight: '1.4' }}>
                        {ticket.title}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <StatusPill status={ticket.status} />
                        <AgeBadge days={ticket.age} bucket={ticket.ageBucket} />
                        {ticket.group && (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '6px' }}>
                                {ticket.group}
                            </span>
                        )}
                        {ticket.assignee && (
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                                👤 {ticket.assignee}
                            </span>
                        )}
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                            Created {formatDate(ticket.createDate)}
                        </span>
                    </div>
                </div>
                <ExternalLink size={14} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: '2px' }} />
            </div>
        </a>
    );
}

function GroupPanel({ groupName, onClose, allTickets }) {
    const tickets = (allTickets || []).filter(t => t.group === groupName);

    return (
        <>
            <div onClick={onClose} style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.5)', zIndex: 999, animation: 'fadeIn 0.2s ease-out',
            }} />
            <div style={{
                position: 'fixed', top: 0, right: 0, width: '680px', height: '100vh',
                background: 'rgba(12,12,20,0.98)', backdropFilter: 'blur(24px)',
                borderLeft: '1px solid rgba(10,132,255,0.2)', zIndex: 1000, overflowY: 'auto',
                padding: '32px', boxShadow: '-16px 0 60px rgba(0,0,0,0.6)',
                animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0a84ff' }}>
                        🎫 {groupName}
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
                        borderRadius: '10px', padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                    }}>
                        ✕ Close
                    </button>
                </div>

                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
                    {tickets.length} open ticket{tickets.length !== 1 ? 's' : ''}
                </div>

                {tickets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                        <div style={{ fontSize: '15px', fontWeight: 600 }}>No open tickets!</div>
                    </div>
                ) : (
                    <div>
                        {tickets.map((t) => (
                            <TicketRow key={t.id} ticket={t} />
                        ))}
                    </div>
                )}

                <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
                    Data fetched live from ticketing API via builder-mcp · Cached for 5 minutes
                </div>
            </div>
        </>
    );
}

function buildTicketSummary(dashboard) {
    const s = dashboard?.summary;
    if (!s) return '';
    const groups = dashboard.groups || [];
    const lines = [
        `🎫 *Ticket Health Summary*`,
        `📋 *${s.totalOpen}* open across *${s.totalGroups}* resolver groups`,
        `⏰ Aging >14d: *${s.aging14d}* · >30d: *${s.aging30d}*`,
        `✅ Resolved (30d): *${s.totalResolved30d}*`,
        s.baselineOverdue > 0 ? `⚠️ Baseline overdue: *${s.baselineOverdue}*` : '',
        '',
        '*By Group:*',
        ...groups.filter(g => g.open > 0).map(g =>
            `• ${g.name}: ${g.open} open${g.oldestAge > 14 ? ` (oldest ${g.oldestAge}d)` : ''}`
        ),
    ];
    return lines.filter(Boolean).join('\n');
}

export default function TicketHealthPage() {
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [statPanel, setStatPanel] = useState(null);
    const [activeTab, setActiveTab] = useState('groups');


    const fetchDashboard = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        setError(null);

        try {
            const view = refresh ? 'refresh' : 'dashboard';
            const res = await fetch(`/api/ticket-health?view=${view}`);
            const json = await res.json();
            if (json.error) setError(json.error);
            else setDashboard(json.data);
        } catch (e) {
            setError(e.message);
        }

        setIsLoading(false);
        setIsRefreshing(false);
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    const summary = dashboard?.summary;

    return (
        <div className="dark-inline-page" style={{ zoom: 1.15 }}>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {dashboard && !dashboard.empty && (
                            <>
                                <span>{summary?.totalGroups} resolver groups · {summary?.totalOpen} open tickets</span>
                                <button onClick={() => fetchDashboard(true)} disabled={isRefreshing} style={{
                                    background: isRefreshing ? 'rgba(255,255,255,0.05)' : 'rgba(10,132,255,0.15)',
                                    color: isRefreshing ? 'rgba(255,255,255,0.3)' : '#0a84ff', border: 'none',
                                    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                    cursor: isRefreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
                                }}>
                                    <RefreshCw size={14} className={isRefreshing ? 'spin' : ''} />
                                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                                </button>
                                {dashboard.timestamp && (
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                                        Updated: {new Date(dashboard.timestamp).toLocaleTimeString()}
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Loading */}
            {isLoading && (
                <div style={{ padding: '80px', textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 20px' }} />
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '15px' }}>Loading ticket health...</div>
                    <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', marginTop: '6px' }}>
                        Fetching resolver groups and open tickets via builder-mcp
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '14px', padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
                    <AlertTriangle size={24} color="#ff453a" style={{ marginBottom: '8px' }} />
                    <div style={{ color: '#ff453a', fontWeight: 700, marginBottom: '6px' }}>Error loading ticket health</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{error}</div>
                    <button onClick={() => fetchDashboard(true)} style={{
                        marginTop: '16px', background: 'rgba(10,132,255,0.15)', color: '#0a84ff', border: 'none',
                        padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                        Try Again
                    </button>
                </div>
            )}

            {/* Empty */}
            {!isLoading && !error && dashboard?.empty && (
                <div style={{
                    background: 'rgba(22,22,30,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '20px', padding: '80px 40px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: '56px', marginBottom: '20px' }}>🎫</div>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '10px', color: 'rgba(255,255,255,0.85)' }}>No Resolver Groups Found</h2>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', maxWidth: '440px', margin: '0 auto', lineHeight: '1.6' }}>
                        {dashboard.message || 'Ensure builder-mcp is configured and you are a member of resolver groups.'}
                    </p>
                </div>
            )}

            {/* Dashboard */}
            {!isLoading && !error && dashboard && !dashboard.empty && (
                <>
                    {/* Summary Cards — clickable for drill-down */}
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '24px' }}>
                        <StatCard value={summary.totalOpen} label="Total Open" icon="📋" color="#0a84ff" bgColor="rgba(10,132,255,0.08)" borderColor="rgba(10,132,255,0.15)"
                            onClick={() => setStatPanel('totalOpen')} />
                        <StatCard value={summary.myTicketsCount} label="Assigned to You" icon="👤" color="#a78bfa" bgColor="rgba(139,92,246,0.08)" borderColor="rgba(139,92,246,0.15)"
                            onClick={() => setStatPanel('mine')} />
                        <StatCard value={summary.aging14d} label="Aging >14 Days" icon="⏰" color="#ff9f0a" bgColor="rgba(255,159,10,0.08)" borderColor="rgba(255,159,10,0.15)"
                            onClick={() => setStatPanel('aging14')} />
                        <StatCard value={summary.aging30d} label="Aging >30 Days" icon="🔴" color="#ff453a" bgColor="rgba(255,69,58,0.08)" borderColor="rgba(255,69,58,0.15)"
                            onClick={() => setStatPanel('aging30')} />
                        <StatCard value={summary.totalResolved30d} label="Resolved (30d)" icon="✅" color="#30d158" bgColor="rgba(48,209,88,0.08)" borderColor="rgba(48,209,88,0.15)"
                            onClick={() => setStatPanel('resolved')} />
                        <StatCard
                            value={summary.baselineOverdue} label="Baseline Overdue" icon="⚠️"
                            color={summary.baselineOverdue > 0 ? '#ff453a' : '#30d158'}
                            bgColor={summary.baselineOverdue > 0 ? 'rgba(255,69,58,0.08)' : 'rgba(48,209,88,0.08)'}
                            borderColor={summary.baselineOverdue > 0 ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)'}
                            onClick={summary.baselineOverdue > 0 ? () => setStatPanel('baseline') : undefined}
                        />
                    </div>

                    {/* Status Distribution */}
                    {summary.statusDistribution && Object.keys(summary.statusDistribution).length > 0 && (
                        <div style={{
                            background: 'rgba(22,22,30,0.6)', border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '14px', padding: '16px 20px', marginBottom: '24px',
                        }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}>
                                Status Distribution
                            </div>
                            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', height: '28px' }}>
                                {Object.entries(summary.statusDistribution).map(([status, count]) => {
                                    const pct = summary.totalOpen > 0 ? (count / summary.totalOpen) * 100 : 0;
                                    const sc = STATUS_COLORS[status] || STATUS_COLORS['Assigned'];
                                    return (
                                        <div key={status} title={`${status}: ${count} (${Math.round(pct)}%)`} style={{
                                            width: `${pct}%`, background: sc.bg, borderRight: '1px solid rgba(0,0,0,0.3)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '10px', fontWeight: 700, color: sc.color, minWidth: '30px',
                                        }}>
                                            {pct > 15 ? `${status} (${count})` : count}
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                                {Object.entries(summary.statusDistribution).map(([status, count]) => {
                                    const sc = STATUS_COLORS[status] || STATUS_COLORS['Assigned'];
                                    return (
                                        <span key={status} style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: sc.color }} />
                                            {status}: {count}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'rgba(22,22,30,0.6)', borderRadius: '12px', padding: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {[
                            { id: 'groups', label: 'Resolver Groups', icon: '🏢', count: dashboard.groups?.length },
                            { id: 'aging', label: 'Aging Tickets', icon: '⏰', count: summary.aging7d },
                            { id: 'mine', label: 'My Tickets', icon: '👤', count: summary.myTicketsCount },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                                flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none',
                                background: activeTab === tab.id ? 'rgba(10,132,255,0.15)' : 'transparent',
                                color: activeTab === tab.id ? '#0a84ff' : 'rgba(255,255,255,0.4)',
                                fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            }}>
                                {tab.icon} {tab.label}
                                <span style={{
                                    background: activeTab === tab.id ? 'rgba(10,132,255,0.2)' : 'rgba(255,255,255,0.06)',
                                    padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                                }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Tab: Resolver Groups */}
                    {activeTab === 'groups' && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Resolver Group', 'Your Role', 'Open', 'Resolved (30d)', 'Status Breakdown', 'Oldest', 'Baseline'].map(h => (
                                            <th key={h} style={{
                                                textAlign: 'left', fontSize: '10px', color: 'rgba(255,255,255,0.35)',
                                                textTransform: 'uppercase', letterSpacing: '1px', padding: '10px 14px',
                                                borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600,
                                            }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.groups.map((g) => {
                                        const rs = ROLE_STYLES[g.role] || ROLE_STYLES['Member'];
                                        return (
                                            <tr key={g.name}
                                                onClick={() => setSelectedGroup(g.name)}
                                                style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{g.name}</span>
                                                        <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.15)' }} />
                                                    </div>
                                                    {g.primaryOwner && (
                                                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>
                                                            Owner: {g.primaryOwner}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 600,
                                                        background: rs.bg, color: rs.color, border: `1px solid ${rs.border}`,
                                                    }}>
                                                        {g.role}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '14px' }}>
                                                    <span style={{ fontWeight: 700, color: openCountColor(g.open) }}>{g.open}</span>
                                                </td>
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px', color: '#30d158' }}>
                                                    {g.resolved30d}
                                                </td>
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    {g.statusBreakdown && Object.keys(g.statusBreakdown).length > 0 ? (
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {Object.entries(g.statusBreakdown).map(([st, ct]) => {
                                                                const sc = STATUS_COLORS[st] || STATUS_COLORS['Assigned'];
                                                                return (
                                                                    <span key={st} style={{
                                                                        padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
                                                                        background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                                                                    }}>
                                                                        {ct} {st}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '13px' }}>
                                                    {g.oldestAge > 0 ? <AgeBadge days={g.oldestAge} bucket={g.oldestAge >= 30 ? 'critical' : g.oldestAge >= 14 ? 'warning' : g.oldestAge >= 7 ? 'attention' : 'ok'} /> : <span style={{ color: '#30d158', fontSize: '12px' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <BaselineBadge status={g.baselineStatus} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tab: Aging Tickets */}
                    {activeTab === 'aging' && (
                        <div>
                            {dashboard.agingTickets && dashboard.agingTickets.length > 0 ? (
                                <div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>
                                        Showing {dashboard.agingTickets.length} tickets older than 7 days, sorted by age
                                    </div>
                                    {dashboard.agingTickets.map((t) => (
                                        <TicketRow key={t.id} ticket={t} />
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                                    <div style={{ fontSize: '15px', fontWeight: 600 }}>No aging tickets!</div>
                                    <div style={{ fontSize: '12px', marginTop: '6px' }}>All open tickets are less than 7 days old.</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Tab: My Tickets */}
                    {activeTab === 'mine' && (
                        <div>
                            {dashboard.myTickets && dashboard.myTickets.length > 0 ? (
                                <div>
                                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginBottom: '12px' }}>
                                        {dashboard.myTickets.length} ticket{dashboard.myTickets.length !== 1 ? 's' : ''} assigned to {dashboard.userAlias}
                                    </div>
                                    {dashboard.myTickets.map((t) => (
                                        <TicketRow key={t.id} ticket={t} />
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                                    <div style={{ fontSize: '15px', fontWeight: 600 }}>No tickets assigned to you!</div>
                                    <div style={{ fontSize: '12px', marginTop: '6px' }}>Your plate is clear across all resolver groups.</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '11px', color: 'rgba(255,255,255,0.15)', textAlign: 'center' }}>
                        Data fetched live from ticketing API via builder-mcp · Cached for 5 minutes · Click any resolver group row for ticket details
                    </div>
                </>
            )}

            {/* Dive Deep Assistant */}
            <AIChat pageContext="ticket-health" />

            {/* Stat Drill-Down Panel */}
            {statPanel && dashboard && (() => {
                const allTickets = dashboard.allTickets || [];
                const agingTickets = dashboard.agingTickets || [];
                const myTickets = dashboard.myTickets || [];
                const groups = dashboard.groups || [];

                // Helper: group breakdown for a ticket list
                const groupBreakdown = (tickets) => {
                    const counts = {};
                    tickets.forEach(t => { counts[t.group] = (counts[t.group] || 0) + 1; });
                    return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
                };

                const configs = {
                    totalOpen: {
                        title: 'All Open Tickets', icon: '📋', color: '#0a84ff',
                        tickets: allTickets.sort((a, b) => b.age - a.age),
                        groups: groupBreakdown(allTickets),
                    },
                    mine: {
                        title: 'Assigned to You', icon: '👤', color: '#a78bfa',
                        tickets: myTickets,
                        groups: groupBreakdown(myTickets),
                    },
                    aging14: {
                        title: 'Aging > 14 Days', icon: '⏰', color: '#ff9f0a',
                        tickets: agingTickets.filter(t => t.age >= 14),
                        groups: groupBreakdown(agingTickets.filter(t => t.age >= 14)),
                    },
                    aging30: {
                        title: 'Aging > 30 Days', icon: '🔴', color: '#ff453a',
                        tickets: agingTickets.filter(t => t.age >= 30),
                        groups: groupBreakdown(agingTickets.filter(t => t.age >= 30)),
                    },
                    resolved: {
                        title: 'Resolved (Last 30 Days)', icon: '✅', color: '#30d158',
                        tickets: [],
                        resolvedTickets: groups.map(g => ({
                            id: g.name, title: `${g.name} — ${g.resolved30d} resolved`, age: 0, ageBucket: 'ok',
                            status: 'Resolved', group: g.name, assignee: '', createDate: '',
                        })).filter(g => g.title.includes('0 resolved') === false),
                        groups: groups.filter(g => g.resolved30d > 0).map(g => ({ name: g.name, count: g.resolved30d })),
                    },
                    baseline: {
                        title: 'Baseline Overdue Groups', icon: '⚠️', color: '#ff453a',
                        tickets: [],
                        resolvedTickets: groups.filter(g => g.baselineStatus && g.baselineStatus !== 'UP_TO_DATE').map(g => ({
                            id: g.name, title: `${g.name} — Baseline: ${g.baselineStatus?.replace('DUE_', '').replace('_', ' ')}`,
                            age: 0, ageBucket: 'critical', status: g.baselineStatus, group: g.name, assignee: g.primaryOwner || '', createDate: '',
                        })),
                        groups: [],
                    },
                };

                const cfg = configs[statPanel];
                if (!cfg) return null;

                return (
                    <TicketListPanel
                        title={cfg.title}
                        icon={cfg.icon}
                        color={cfg.color}
                        tickets={cfg.tickets}
                        resolvedTickets={cfg.resolvedTickets}
                        groups={cfg.groups}
                        onClose={() => setStatPanel(null)}
                    />
                );
            })()}

            {/* Group Detail Panel */}
            {selectedGroup && (
                <GroupPanel
                    groupName={selectedGroup}
                    onClose={() => setSelectedGroup(null)}
                    allTickets={dashboard?.allTickets}
                />
            )}
        </div>
    );
}
