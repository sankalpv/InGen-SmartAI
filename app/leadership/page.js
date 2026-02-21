'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';

export default function LeadershipDashboard() {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('time-audit');
    const [dateRange, setDateRange] = useState(7);

    useEffect(() => {
        fetchAnalytics();
    }, [dateRange]);

    const [metadata, setMetadata] = useState(null);

    async function fetchAnalytics() {
        setLoading(true);
        try {
            const response = await fetch(`/api/leadership?type=all&range=${dateRange}`);
            const data = await response.json();
            if (data.success) {
                setAnalytics(data.data);
                setMetadata(data.metadata);
            }
        } catch (error) {
            console.error('Failed to fetch leadership analytics:', error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <Header />
            
            <div className="p-6">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-4xl font-bold text-white mb-3">Leadership Analytics</h1>
                        <p className="text-lg text-slate-300">
                            Data-driven insights for senior leaders
                            {metadata && (
                                <span className="ml-2 text-sm text-slate-400">
                                    · {metadata.meetingsAnalyzed} meetings · {metadata.emailsAnalyzed} emails · Last {metadata.dateRange} days
                                </span>
                            )}
                        </p>
                        
                        {/* Date Range Selector - Apple Glass Style */}
                        <div className="mt-6 date-selector-container">
                            {[7, 14, 30].map(days => (
                                <button
                                    key={days}
                                    onClick={() => setDateRange(days)}
                                    className={`date-selector-btn ${dateRange === days ? 'active' : ''}`}
                                >
                                    {days} days
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
                        </div>
                    ) : (
                        <>
                            {/* Tab Navigation - Apple Glass Style */}
                            <div className="leadership-tabs-container">
                                {[
                                    { id: 'time-audit', label: 'Time Audit', icon: '⏰' },
                                    { id: 'relationships', label: 'Relationships', icon: '👥' },
                                    { id: 'action-items', label: 'Action Items', icon: '✅' },
                                    { id: 'blockers', label: 'Blockers', icon: '🚧' },
                                    { id: 'decisions', label: 'Decisions', icon: '⚖️' }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`leadership-tab ${activeTab === tab.id ? 'active' : ''}`}
                                    >
                                        <span className="leadership-tab-icon">{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Content Sections */}
                            {activeTab === 'time-audit' && analytics?.timeAudit && (
                                <TimeAuditView data={analytics.timeAudit} />
                            )}

                            {activeTab === 'relationships' && analytics?.relationships && (
                                <RelationshipsView data={analytics.relationships} />
                            )}

                            {activeTab === 'action-items' && analytics?.actionItems && (
                                <ActionItemsView data={analytics.actionItems} />
                            )}

                            {activeTab === 'blockers' && analytics?.blockers && (
                                <BlockersView data={analytics.blockers} />
                            )}

                            {activeTab === 'decisions' && analytics?.decisions && (
                                <DecisionsView data={analytics.decisions} />
                            )}
                        </>
                    )}
            </div>
        </div>
    );
}

// Time Audit Component
function TimeAuditView({ data }) {
    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    title="Total Meetings"
                    value={data.meetings.total}
                    subtitle={`${data.meetings.avgPerDay} per day · Busy/Tentative only`}
                    icon="📅"
                    tooltip="Includes meetings marked as Busy or Tentative. Excludes Out-of-Office and Free time blocks."
                />
                <StatCard
                    title="Meeting Hours"
                    value={data.meetings.totalHours}
                    subtitle="total this period"
                    icon="⏱️"
                />
                <StatCard
                    title="Deep Work"
                    value={`${data.deepWork.totalHours}h`}
                    subtitle={`${data.deepWork.percentageOfWorkDay}% of work time`}
                    icon="🎯"
                    tooltip="Calculated as: Total work time (8h/day) minus meeting time. Represents time available for focused work."
                />
                <StatCard
                    title="Balance"
                    value={data.balance.assessment.replace(/-/g, ' ')}
                    subtitle={`${data.balance.meetingToDeepWorkRatio}:1 meeting-to-deep-work ratio`}
                    icon="⚖️"
                    valueClass="text-2xl"
                    tooltip="Balance assessment based on meeting percentage: >70% = meeting-heavy, 50-70% = balanced, 30-50% = deep-work-focused, <30% = minimal-meetings"
                />
            </div>

            {/* Meeting Breakdown */}
            <div className="leadership-panel">
                <h3 className="leadership-panel-title">Meeting Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                        { type: 'oneOnOne', label: '1-on-1s', count: data.meetings.breakdown.oneOnOne, hours: data.meetings.hoursPerType.oneOnOne },
                        { type: 'smallGroup', label: 'Small Groups', count: data.meetings.breakdown.smallGroup, hours: data.meetings.hoursPerType.smallGroup },
                        { type: 'largeMeeting', label: 'Large Meetings', count: data.meetings.breakdown.largeMeeting, hours: data.meetings.hoursPerType.largeMeeting },
                        { type: 'allHands', label: 'All-Hands', count: data.meetings.breakdown.allHands, hours: data.meetings.hoursPerType.allHands }
                    ].map(item => (
                        <div key={item.type} className="leadership-breakdown-item">
                            <div className="leadership-breakdown-label">{item.label}</div>
                            <div className="leadership-breakdown-value">{item.count}</div>
                            <div className="leadership-breakdown-detail text-purple-400">{item.hours}h</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Email Activity */}
            <div className="leadership-panel">
                <h3 className="leadership-panel-title">Email Activity</h3>
                <div className="grid grid-cols-2 gap-6">
                    <div className="leadership-breakdown-item">
                        <div className="leadership-breakdown-label">Sent</div>
                        <div className="leadership-breakdown-value">{data.email.sent}</div>
                        <div className="leadership-breakdown-detail text-green-400">{data.email.avgSentPerDay} per day</div>
                    </div>
                    <div className="leadership-breakdown-item">
                        <div className="leadership-breakdown-label">Received</div>
                        <div className="leadership-breakdown-value">{data.email.received}</div>
                        <div className="leadership-breakdown-detail text-blue-400">{data.email.avgReceivedPerDay} per day</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Relationships Component
function RelationshipsView({ data }) {
    const healthyRelationships = data.topRelationships.filter(r => r.status === 'healthy');
    const atRiskRelationships = data.topRelationships.filter(r => r.status === 'at-risk' || r.status === 'neglected');
    
    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Total Contacts" value={data.summary.total} icon="👤" />
                <StatCard 
                    title="Healthy" 
                    value={data.summary.healthy} 
                    subtitle={healthyRelationships.length > 0 ? healthyRelationships.slice(0, 3).map(r => r.name).join(', ') : 'relationships'} 
                    icon="💚" 
                />
                <StatCard 
                    title="At Risk" 
                    value={data.summary.atRisk} 
                    subtitle={atRiskRelationships.length > 0 ? atRiskRelationships.slice(0, 3).map(r => r.name).join(', ') : 'need attention'} 
                    icon="⚠️" 
                />
            </div>

            {/* Top Relationships */}
            <div className="leadership-panel">
                <h3 className="leadership-panel-title">Top Relationships ({data.topRelationships.length} contacts)</h3>
                <div className="space-y-3">
                    {data.topRelationships.map((rel, index) => (
                        <div key={rel.email} className="leadership-breakdown-item">
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                            {rel.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="text-white font-medium">{rel.name}</div>
                                            <div className="text-slate-400 text-sm">{rel.email}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
                                        <div>
                                            <span className="text-slate-400">Sent:</span>
                                            <span className="text-white ml-1">{rel.emailsSent}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Received:</span>
                                            <span className="text-white ml-1">{rel.emailsReceived}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Meetings:</span>
                                            <span className="text-white ml-1">{rel.meetingsTogether}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Last:</span>
                                            <span className="text-white ml-1">{rel.daysSinceLastContact}d ago</span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="ml-4 text-center">
                                    <div className={`text-3xl font-bold ${
                                        rel.healthScore >= 70 ? 'text-green-400' :
                                        rel.healthScore >= 50 ? 'text-yellow-400' :
                                        'text-red-400'
                                    }`}>
                                        {rel.healthScore}
                                    </div>
                                    <div className={`text-xs px-2 py-1 rounded mt-1 ${
                                        rel.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                                        rel.status === 'stable' ? 'bg-yellow-500/20 text-yellow-400' :
                                        rel.status === 'at-risk' ? 'bg-orange-500/20 text-orange-400' :
                                        'bg-red-500/20 text-red-400'
                                    }`}>
                                        {rel.status}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Action Items Component - Reimagined for Executive Clarity
function ActionItemsView({ data }) {
    const [viewMode, setViewMode] = useState('owner');
    
    const actionTypeLabels = {
        review: { icon: '👀', label: 'Reviews & Approvals', color: 'text-blue-400' },
        schedule: { icon: '📅', label: 'Scheduling', color: 'text-purple-400' },
        communicate: { icon: '💬', label: 'Communications', color: 'text-green-400' },
        create: { icon: '✏️', label: 'Create & Update', color: 'text-orange-400' },
        follow_up: { icon: '🔄', label: 'Follow-ups', color: 'text-cyan-400' },
        general: { icon: '📋', label: 'General', color: 'text-slate-400' }
    };

    const ownerLabels = {
        assigned_to_me: { icon: '📥', label: 'Assigned to Me', color: 'bg-red-500/20 text-red-400', desc: 'Items others expect from you' },
        delegated: { icon: '📤', label: 'Delegated by Me', color: 'bg-blue-500/20 text-blue-400', desc: 'Items you asked others to do' },
        from_meeting: { icon: '🤝', label: 'From Meetings', color: 'bg-purple-500/20 text-purple-400', desc: 'Action items from meetings' }
    };

    return (
        <div className="space-y-6">
            {/* Summary Cards - More Insightful */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard 
                    title="Assigned to Me" 
                    value={data.summary.byOwner?.assignedToMe || 0} 
                    subtitle="Items I need to act on"
                    icon="📥" 
                    tooltip="Emails received containing action keywords like 'please', 'can you', 'review', 'deadline', etc."
                />
                <StatCard 
                    title="Delegated" 
                    value={data.summary.byOwner?.delegated || 0} 
                    subtitle="Items I asked others to do"
                    icon="📤" 
                    tooltip="Emails I sent containing action keywords. Track what you've asked others to deliver."
                />
                <StatCard 
                    title="High Priority" 
                    value={data.summary.byUrgency.high} 
                    subtitle="Needs immediate attention"
                    icon="🔴" 
                    tooltip="Items containing urgent keywords: 'urgent', 'asap', 'immediate', 'critical', 'deadline'"
                />
                <StatCard 
                    title="With Deadline" 
                    value={data.summary.withDeadline || 0} 
                    subtitle={data.summary.overdue > 0 ? `${data.summary.overdue} overdue` : 'on track'}
                    icon="⏰" 
                    tooltip="Items mentioning specific timeframes: 'by EOD', 'by Friday', 'next week', 'tomorrow'"
                />
            </div>

            {/* View Mode Toggle */}
            <div className="flex gap-2">
                {[
                    { id: 'owner', label: 'By Ownership' },
                    { id: 'type', label: 'By Action Type' },
                    { id: 'timeline', label: 'By Timeline' },
                    { id: 'all', label: 'All Items' }
                ].map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => setViewMode(mode.id)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: viewMode === mode.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            color: viewMode === mode.id ? '#a78bfa' : 'var(--text-secondary)',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {mode.label}
                    </button>
                ))}
            </div>

            {/* Owner View */}
            {viewMode === 'owner' && data.byOwner && (
                <div className="space-y-4">
                    {Object.entries(data.byOwner).map(([ownerKey, items]) => {
                        if (!items || items.length === 0) return null;
                        const meta = ownerLabels[ownerKey] || { icon: '📋', label: ownerKey, color: 'bg-slate-500/20 text-slate-400', desc: '' };
                        return (
                            <div key={ownerKey} className="leadership-panel">
                                <h3 className="leadership-panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{meta.icon}</span>
                                    {meta.label}
                                    <span className={`ml-2 px-2 py-0.5 rounded text-xs ${meta.color}`}>{items.length}</span>
                                </h3>
                                {meta.desc && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px', marginTop: '-4px' }}>{meta.desc}</p>}
                                <div className="space-y-3">
                                    {items.slice(0, 8).map(item => <ActionItemCard key={item.id} item={item} actionTypeLabels={actionTypeLabels} />)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Action Type View */}
            {viewMode === 'type' && data.byActionType && (
                <div className="space-y-4">
                    {Object.entries(data.byActionType).map(([typeKey, items]) => {
                        if (!items || items.length === 0) return null;
                        const meta = actionTypeLabels[typeKey] || { icon: '📋', label: typeKey, color: 'text-slate-400' };
                        return (
                            <div key={typeKey} className="leadership-panel">
                                <h3 className="leadership-panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{meta.icon}</span>
                                    <span className={meta.color}>{meta.label}</span>
                                    <span className="ml-2 px-2 py-0.5 rounded text-xs bg-white/10">{items.length}</span>
                                </h3>
                                <div className="space-y-3">
                                    {items.slice(0, 8).map(item => <ActionItemCard key={item.id} item={item} actionTypeLabels={actionTypeLabels} />)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Timeline View */}
            {viewMode === 'timeline' && data.byTimeline && (
                <div className="space-y-4">
                    {[
                        { key: 'overdue', label: '🚨 Overdue', color: 'text-red-400' },
                        { key: 'today', label: '📌 Today', color: 'text-orange-400' },
                        { key: 'thisWeek', label: '📅 This Week', color: 'text-blue-400' },
                        { key: 'older', label: '📁 Earlier', color: 'text-slate-400' }
                    ].map(({ key, label, color }) => {
                        const items = data.byTimeline[key] || [];
                        if (items.length === 0) return null;
                        return (
                            <div key={key} className="leadership-panel">
                                <h3 className="leadership-panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className={color}>{label}</span>
                                    <span className="ml-2 px-2 py-0.5 rounded text-xs bg-white/10">{items.length}</span>
                                </h3>
                                <div className="space-y-3">
                                    {items.slice(0, 8).map(item => <ActionItemCard key={item.id} item={item} actionTypeLabels={actionTypeLabels} />)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* All Items View (flat list) */}
            {viewMode === 'all' && (
                <div className="leadership-panel">
                    <h3 className="leadership-panel-title">All Action Items ({data.items.length})</h3>
                    <div className="space-y-3">
                        {data.items.slice(0, 20).map(item => <ActionItemCard key={item.id} item={item} actionTypeLabels={actionTypeLabels} />)}
                    </div>
                </div>
            )}
        </div>
    );
}

// Reusable Action Item Card
function ActionItemCard({ item, actionTypeLabels }) {
    const typeMeta = actionTypeLabels[item.actionType] || { icon: '📋', label: item.actionType, color: 'text-slate-400' };
    
    return (
        <div className="leadership-breakdown-item">
            <div className="flex items-start gap-3">
                <div className={`mt-1 w-3 h-3 rounded-full flex-shrink-0 ${
                    item.urgency === 'high' ? 'bg-red-500' :
                    item.urgency === 'medium' ? 'bg-yellow-500' :
                    'bg-green-500'
                }`}></div>
                <div className="flex-1">
                    <div className="text-white font-medium mb-1" style={{ fontSize: '14px' }}>{item.subject}</div>
                    {item.action && (
                        <div className="text-slate-300 text-sm mb-2" style={{ 
                            padding: '8px 12px', 
                            background: 'rgba(255,255,255,0.03)', 
                            borderRadius: '6px',
                            borderLeft: '2px solid rgba(139, 92, 246, 0.3)',
                            fontStyle: 'italic'
                        }}>
                            "{item.action}"
                        </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className={`px-2 py-0.5 rounded ${
                            item.source === 'email' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                        }`}>
                            {item.source}
                        </span>
                        <span className={`px-2 py-0.5 rounded bg-white/5 ${typeMeta.color}`}>
                            {typeMeta.icon} {typeMeta.label}
                        </span>
                        {item.owner === 'assigned_to_me' && (
                            <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400">📥 For Me</span>
                        )}
                        {item.owner === 'delegated' && (
                            <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400">📤 Delegated</span>
                        )}
                        {item.deadlineLabel && (
                            <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-400">⏰ {item.deadlineLabel}</span>
                        )}
                        <span className="text-slate-500">{item.from}</span>
                        <span className="text-slate-500">{new Date(item.date).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Blockers Component
function BlockersView({ data }) {
    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Total Blockers" value={data.summary.total} icon="🚧" />
                <StatCard title="High Severity" value={data.summary.high} icon="🔴" />
                <StatCard title="Medium" value={data.summary.medium} icon="🟡" />
            </div>

            {/* Blockers List */}
            <div className="leadership-panel">
                <h3 className="leadership-panel-title">Identified Blockers</h3>
                <div className="space-y-3">
                    {data.blockers.map(blocker => (
                        <div key={blocker.id} className="leadership-breakdown-item">
                            <div className="flex items-start gap-3">
                                <div className={`mt-1 text-2xl ${
                                    blocker.severity === 'high' ? 'text-red-500' : 'text-yellow-500'
                                }`}>
                                    {blocker.severity === 'high' ? '🚨' : '⚠️'}
                                </div>
                                <div className="flex-1">
                                    <div className="text-white font-medium mb-1">{blocker.subject}</div>
                                    <div className="text-slate-400 text-sm mb-2">{blocker.snippet}</div>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {blocker.keywords.map(keyword => (
                                            <span key={keyword} className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span>{blocker.source}</span>
                                        <span>{blocker.from}</span>
                                        <span>{new Date(blocker.date).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Decisions Component
function DecisionsView({ data }) {
    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard title="Total Decisions" value={data.summary.total} icon="⚖️" />
                <StatCard title="This Week" value={data.summary.thisWeek} icon="📅" />
            </div>

            {/* Decisions List */}
            <div className="leadership-panel">
                <h3 className="leadership-panel-title">Recent Decisions</h3>
                <div className="space-y-3">
                    {data.decisions.map(decision => (
                        <div key={decision.id} className="leadership-breakdown-item">
                            <div className="flex items-start gap-3">
                                <div className="mt-1 text-2xl">✅</div>
                                <div className="flex-1">
                                    <div className="text-white font-medium mb-1">{decision.subject}</div>
                                    <div className="text-slate-400 text-sm mb-2">{decision.snippet}</div>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {decision.keywords.map(keyword => (
                                            <span key={keyword} className="px-2 py-0.5 rounded bg-green-500/20 text-green-400 text-xs">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        <span>{decision.source}</span>
                                        <span>{decision.from}</span>
                                        <span>{new Date(decision.date).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Stat Card Component
function StatCard({ title, value, subtitle, icon, valueClass = "leadership-stat-value", tooltip }) {
    const [showTooltip, setShowTooltip] = useState(false);
    
    return (
        <div 
            className="leadership-stat-card" 
            style={{ position: 'relative' }}
            onMouseEnter={() => tooltip && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="leadership-stat-title">
                    {title}
                    {tooltip && (
                        <span className="ml-1 text-slate-500 text-xs">ℹ️</span>
                    )}
                </div>
                {icon && <span className="leadership-stat-icon">{icon}</span>}
            </div>
            <div className={valueClass}>
                {value}
            </div>
            {subtitle && <div className="leadership-stat-subtitle">{subtitle}</div>}
            
            {/* Tooltip */}
            {tooltip && showTooltip && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '8px',
                    background: 'rgba(17, 24, 39, 0.98)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    width: '280px',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    color: 'var(--text-secondary)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                    zIndex: 1000,
                    pointerEvents: 'none'
                }}>
                    <div style={{
                        position: 'absolute',
                        bottom: '-6px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '12px',
                        height: '12px',
                        background: 'rgba(17, 24, 39, 0.98)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        borderTop: 'none',
                        borderLeft: 'none',
                        transform: 'translateX(-50%) rotate(45deg)'
                    }} />
                    {tooltip}
                </div>
            )}
        </div>
    );
}
