'use client';

import { useState, useEffect } from 'react';
import { X, Lightbulb, AlertCircle, Calendar, Mail, TrendingUp, Filter, Eye, EyeOff, Trash2, CheckCircle, ThumbsUp, ThumbsDown } from 'lucide-react';

export default function InsightFeed({ isOpen, onClose, initialInsight = null }) {
    const [activeTab, setActiveTab] = useState('unread');
    const [insights, setInsights] = useState([]);
    const [stats, setStats] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [expandedInsight, setExpandedInsight] = useState(initialInsight?.id || null);

    useEffect(() => {
        if (isOpen) {
            fetchInsights();
        }
    }, [isOpen, activeTab, typeFilter, priorityFilter]);

    useEffect(() => {
        if (initialInsight) {
            setExpandedInsight(initialInsight.id);
        }
    }, [initialInsight]);

    const fetchInsights = async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ status: activeTab });
            if (typeFilter !== 'all') params.append('type', typeFilter);
            if (priorityFilter !== 'all') params.append('priority', priorityFilter);

            const res = await fetch(`/api/insights?${params}`);
            const data = await res.json();
            setInsights(data.insights || []);
            setStats(data.stats || {});
        } catch (error) {
            console.error('Failed to fetch insights:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async (insightId, action, actionType = null) => {
        try {
            await fetch('/api/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: insightId, action, actionType })
            });
            await fetchInsights(); // Refresh
        } catch (error) {
            console.error(`Failed to ${action} insight:`, error);
        }
    };

    const handleFeedback = async (insightId, score) => {
        try {
            await fetch('/api/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: insightId, action: 'feedback', score })
            });
            await fetchInsights(); // Refresh
        } catch (error) {
            console.error('Failed to submit feedback:', error);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'meeting_prep': return Calendar;
            case 'email_priority': return Mail;
            case 'contextual': return Lightbulb;
            case 'relationship': return TrendingUp;
            case 'weekly_report': return TrendingUp;
            default: return AlertCircle;
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent': return '#ef4444';
            case 'high': return '#f97316';
            case 'medium': return '#3b82f6';
            case 'low': return '#6b7280';
            default: return '#6b7280';
        }
    };

    const formatTimestamp = (timestamp) => {
        const now = new Date();
        const date = new Date(timestamp);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    if (!isOpen) return null;

    const urgentCount = stats.byPriority?.urgent || 0;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
        }} onClick={onClose}>
            <div style={{
                background: 'rgba(17, 24, 39, 0.95)',
                backdropFilter: 'blur(40px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '900px',
                maxHeight: '90vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div>
                        <h2 style={{
                            fontSize: '24px',
                            fontWeight: '600',
                            color: 'var(--text-primary)',
                            margin: 0,
                            marginBottom: '4px',
                        }}>
                            AI Insights
                        </h2>
                        <p style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            margin: 0,
                        }}>
                            {stats.unread || 0} unread insights
                            {urgentCount > 0 && <span style={{ color: '#ef4444', marginLeft: '8px' }}>· {urgentCount} urgent</span>}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs & Filters */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    gap: '16px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['unread', 'all', 'dismissed'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: activeTab === tab ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                                    color: activeTab === tab ? '#a78bfa' : 'var(--text-secondary)',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    textTransform: 'capitalize',
                                }}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="all">All Types</option>
                            <option value="meeting_prep">Meeting Prep</option>
                            <option value="email_priority">Email Priority</option>
                            <option value="contextual">Contextual</option>
                            <option value="relationship">Relationships</option>
                            <option value="weekly_report">Weekly Report</option>
                        </select>

                        <select
                            value={priorityFilter}
                            onChange={(e) => setPriorityFilter(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="all">All Priorities</option>
                            <option value="urgent">Urgent</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>

                {/* Insights List */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 24px',
                }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                            Loading insights...
                        </div>
                    ) : insights.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                No insights to show
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {insights.map(insight => {
                                const Icon = getIcon(insight.type);
                                const priorityColor = getPriorityColor(insight.priority);
                                const isExpanded = expandedInsight === insight.id;

                                return (
                                    <div
                                        key={insight.id}
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: '12px',
                                            padding: '16px',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <div style={{
                                                minWidth: '40px',
                                                height: '40px',
                                                borderRadius: '10px',
                                                background: `${priorityColor}15`,
                                                border: `1px solid ${priorityColor}30`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}>
                                                <Icon size={20} color={priorityColor} />
                                            </div>

                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: '600',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        color: priorityColor,
                                                    }}>
                                                        {insight.priority}
                                                    </span>
                                                    {insight.confidence >= 0.8 && (
                                                        <span style={{
                                                            fontSize: '10px',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            background: 'rgba(16, 185, 129, 0.15)',
                                                            color: '#10b981',
                                                            fontWeight: '500',
                                                        }}>
                                                            High Confidence
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        fontSize: '12px',
                                                        color: 'var(--text-tertiary)',
                                                        marginLeft: 'auto',
                                                    }}>
                                                        {formatTimestamp(insight.created_at)}
                                                    </span>
                                                </div>

                                                <h4 style={{
                                                    fontSize: '15px',
                                                    fontWeight: '600',
                                                    color: 'var(--text-primary)',
                                                    marginBottom: '6px',
                                                    lineHeight: '1.4',
                                                }}>
                                                    {insight.title}
                                                </h4>

                                                <p style={{
                                                    fontSize: '14px',
                                                    color: 'var(--text-secondary)',
                                                    lineHeight: '1.6',
                                                    margin: 0,
                                                    marginBottom: '12px',
                                                }}>
                                                    {insight.description}
                                                </p>

                                                {isExpanded && insight.reasoning && (
                                                    <div style={{
                                                        background: 'rgba(139, 92, 246, 0.08)',
                                                        border: '1px solid rgba(139, 92, 246, 0.2)',
                                                        borderRadius: '8px',
                                                        padding: '12px',
                                                        marginBottom: '12px',
                                                    }}>
                                                        <div style={{
                                                            fontSize: '11px',
                                                            fontWeight: '600',
                                                            textTransform: 'uppercase',
                                                            color: '#a78bfa',
                                                            marginBottom: '6px',
                                                            letterSpacing: '0.5px',
                                                        }}>
                                                            AI Reasoning
                                                        </div>
                                                        <p style={{
                                                            fontSize: '13px',
                                                            color: 'var(--text-secondary)',
                                                            lineHeight: '1.6',
                                                            margin: 0,
                                                        }}>
                                                            {insight.reasoning}
                                                        </p>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button
                                                        onClick={() => setExpandedInsight(isExpanded ? null : insight.id)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            borderRadius: '6px',
                                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                                            background: 'rgba(255, 255, 255, 0.05)',
                                                            color: 'var(--text-secondary)',
                                                            fontSize: '12px',
                                                            fontWeight: '500',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s ease',
                                                        }}
                                                    >
                                                        {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        {isExpanded ? 'Hide Details' : 'View Details'}
                                                    </button>

                                                    {!insight.read_at && (
                                                        <button
                                                            onClick={() => handleAction(insight.id, 'read')}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                                                background: 'rgba(16, 185, 129, 0.1)',
                                                                color: '#10b981',
                                                                fontSize: '12px',
                                                                fontWeight: '500',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                transition: 'all 0.2s ease',
                                                            }}
                                                        >
                                                            <CheckCircle size={14} />
                                                            Mark as Read
                                                        </button>
                                                    )}

                                                    {!insight.dismissed_at && (
                                                        <button
                                                            onClick={() => handleAction(insight.id, 'dismiss')}
                                                            style={{
                                                                padding: '6px 12px',
                                                                borderRadius: '6px',
                                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                color: '#ef4444',
                                                                fontSize: '12px',
                                                                fontWeight: '500',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                transition: 'all 0.2s ease',
                                                            }}
                                                        >
                                                            <Trash2 size={14} />
                                                            Dismiss
                                                        </button>
                                                    )}

                                                    {/* Feedback Buttons */}
                                                    {insight.read_at && !insight.feedback_score && (
                                                        <>
                                                            <div style={{
                                                                width: '1px',
                                                                height: '24px',
                                                                background: 'rgba(255, 255, 255, 0.1)',
                                                                margin: '0 4px'
                                                            }} />
                                                            <button
                                                                onClick={() => handleFeedback(insight.id, 1)}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                                                    background: 'rgba(34, 197, 94, 0.1)',
                                                                    color: '#22c55e',
                                                                    fontSize: '12px',
                                                                    fontWeight: '500',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    transition: 'all 0.2s ease',
                                                                }}
                                                                title="This was helpful"
                                                            >
                                                                <ThumbsUp size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleFeedback(insight.id, -1)}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                                    color: '#ef4444',
                                                                    fontSize: '12px',
                                                                    fontWeight: '500',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    transition: 'all 0.2s ease',
                                                                }}
                                                                title="This was not helpful"
                                                            >
                                                                <ThumbsDown size={14} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Show feedback status */}
                                                    {insight.feedback_score && (
                                                        <span style={{
                                                            fontSize: '11px',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            background: insight.feedback_score > 0 
                                                                ? 'rgba(34, 197, 94, 0.15)' 
                                                                : 'rgba(239, 68, 68, 0.15)',
                                                            color: insight.feedback_score > 0 ? '#22c55e' : '#ef4444',
                                                            fontWeight: '500',
                                                            marginLeft: '8px',
                                                        }}>
                                                            Feedback: {insight.feedback_score > 0 ? 'Helpful 👍' : 'Not helpful 👎'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}