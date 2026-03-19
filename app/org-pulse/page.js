'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Users, Code2, GitPullRequest, Ticket, Target, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Clock } from 'lucide-react';

// ─── Activity level color ───
function getActivityColor(crs) {
    if (crs >= 5) return { bg: 'rgba(48, 209, 88, 0.15)', border: 'rgba(48, 209, 88, 0.3)', text: '#30d158', label: 'High' };
    if (crs >= 2) return { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.25)', text: '#3b82f6', label: 'Active' };
    if (crs >= 1) return { bg: 'rgba(255, 214, 10, 0.1)', border: 'rgba(255, 214, 10, 0.2)', text: '#ffd60a', label: 'Low' };
    return { bg: 'rgba(255, 255, 255, 0.02)', border: 'rgba(255, 255, 255, 0.06)', text: 'rgba(255,255,255,0.3)', label: 'No signals' };
}

function getGoalColor(statusColor) {
    if (statusColor === 'Green') return '#30d158';
    if (statusColor === 'Yellow') return '#ffd60a';
    if (statusColor === 'Red') return '#ff453a';
    return 'rgba(255,255,255,0.25)';
}

function timeSince(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
}

// ─── Engineer Card ───
function EngineerCard({ member, metrics, tickets, goals, index }) {
    const [expanded, setExpanded] = useState(false);
    const crs = metrics?.crsCreated || 0;
    const reviews = metrics?.crsReviewed || 0;
    const actColor = getActivityColor(crs);
    const ticketCount = tickets?.open || 0;
    const goalList = goals || [];
    const worstGoal = goalList.reduce((worst, g) => {
        if (g.statusColor === 'Red') return 'Red';
        if (g.statusColor === 'Yellow' && worst !== 'Red') return 'Yellow';
        return worst;
    }, goalList.length > 0 ? 'Green' : null);

    return (
        <div
            onClick={() => setExpanded(!expanded)}
            style={{
                background: actColor.bg,
                border: `1px solid ${actColor.border}`,
                borderRadius: 14,
                padding: '14px 16px',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                animation: `fadeSlideIn 0.4s ease ${index * 0.05}s both`,
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Glow indicator for declining engineers */}
            {metrics?.declining3w && (
                <div style={{
                    position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: '50%',
                    background: '#ff9f0a', boxShadow: '0 0 8px #ff9f0a', margin: '8px',
                }} title="3-week declining trend" />
            )}

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        background: `linear-gradient(135deg, ${actColor.text}30, ${actColor.text}10)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: actColor.text,
                    }}>
                        {(member.name || member.alias || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {member.name || member.alias}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {member.alias}{member.team ? ` · ${member.team}` : ''}
                        </div>
                    </div>
                </div>
                {expanded ? <ChevronUp size={14} color="var(--text-tertiary)" /> : <ChevronDown size={14} color="var(--text-tertiary)" />}
            </div>

            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: crs > 0 ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
                    color: crs > 0 ? '#a78bfa' : 'var(--text-tertiary)',
                }}>
                    <Code2 size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    {crs} CRs
                </span>
                <span style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                    background: reviews > 0 ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
                    color: reviews > 0 ? '#60a5fa' : 'var(--text-tertiary)',
                }}>
                    <GitPullRequest size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                    {reviews} reviews
                </span>
                {ticketCount > 0 && (
                    <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                        background: 'rgba(6,182,212,0.12)', color: '#22d3ee',
                    }}>
                        <Ticket size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        {ticketCount} tickets
                    </span>
                )}
                {worstGoal && (
                    <span style={{
                        fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                        background: `${getGoalColor(worstGoal)}15`, color: getGoalColor(worstGoal),
                    }}>
                        <Target size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        {goalList.length} goal{goalList.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', animation: 'fadeSlideIn 0.2s ease' }}>
                    {/* Recent CRs */}
                    {metrics?.recentCrs?.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Recent CRs</div>
                            {metrics.recentCrs.map((cr, i) => (
                                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ color: '#818cf8', fontSize: 11 }}>{cr.id}</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cr.title}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Goals */}
                    {goalList.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Goals</div>
                            {goalList.slice(0, 3).map((g, i) => (
                                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: getGoalColor(g.statusColor), flexShrink: 0 }} />
                                    <span style={{ color: '#818cf8', fontSize: 11 }}>{g.id}</span>
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                                    {g.ecd && g.ecd !== 'Missing' && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>ECD: {g.ecd}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                    {/* Tickets */}
                    {tickets?.tickets?.length > 0 && (
                        <div>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>Tickets</div>
                            {tickets.tickets.map((t, i) => (
                                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
                                    <span style={{ color: '#22d3ee', fontSize: 11 }}>{t.id}</span> {t.title} <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>({t.age}d)</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {!metrics?.recentCrs?.length && goalList.length === 0 && !tickets?.tickets?.length && (
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>ℹ️ No detailed data available for this engineer</div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Team Section ───
function TeamSection({ managerAlias, team, engMetrics, engTickets, engGoals, teamIndex }) {
    const [collapsed, setCollapsed] = useState(false);
    const members = team.members || [];
    const totalCrs = members.reduce((s, m) => s + (engMetrics?.[m.alias]?.crsCreated || 0), 0);
    const totalReviews = members.reduce((s, m) => s + (engMetrics?.[m.alias]?.crsReviewed || 0), 0);
    const activeCount = members.filter(m => (engMetrics?.[m.alias]?.crsCreated || 0) > 0).length;

    return (
        <div style={{
            marginBottom: 24,
            animation: `fadeSlideIn 0.5s ease ${teamIndex * 0.15}s both`,
        }}>
            {/* Team Header */}
            <div
                onClick={() => setCollapsed(!collapsed)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 18px', borderRadius: 16,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', marginBottom: collapsed ? 0 : 12,
                    transition: 'all 0.2s',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.15))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18,
                    }}>☀️</div>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {team.manager.name || managerAlias}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {members.length} engineer{members.length !== 1 ? 's' : ''} · {activeCount} active this week
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#a78bfa' }}>{totalCrs}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>CRs</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{totalReviews}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 }}>reviews</span>
                    </div>
                    {collapsed ? <ChevronDown size={18} color="var(--text-tertiary)" /> : <ChevronUp size={18} color="var(--text-tertiary)" />}
                </div>
            </div>

            {/* Engineer Cards Grid */}
            {!collapsed && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                    gap: 10,
                }}>
                    {members.map((member, i) => (
                        <EngineerCard
                            key={member.alias}
                            member={member}
                            metrics={engMetrics?.[member.alias]}
                            tickets={engTickets?.[member.alias]}
                            goals={engGoals?.[member.alias]}
                            index={i}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ───
export default function OrgPulsePage() {
    const [orgTree, setOrgTree] = useState(null);
    const [engMetricsData, setEngMetricsData] = useState(null);
    const [ticketData, setTicketData] = useState(null);
    const [goalData, setGoalData] = useState(null);
    const [loadedSources, setLoadedSources] = useState([]);
    const [totalElapsed, setTotalElapsed] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setLoadedSources([]);
        try {
            const res = await fetch('/api/org-pulse?view=stream');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '))) {
                    try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'org-tree' && evt.data) {
                            setOrgTree(evt.data);
                            setLoadedSources(p => [...p, 'org-tree']);
                            setIsLoading(false);
                        }
                        if (evt.type === 'eng-metrics' && evt.data) {
                            setEngMetricsData(evt.data);
                            setLoadedSources(p => [...p, 'eng-metrics']);
                        }
                        if (evt.type === 'ticket-health' && evt.data) {
                            setTicketData(evt.data);
                            setLoadedSources(p => [...p, 'ticket-health']);
                        }
                        if (evt.type === 'goals' && evt.data) {
                            setGoalData(evt.data);
                            setLoadedSources(p => [...p, 'goals']);
                        }
                        if (evt.type === 'done') {
                            setTotalElapsed(evt.totalElapsed);
                            setIsLoading(false);
                        }
                    } catch (e) { /* skip */ }
                }
            }
        } catch (e) {
            console.error('Org Pulse fetch failed:', e);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Aggregate org-level KPIs
    const teams = orgTree?.teams || {};
    const teamEntries = Object.entries(teams);
    const totalMembers = orgTree?.totalMembers || 0;
    const allAliases = teamEntries.flatMap(([, t]) => t.members.map(m => m.alias));
    const em = engMetricsData?.engineerMetrics || {};
    const totalCrs = allAliases.reduce((s, a) => s + (em[a]?.crsCreated || 0), 0);
    const totalReviews = allAliases.reduce((s, a) => s + (em[a]?.crsReviewed || 0), 0);
    const activeEngineers = allAliases.filter(a => (em[a]?.crsCreated || 0) > 0).length;
    const silentEngineers = allAliases.filter(a => (em[a]?.crsCreated || 0) === 0).length;
    const totalOpenTickets = ticketData?.summary?.totalOpen || 0;
    const goalsByColor = goalData?.byColor || {};

    // Data source status indicators
    const sourceStatus = (name, loaded) => (
        <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
            background: loaded ? 'rgba(48,209,88,0.12)' : 'rgba(255,255,255,0.04)',
            color: loaded ? '#30d158' : 'var(--text-tertiary)',
            transition: 'all 0.3s',
        }}>
            {loaded ? '✓' : '⏳'} {name}
        </span>
    );

    return (
        <div className="dark-inline-page" style={{ maxWidth: 1200 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <Activity size={26} color="#a78bfa" /> Org Pulse
                    </h1>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {totalMembers} engineers · {teamEntries.length} teams
                        {totalElapsed && <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>· Loaded in {totalElapsed}</span>}
                    </div>
                    {/* Data source badges */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {sourceStatus('Org', loadedSources.includes('org-tree'))}
                        {sourceStatus('Code', loadedSources.includes('eng-metrics'))}
                        {sourceStatus('Tickets', loadedSources.includes('ticket-health'))}
                        {sourceStatus('Goals', loadedSources.includes('goals'))}
                    </div>
                </div>
                <button onClick={fetchData} disabled={isLoading} style={{
                    background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', border: 'none',
                    borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 600,
                    cursor: isLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isLoading ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <RefreshCw size={14} className={isLoading ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {/* KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
                {[
                    { value: totalCrs, label: 'CRs Created', color: '#a78bfa', icon: '💻' },
                    { value: totalReviews, label: 'Reviews Given', color: '#60a5fa', icon: '👀' },
                    { value: activeEngineers, label: 'Active', color: '#30d158', icon: '🟢' },
                    { value: silentEngineers, label: 'No Signals', color: silentEngineers > 0 ? '#ff9f0a' : 'var(--text-tertiary)', icon: '⬜' },
                    { value: totalOpenTickets, label: 'Open Tickets', color: '#22d3ee', icon: '🎫' },
                    { value: `${goalsByColor.Green || 0}/${goalsByColor.Yellow || 0}/${goalsByColor.Red || 0}`, label: 'G / Y / R Goals', color: '#30d158', icon: '🎯' },
                ].map((kpi, i) => (
                    <div key={i} style={{
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 14, padding: '16px 14px', textAlign: 'center',
                        animation: `fadeSlideIn 0.4s ease ${i * 0.08}s both`,
                    }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{kpi.icon}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: kpi.color, letterSpacing: '-0.5px' }}>{kpi.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginTop: 2 }}>{kpi.label}</div>
                    </div>
                ))}
            </div>

            {/* Needs Your Eyes — pattern detection (factual only) */}
            {engMetricsData && (
                <div style={{
                    background: 'rgba(255,159,10,0.06)', border: '1px solid rgba(255,159,10,0.15)',
                    borderRadius: 16, padding: '16px 20px', marginBottom: 24,
                }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#ff9f0a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        👀 Needs Your Eyes
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                        {silentEngineers > 0 && (
                            <div>⬜ <strong>{silentEngineers} engineer{silentEngineers > 1 ? 's' : ''}</strong> with 0 code signals this week — may be on PTO, design work, or investigation.</div>
                        )}
                        {(engMetricsData.alerts?.staleCrs || 0) > 0 && (
                            <div>⏰ <strong>{engMetricsData.alerts.staleCrs} stale CR{engMetricsData.alerts.staleCrs > 1 ? 's' : ''}</strong> open {'>'} 5 days across the org.</div>
                        )}
                        {(goalsByColor.Red || 0) > 0 && (
                            <div>🔴 <strong>{goalsByColor.Red} goal{goalsByColor.Red > 1 ? 's' : ''}</strong> at Red status.</div>
                        )}
                        {silentEngineers === 0 && !engMetricsData.alerts?.staleCrs && !goalsByColor.Red && (
                            <div>✅ No immediate concerns — your org looks healthy this week.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Team Sections */}
            {teamEntries.length > 0 ? (
                teamEntries.map(([mgrAlias, team], i) => (
                    <TeamSection
                        key={mgrAlias}
                        managerAlias={mgrAlias}
                        team={team}
                        engMetrics={em}
                        engTickets={ticketData?.engineerTickets}
                        engGoals={goalData?.engineerGoals}
                        teamIndex={i}
                    />
                ))
            ) : (
                <div style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 20, padding: '80px 40px', textAlign: 'center',
                }}>
                    <div style={{ fontSize: 56, marginBottom: 20 }}>🌌</div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Org Pulse</h2>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 14, maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
                        {isLoading ? 'Loading your org data...' : 'Sync your org first: go to Settings → Org Sync to fetch your team from Phonetool.'}
                    </p>
                </div>
            )}

            <style>{`
                @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
