'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Users, AlertTriangle, Clock, TrendingUp,
    ChevronDown, ChevronRight, RefreshCw,
    Sparkles, Activity, UserCheck
} from 'lucide-react';

function ActivityDots({ activityCount }) {
    const dots = [
        activityCount >= 3 ? 'active' : activityCount >= 1 ? 'moderate' : 'quiet',
        activityCount >= 5 ? 'active' : activityCount >= 2 ? 'moderate' : 'quiet',
        activityCount >= 7 ? 'active' : 'quiet',
    ];
    const colors = { active: '#30d158', moderate: '#ff9f0a', quiet: 'rgba(255,255,255,0.15)' };
    return (
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
            {dots.map((level, i) => (
                <div key={i} style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: colors[level],
                    boxShadow: level !== 'quiet' ? `0 0 6px ${colors[level]}` : 'none'
                }} />
            ))}
        </div>
    );
}

function TypeBadge({ type }) {
    const config = {
        ops: { bg: 'rgba(255,69,58,0.15)', color: '#ff453a', label: 'Ops' },
        feature: { bg: 'rgba(48,209,88,0.15)', color: '#30d158', label: 'Feature' },
        cross_team: { bg: 'rgba(10,132,255,0.15)', color: '#0a84ff', label: 'Cross-team' },
        quality: { bg: 'rgba(191,90,242,0.15)', color: '#bf5af2', label: 'Quality' },
        investigation: { bg: 'rgba(255,159,10,0.15)', color: '#ff9f0a', label: 'Investigation' },
        taskei: { bg: 'rgba(48,209,88,0.15)', color: '#30d158', label: 'Taskei' },
        sim: { bg: 'rgba(255,69,58,0.15)', color: '#ff453a', label: 'SIM' },
        alarm: { bg: 'rgba(255,159,10,0.15)', color: '#ff9f0a', label: 'Alarm' },
        unknown: { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', label: 'Other' },
    };
    const c = config[type] || config.unknown;
    return (
        <span style={{
            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600,
            background: c.bg, color: c.color, textTransform: 'uppercase', letterSpacing: '0.5px'
        }}>
            {c.label}
        </span>
    );
}

function ImpactBadge({ impact }) {
    if (!impact) return null;
    const colors = { 1: '#ff453a', 2: '#ff453a', 3: '#ff9f0a', 4: '#ffd60a', 5: '#30d158' };
    return (
        <span style={{
            padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
            background: `${colors[impact] || '#9ca3af'}20`, color: colors[impact] || '#9ca3af'
        }}>
            Impact {impact}
        </span>
    );
}

function StatusBadge({ status }) {
    if (!status) return null;
    const normalized = status.toLowerCase();
    let color = 'rgba(255,255,255,0.4)';
    if (normalized.includes('open') || normalized.includes('assigned')) color = '#ff9f0a';
    if (normalized.includes('work in progress')) color = '#0a84ff';
    if (normalized.includes('resolved') || normalized.includes('closed')) color = '#30d158';
    return (
        <span style={{
            padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 500,
            background: `${color}15`, color, border: `1px solid ${color}30`
        }}>
            {status}
        </span>
    );
}

function OwnerPersonCard({ person, ownerData, breakdown, names, days }) {
    const [expanded, setExpanded] = useState(false);
    const [issues, setIssues] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    const alias = person.person;
    const fullName = names[alias];
    const initial = (alias || '?')[0].toUpperCase();
    const gradients = [
        'linear-gradient(135deg, #4f8cff, #3b6fd4)',
        'linear-gradient(135deg, #a855f7, #7c3aed)',
        'linear-gradient(135deg, #34d399, #059669)',
        'linear-gradient(135deg, #fb923c, #ea580c)',
        'linear-gradient(135deg, #22d3ee, #0891b2)',
        'linear-gradient(135deg, #f472b6, #db2777)',
    ];
    const gradient = gradients[alias.charCodeAt(0) % gradients.length];
    const ownerInfo = ownerData?.find(o => o.owner === alias);
    const personBreakdown = breakdown?.find(b => b.owner === alias);

    const handleExpand = async () => {
        if (!expanded && issues.length === 0) {
            setLoadingDetails(true);
            try {
                const res = await fetch(`/api/issues?view=owners&person=${alias}&days=${days}`);
                const data = await res.json();
                setIssues(data.data?.issues || []);
                setActivities(data.data?.activities || []);
            } catch (e) { /* ignore */ }
            setLoadingDetails(false);
        }
        setExpanded(!expanded);
    };

    const daysAgo = person.lastActiveAt
        ? Math.round((Date.now() - new Date(person.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
    const ownedCount = person.ownedIssueCount || 0;
    const actedCount = person.actedOnIssueCount || 0;
    const totalActivity = person.activityCount || 0;

    return (
        <div style={{
            background: 'rgba(22,22,30,0.6)', backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px',
            padding: '20px', marginBottom: '12px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: gradient, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 700, fontSize: '15px',
                    color: '#fff', flexShrink: 0
                }}>
                    {initial}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>
                        {fullName || alias}
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {fullName ? `${alias} · ` : ''}
                        {ownedCount > 0 ? `${ownedCount} owned` : ''}
                        {ownedCount > 0 && actedCount > 0 ? ' · ' : ''}
                        {actedCount > 0 ? `${actedCount} contributed` : ''}
                        {totalActivity > 0 ? ` · ${totalActivity} actions` : ''}
                        {daysAgo !== null && daysAgo <= 1 ? ' · active today' : daysAgo !== null && daysAgo < 999 ? ` · ${daysAgo}d ago` : ''}
                    </div>
                </div>
                <ActivityDots activityCount={totalActivity} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {ownedCount > 0 && (
                    <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#a78bfa' }}>{ownedCount}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Owned</div>
                    </div>
                )}
                {ownerInfo && ownerInfo.taskeiCount > 0 && (
                    <div style={{ background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#30d158' }}>{ownerInfo.taskeiCount}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Taskei</div>
                    </div>
                )}
                {ownerInfo && ownerInfo.simCount > 0 && (
                    <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.15)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#ff453a' }}>{ownerInfo.simCount}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>SIM</div>
                    </div>
                )}
                {ownerInfo && ownerInfo.alarmCount > 0 && (
                    <div style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#ff9f0a' }}>{ownerInfo.alarmCount}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Alarms</div>
                    </div>
                )}
                {personBreakdown && personBreakdown.ops > 0 && (
                    <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.15)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#ff453a' }}>{personBreakdown.ops}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Ops</div>
                    </div>
                )}
                {personBreakdown && personBreakdown.feature > 0 && (
                    <div style={{ background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', minWidth: '70px' }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#30d158' }}>{personBreakdown.feature}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Feature</div>
                    </div>
                )}
                {!ownerInfo && !personBreakdown && (
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>{totalActivity}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Activities</div>
                    </div>
                )}
            </div>

            {ownerInfo && ownerInfo.issueTitles && (
                <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.3)', marginBottom: '6px', fontWeight: 600 }}>
                        Working On
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {ownerInfo.issueTitles.split('|||').slice(0, 4).map((title, i) => (
                            <div key={i} style={{
                                fontSize: '12px', color: 'rgba(255,255,255,0.6)',
                                padding: '4px 8px', borderRadius: '6px',
                                background: 'rgba(255,255,255,0.03)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                                {title}
                            </div>
                        ))}
                        {ownerInfo.issueTitles.split('|||').length > 4 && (
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', paddingLeft: '8px' }}>
                                + {ownerInfo.issueTitles.split('|||').length - 4} more
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={handleExpand} style={{
                    padding: '7px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: '4px', transition: '0.2s', fontFamily: 'inherit'
                }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {expanded ? 'Hide Details' : 'Show Details'}
                </button>
            </div>

            {expanded && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {loadingDetails && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px' }}>Loading details...</div>}

                    {!loadingDetails && issues.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <h4 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.35)', marginBottom: '8px', fontWeight: 600 }}>
                                Owned Issues ({issues.length})
                            </h4>
                            {issues.map((issue, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    padding: '8px 12px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                                    marginBottom: '4px'
                                }}>
                                    <ImpactBadge impact={issue.impact} />
                                    <span style={{
                                        flex: 1, fontSize: '13px', color: 'rgba(255,255,255,0.8)',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}>
                                        {issue.title}
                                    </span>
                                    <StatusBadge status={issue.status} />
                                    <TypeBadge type={issue.type} />
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                                        {issue.ageDays}d
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loadingDetails && activities.length > 0 && (
                        <div>
                            <h4 style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.35)', marginBottom: '8px', fontWeight: 600 }}>
                                Recent Activity ({days}d)
                            </h4>
                            {activities.slice(0, 10).map((a, i) => (
                                <div key={i} style={{
                                    fontSize: '13px', color: 'rgba(255,255,255,0.6)', padding: '6px 0',
                                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                                    borderBottom: i < Math.min(activities.length, 10) - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none'
                                }}>
                                    <span style={{ fontSize: '14px', flexShrink: 0 }}>
                                        {a.action === 'commented' ? '💬' : a.action === 'created' ? '📝' : a.action === 'set_status' ? '🔄' : a.action === 'resolved' ? '✅' : '📌'}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{a.action}</span>
                                            <span>on</span>
                                            <span style={{ color: '#818cf8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                                                {a.title}
                                            </span>
                                            <ImpactBadge impact={a.impact} />
                                        </div>
                                        {a.content && (
                                            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', lineHeight: '1.5', maxHeight: '60px', overflow: 'hidden' }}>
                                                {a.content.substring(0, 200)}{a.content.length > 200 ? '...' : ''}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>
                                        {a.timestamp ? new Date(a.timestamp).toLocaleDateString() : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {!loadingDetails && issues.length === 0 && activities.length === 0 && (
                        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No recent details found</div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TeamPulsePage() {
    const [stats, setStats] = useState(null);
    const [ownerData, setOwnerData] = useState(null);
    const [openIssues, setOpenIssues] = useState([]);
    const [slaViolations, setSlaViolations] = useState([]);
    const [agingIssues, setAgingIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState(null);
    const [days, setDays] = useState(7);
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState('owners');
    const [showAllIssues, setShowAllIssues] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        setSyncMessage('Syncing from Outlook... (this may take 1-2 minutes)');
        try {
            const res = await fetch('/api/issues', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setSyncMessage(`✅ Synced! ${data.sync.issues || 0} issues fetched, ${data.parse.parsed || 0} parsed, ${data.parse.newIssues || 0} new`);
                await fetchData();
            } else {
                setSyncMessage(`❌ ${data.error || 'Sync failed'}`);
            }
        } catch (e) {
            setSyncMessage(`❌ Sync failed: ${e.message}`);
        }
        setIsSyncing(false);
        setTimeout(() => setSyncMessage(null), 8000);
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [statsRes, ownersRes, openRes, slaRes, agingRes] = await Promise.all([
                fetch(`/api/issues?view=stats&days=${days}`),
                fetch(`/api/issues?view=owners&days=${days}&resolveNames=true`),
                fetch(`/api/issues?view=open&days=${days}`),
                fetch(`/api/issues?view=sla&days=${days}`),
                fetch(`/api/issues?view=aging&minDays=7`),
            ]);
            const statsData = await statsRes.json();
            const ownersData = await ownersRes.json();
            const openData = await openRes.json();
            const slaData = await slaRes.json();
            const agingData = await agingRes.json();

            setStats(statsData.data);
            setOwnerData(ownersData.data);
            setOpenIssues(openData.data || []);
            setSlaViolations(slaData.data || []);
            setAgingIssues(agingData.data || []);
        } catch (e) {
            console.error('Failed to fetch team pulse data:', e);
        }
        setIsLoading(false);
    }, [days]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const combined = ownerData?.combined || [];
    const owners = ownerData?.owners || [];
    const ownerBreakdown = ownerData?.ownerBreakdown || [];
    const names = ownerData?.names || {};

    const displayPeople = combined.filter(p => {
        if (p.person === 'system' || p.person === 'unknown') return false;
        if (viewMode === 'owners' && p.ownedIssueCount === 0) return false;
        if (filter === 'all') return true;
        if (filter === 'active') return (p.activityCount || 0) >= 5;
        if (filter === 'quiet') return (p.activityCount || 0) <= 1;
        if (filter === 'high-load') return (p.ownedIssueCount || 0) >= 3;
        return true;
    });

    const dateOptions = [
        { value: 7, label: 'This Week' },
        { value: 14, label: '2 Weeks' },
        { value: 30, label: 'This Month' },
    ];

    const issuesShownCount = showAllIssues ? openIssues.length : Math.min(openIssues.length, 10);

    if (isLoading) {
        return (
            <div style={{ padding: '60px', textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                <div style={{ color: 'rgba(255,255,255,0.5)' }}>Loading Team Pulse data...</div>
            </div>
        );
    }

    const isEmpty = !stats || stats.totalIssues === 0;

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 className="header-greeting" style={{ marginBottom: 8 }}>Team Pulse</h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(255,255,255,0.45)', fontSize: '14px', flexWrap: 'wrap' }}>
                        <span>Ops health from your Issues folder</span>
                        {stats && <span>· {stats.uniquePeople} people · {stats.openIssues} open issues ({days}d)</span>}
                        <button onClick={() => fetchData()} style={{
                            background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: 'none',
                            padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit'
                        }}>
                            <RefreshCw size={14} /> Refresh
                        </button>
                        <button onClick={handleSync} disabled={isSyncing} style={{
                            background: isSyncing ? 'rgba(255,255,255,0.05)' : 'rgba(10,132,255,0.15)',
                            color: isSyncing ? 'rgba(255,255,255,0.3)' : '#0a84ff', border: 'none',
                            padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                            cursor: isSyncing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
                            gap: '6px', fontFamily: 'inherit'
                        }}>
                            📬 {isSyncing ? 'Syncing...' : 'Sync from Outlook'}
                        </button>
                    </div>
                </div>
                <div className="date-selector-container">
                    {dateOptions.map(opt => (
                        <button key={opt.value} onClick={() => setDays(opt.value)}
                            className={`date-selector-btn ${days === opt.value ? 'active' : ''}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Sync Message */}
            {syncMessage && (
                <div style={{
                    padding: '12px 20px', borderRadius: '10px', marginBottom: '20px',
                    background: syncMessage.includes('✅') ? 'rgba(48,209,88,0.08)' : syncMessage.includes('❌') ? 'rgba(255,69,58,0.08)' : 'rgba(10,132,255,0.08)',
                    border: `1px solid ${syncMessage.includes('✅') ? 'rgba(48,209,88,0.2)' : syncMessage.includes('❌') ? 'rgba(255,69,58,0.2)' : 'rgba(10,132,255,0.2)'}`,
                    color: syncMessage.includes('✅') ? '#30d158' : syncMessage.includes('❌') ? '#ff453a' : '#0a84ff',
                    fontSize: '13px', fontWeight: 500
                }}>
                    {syncMessage}
                </div>
            )}

            {isEmpty && (
                <div className="ai-briefing" style={{ textAlign: 'center', padding: '48px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: '12px' }}>No Issues Data Yet</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', maxWidth: '500px', margin: '0 auto', lineHeight: '1.6' }}>
                        Team Pulse reads from your Outlook &quot;Issues&quot; folder. Make sure Outlook is running and you have an &quot;Issues&quot; folder with SIM/Taskei notifications.
                    </p>
                </div>
            )}

            {!isEmpty && (
                <>
                    {/* Stats Bar */}
                    <div className="stats-bar">
                        <div className="stat-card animate-in">
                            <div style={{ fontSize: '28px' }}>🎫</div>
                            <div>
                                <div className="stat-value">{stats?.openIssues || 0}</div>
                                <div className="stat-label">Open Issues</div>
                            </div>
                        </div>
                        <div className="stat-card animate-in">
                            <div style={{ fontSize: '28px' }}>⚠️</div>
                            <div>
                                <div className="stat-value">{slaViolations.length}</div>
                                <div className="stat-label">SLA Violations</div>
                            </div>
                        </div>
                        <div className="stat-card animate-in">
                            <div style={{ fontSize: '28px' }}>⏰</div>
                            <div>
                                <div className="stat-value">{agingIssues.length}</div>
                                <div className="stat-label">{"Aging (>7d)"}</div>
                            </div>
                        </div>
                        <div className="stat-card animate-in">
                            <div style={{ fontSize: '28px' }}>👩‍💻</div>
                            <div>
                                <div className="stat-value">{stats?.uniquePeople || 0}</div>
                                <div className="stat-label">Active People</div>
                            </div>
                        </div>
                    </div>

                    {/* SLA Violations Alert */}
                    {slaViolations.length > 0 && (
                        <div style={{
                            background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)',
                            borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
                            display: 'flex', alignItems: 'flex-start', gap: '12px'
                        }}>
                            <AlertTriangle size={20} color="#ff453a" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div style={{ fontWeight: 600, color: '#ff453a', fontSize: '14px', marginBottom: '6px' }}>
                                    {slaViolations.length} SLA Violation{slaViolations.length > 1 ? 's' : ''} (Last {days} Days)
                                </div>
                                {slaViolations.slice(0, 3).map((v, i) => (
                                    <div key={i} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                                        <strong>{v.resolverGroup}</strong> — &quot;{v.title}&quot; ({v.eventType?.replace(/_/g, ' ')})
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Open Issues Summary */}
                    {openIssues.length > 0 && (
                        <div className="ai-briefing animate-in" style={{ marginTop: '0', marginBottom: '24px' }}>
                            <div className="ai-briefing-header">
                                <div className="ai-badge"><Sparkles size={12} /> Open Issues ({openIssues.length})</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {openIssues.slice(0, issuesShownCount).map((issue, i) => (
                                    <div key={i} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '10px 14px', borderRadius: '10px',
                                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <ImpactBadge impact={issue.impact} />
                                        <span style={{
                                            flex: 1, fontSize: '13px', color: 'rgba(255,255,255,0.8)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {issue.title}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                                            {issue.ageDays}d old
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                                            {issue.assigneeAlias || 'unassigned'}
                                        </span>
                                        <TypeBadge type={issue.type} />
                                    </div>
                                ))}
                                {openIssues.length > 10 && (
                                    <button onClick={() => setShowAllIssues(!showAllIssues)} style={{
                                        fontSize: '12px', color: '#818cf8', textAlign: 'center', padding: '8px',
                                        background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
                                    }}>
                                        {showAllIssues ? 'Show less' : `+ ${openIssues.length - 10} more open issues`}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* View Mode Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                        <div style={{
                            display: 'inline-flex', background: 'rgba(0,0,0,0.3)', padding: '4px',
                            borderRadius: '99px', border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            <button onClick={() => setViewMode('owners')} style={{
                                padding: '8px 20px', borderRadius: '99px', fontSize: '13px', fontWeight: 500,
                                background: viewMode === 'owners' ? 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(59,130,246,0.9))' : 'transparent',
                                color: viewMode === 'owners' ? '#fff' : 'rgba(255,255,255,0.5)',
                                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                boxShadow: viewMode === 'owners' ? '0 4px 15px rgba(139,92,246,0.4)' : 'none'
                            }}>
                                👤 By Owner
                            </button>
                            <button onClick={() => setViewMode('activity')} style={{
                                padding: '8px 20px', borderRadius: '99px', fontSize: '13px', fontWeight: 500,
                                background: viewMode === 'activity' ? 'linear-gradient(135deg, rgba(139,92,246,0.9), rgba(59,130,246,0.9))' : 'transparent',
                                color: viewMode === 'activity' ? '#fff' : 'rgba(255,255,255,0.5)',
                                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                boxShadow: viewMode === 'activity' ? '0 4px 15px rgba(139,92,246,0.4)' : 'none'
                            }}>
                                ⚡ By Activity
                            </button>
                        </div>

                        {/* Filter Tabs */}
                        <div style={{
                            display: 'inline-flex', background: 'rgba(0,0,0,0.3)', padding: '4px',
                            borderRadius: '99px', border: '1px solid rgba(255,255,255,0.05)'
                        }}>
                            {[
                                { id: 'all', label: `All (${displayPeople.length})` },
                                { id: 'active', label: '🔥 Active' },
                                { id: 'quiet', label: '😴 Quiet' },
                                { id: 'high-load', label: '🔴 High Load' },
                            ].map(f => (
                                <button key={f.id} onClick={() => setFilter(f.id)} style={{
                                    padding: '8px 18px', borderRadius: '99px', fontSize: '12px', fontWeight: 500,
                                    background: filter === f.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                                    color: filter === f.id ? '#fff' : 'rgba(255,255,255,0.5)',
                                    border: 'none', cursor: 'pointer', fontFamily: 'inherit'
                                }}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* People Cards */}
                    <div>
                        {displayPeople.length === 0 && (
                            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
                                No people match this filter
                            </div>
                        )}
                        {displayPeople.map((person) => (
                            <OwnerPersonCard
                                key={person.person}
                                person={person}
                                ownerData={owners}
                                breakdown={ownerBreakdown}
                                names={names}
                                days={days}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
