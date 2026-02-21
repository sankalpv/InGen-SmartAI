'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, Target, ThumbsUp, ThumbsDown, Activity, BarChart2, PieChart } from 'lucide-react';
import Link from 'next/link';

export default function InsightsAnalytics() {
    const [analytics, setAnalytics] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [timeRange, setTimeRange] = useState(30);

    useEffect(() => {
        fetchAnalytics();
    }, [timeRange]);

    const fetchAnalytics = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/insights/analytics?days=${timeRange}`);
            const data = await res.json();
            setAnalytics(data);
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)'
            }}>
                Loading analytics...
            </div>
        );
    }

    const readRate = analytics?.totalInsights > 0 
        ? ((analytics.readInsights / analytics.totalInsights) * 100).toFixed(1)
        : 0;

    const actionRate = analytics?.totalInsights > 0
        ? ((analytics.actedInsights / analytics.totalInsights) * 100).toFixed(1)
        : 0;

    const feedbackRate = analytics?.totalInsights > 0
        ? ((analytics.feedbackInsights / analytics.totalInsights) * 100).toFixed(1)
        : 0;

    const helpfulRate = analytics?.feedbackInsights > 0
        ? ((analytics.helpfulFeedback / analytics.feedbackInsights) * 100).toFixed(1)
        : 0;

    return (
        <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <Link href="/" style={{ 
                    color: 'var(--accent-purple)', 
                    fontSize: '14px', 
                    textDecoration: 'none',
                    display: 'inline-block',
                    marginBottom: '16px'
                }}>
                    ← Back to Dashboard
                </Link>
                <h1 style={{
                    fontSize: '32px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '8px'
                }}>
                    Insight Analytics
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
                    Track AI insight performance and engagement
                </p>

                {/* Time Range Selector */}
                <div style={{ marginTop: '16px' }}>
                    {[7, 30, 90].map(days => (
                        <button
                            key={days}
                            onClick={() => setTimeRange(days)}
                            style={{
                                padding: '8px 16px',
                                marginRight: '8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: timeRange === days ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                color: timeRange === days ? '#a78bfa' : 'var(--text-secondary)',
                                fontSize: '14px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            Last {days} days
                        </button>
                    ))}
                </div>
            </div>

            {/* Key Metrics */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                marginBottom: '32px'
            }}>
                <MetricCard
                    icon={<Activity size={24} />}
                    title="Total Insights"
                    value={analytics?.totalInsights || 0}
                    color="#8b5cf6"
                />
                <MetricCard
                    icon={<Target size={24} />}
                    title="Read Rate"
                    value={`${readRate}%`}
                    subtitle={`${analytics?.readInsights || 0} read`}
                    color="#3b82f6"
                />
                <MetricCard
                    icon={<TrendingUp size={24} />}
                    title="Action Rate"
                    value={`${actionRate}%`}
                    subtitle={`${analytics?.actedInsights || 0} acted`}
                    color="#10b981"
                />
                <MetricCard
                    icon={<ThumbsUp size={24} />}
                    title="Helpful Rate"
                    value={`${helpfulRate}%`}
                    subtitle={`${analytics?.feedbackInsights || 0} feedback`}
                    color="#22c55e"
                />
            </div>

            {/* By Type */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px'
            }}>
                <h3 style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <BarChart2 size={20} color="#8b5cf6" />
                    Insights by Type
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {analytics?.byType && Object.entries(analytics.byType).map(([type, data]) => {
                        const rate = data.total > 0 ? ((data.acted / data.total) * 100).toFixed(0) : 0;
                        return (
                            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ 
                                    minWidth: '160px',
                                    fontSize: '14px', 
                                    color: 'var(--text-primary)',
                                    textTransform: 'capitalize'
                                }}>
                                    {type.replace('_', ' ')}
                                </div>
                                <div style={{ flex: 1, position: 'relative', height: '24px' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        height: '100%',
                                        width: '100%',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '6px'
                                    }} />
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        height: '100%',
                                        width: `${(data.total / (analytics.totalInsights || 1)) * 100}%`,
                                        background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                                        borderRadius: '6px',
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                                <div style={{
                                    minWidth: '100px',
                                    fontSize: '13px',
                                    color: 'var(--text-secondary)',
                                    textAlign: 'right'
                                }}>
                                    {data.total} total · {rate}% action
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* By Priority */}
            <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '24px'
            }}>
                <h3 style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <PieChart size={20} color="#f97316" />
                    Insights by Priority
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {analytics?.byPriority && Object.entries(analytics.byPriority).map(([priority, data]) => {
                        const colors = {
                            urgent: '#ef4444',
                            high: '#f97316',
                            medium: '#3b82f6',
                            low: '#6b7280'
                        };
                        const color = colors[priority] || '#6b7280';
                        const rate = data.total > 0 ? ((data.acted / data.total) * 100).toFixed(0) : 0;

                        return (
                            <div key={priority} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ 
                                    minWidth: '100px',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    {priority}
                                </div>
                                <div style={{ flex: 1, position: 'relative', height: '24px' }}>
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        height: '100%',
                                        width: '100%',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: '6px'
                                    }} />
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        height: '100%',
                                        width: `${(data.total / (analytics.totalInsights || 1)) * 100}%`,
                                        background: `${color}40`,
                                        borderRadius: '6px',
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                                <div style={{
                                    minWidth: '100px',
                                    fontSize: '13px',
                                    color: 'var(--text-secondary)',
                                    textAlign: 'right'
                                }}>
                                    {data.total} total · {rate}% action
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function MetricCard({ icon, title, value, subtitle, color }) {
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '20px',
            transition: 'all 0.2s ease'
        }}>
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                marginBottom: '12px'
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: `${color}15`,
                    border: `1px solid ${color}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color
                }}>
                    {icon}
                </div>
                <div>
                    <div style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        marginBottom: '4px',
                        fontWeight: '500'
                    }}>
                        {title}
                    </div>
                    <div style={{
                        fontSize: '28px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        lineHeight: '1'
                    }}>
                        {value}
                    </div>
                    {subtitle && (
                        <div style={{
                            fontSize: '12px',
                            color: 'var(--text-tertiary)',
                            marginTop: '4px'
                        }}>
                            {subtitle}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}