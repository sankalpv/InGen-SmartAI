'use client';

import { useState, useEffect } from 'react';
import { X, Lightbulb, AlertCircle, Calendar, Mail, TrendingUp } from 'lucide-react';

export default function InsightNotifications({ onInsightClick }) {
    const [toasts, setToasts] = useState([]);
    const [lastChecked, setLastChecked] = useState(Date.now());

    useEffect(() => {
        // Poll for new insights every 30 seconds
        const pollInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/insights?status=unread&priority=urgent,high');
                const data = await res.json();
                
                if (data.insights && data.insights.length > 0) {
                    // Filter out insights we've already shown
                    const newInsights = data.insights.filter(insight => {
                        const createdAt = new Date(insight.created_at).getTime();
                        return createdAt > lastChecked;
                    });

                    if (newInsights.length > 0) {
                        // Add new insights as toasts
                        newInsights.forEach(insight => {
                            addToast(insight);
                        });
                        setLastChecked(Date.now());
                    }
                }
            } catch (error) {
                console.error('Failed to poll insights:', error);
            }
        }, 30000); // 30 seconds

        return () => clearInterval(pollInterval);
    }, [lastChecked]);

    const addToast = (insight) => {
        const id = `toast-${insight.id}-${Date.now()}`;
        const toast = {
            id,
            insight,
            timer: null
        };

        setToasts(prev => [...prev, toast]);

        // Auto-dismiss after 10 seconds
        const timer = setTimeout(() => {
            removeToast(id);
        }, 10000);

        setToasts(prev => prev.map(t => 
            t.id === id ? { ...t, timer } : t
        ));
    };

    const removeToast = (toastId) => {
        setToasts(prev => {
            const toast = prev.find(t => t.id === toastId);
            if (toast?.timer) {
                clearTimeout(toast.timer);
            }
            return prev.filter(t => t.id !== toastId);
        });
    };

    const handleToastClick = (insight) => {
        if (onInsightClick) {
            onInsightClick(insight);
        }
    };

    const handleDismiss = async (toastId, insightId) => {
        removeToast(toastId);
        
        try {
            await fetch('/api/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: insightId, action: 'read' })
            });
        } catch (error) {
            console.error('Failed to mark insight as read:', error);
        }
    };

    const getIcon = (type) => {
        switch (type) {
            case 'meeting_prep':
                return Calendar;
            case 'email_priority':
                return Mail;
            case 'contextual':
                return Lightbulb;
            case 'relationship':
                return TrendingUp;
            case 'weekly_report':
                return TrendingUp;
            default:
                return AlertCircle;
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'urgent':
                return '#ef4444'; // red
            case 'high':
                return '#f97316'; // orange
            case 'medium':
                return '#3b82f6'; // blue
            case 'low':
                return '#6b7280'; // gray
            default:
                return '#6b7280';
        }
    };

    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '12px',
            maxWidth: '400px',
        }}>
            {toasts.map(({ id, insight }) => {
                const Icon = getIcon(insight.type);
                const priorityColor = getPriorityColor(insight.priority);

                return (
                    <div
                        key={id}
                        className="insight-toast"
                        style={{
                            background: 'rgba(17, 24, 39, 0.95)',
                            backdropFilter: 'blur(40px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '16px',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            animation: 'slideInRight 0.3s ease',
                        }}
                        onClick={() => handleToastClick(insight)}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateX(-4px)';
                            e.currentTarget.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateX(0)';
                            e.currentTarget.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.3)';
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
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

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    marginBottom: '4px'
                                }}>
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
                                </div>

                                <h4 style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: 'var(--text-primary)',
                                    marginBottom: '4px',
                                    lineHeight: '1.4',
                                }}>
                                    {insight.title}
                                </h4>

                                <p style={{
                                    fontSize: '13px',
                                    color: 'var(--text-secondary)',
                                    lineHeight: '1.5',
                                    margin: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                }}>
                                    {insight.description}
                                </p>
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDismiss(id, insight.id);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-tertiary)',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '4px',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-tertiary)';
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                );
            })}

            <style jsx>{`
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `}</style>
        </div>
    );
}