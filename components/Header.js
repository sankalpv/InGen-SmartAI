'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Zap, Settings, Bell } from 'lucide-react';
import SettingsModal from './SettingsModal';
import InsightFeed from './InsightFeed';

export default function Header({ onRefresh, isLoading, onShowRetro }) {
    const [agentStatus, setAgentStatus] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showInsightFeed, setShowInsightFeed] = useState(false);
    const [insightStats, setInsightStats] = useState({ unread: 0, urgent: 0 });
    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

    useEffect(() => {
        fetch('/api/agent-status')
            .then(res => res.json())
            .then(data => setAgentStatus(data))
            .catch(err => console.error('Failed to fetch agent status:', err));

        // Fetch initial insight stats
        fetchInsightStats();

        // Poll for new insights every 30 seconds
        const pollInterval = setInterval(fetchInsightStats, 30000);
        return () => clearInterval(pollInterval);
    }, []);

    const fetchInsightStats = async () => {
        try {
            const res = await fetch('/api/insights?status=unread');
            const data = await res.json();
            const urgentCount = data.insights?.filter(i => i.priority === 'urgent').length || 0;
            setInsightStats({
                unread: data.count || 0,
                urgent: urgentCount
            });
        } catch (error) {
            console.error('Failed to fetch insight stats:', error);
        }
    };

    function getTimeSince(dateStr) {
        if (!dateStr) return 'Never';
        const diff = Math.floor((new Date() - new Date(dateStr)) / 1000 / 60);
        if (diff < 1) return 'Just now';
        return `${diff}m ago`;
    }

    return (
        <header className="dashboard-header">
            <div className="header-top">
                <div>
                    <h2 className="header-greeting">
                        <span className="wave">👋</span> {greeting}!
                    </h2>
                    <p className="header-date">{dateStr} · {timeStr}</p>

                    {agentStatus && agentStatus.active && (
                        <div className="agent-status-badge animate-in" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginTop: '8px',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            color: '#10b981',
                            fontSize: '12px',
                            fontWeight: '500'
                        }}>
                            <Zap size={12} fill="#10b981" />
                            Auto-Pilot Active · Synced {getTimeSince(agentStatus.lastSync)}
                        </div>
                    )}
                </div>
                <div className="header-actions">
                    <button
                        className="btn"
                        onClick={() => setShowInsightFeed(true)}
                        style={{
                            marginRight: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-secondary)',
                            width: '36px',
                            padding: '0',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            position: 'relative'
                        }}
                        title="AI Insights"
                    >
                        <Bell size={18} />
                        {insightStats.unread > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                background: insightStats.urgent > 0 ? '#ef4444' : '#8b5cf6',
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: '600',
                                padding: '2px 5px',
                                borderRadius: '10px',
                                minWidth: '18px',
                                textAlign: 'center',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                animation: insightStats.urgent > 0 ? 'pulse 2s ease-in-out infinite' : 'none'
                            }}>
                                {insightStats.unread}
                            </span>
                        )}
                    </button>

                    <button
                        className="btn"
                        onClick={() => setShowSettings(true)}
                        style={{
                            marginRight: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-secondary)',
                            width: '36px',
                            padding: '0',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                        title="Settings"
                    >
                        <Settings size={18} />
                    </button>

                </div>
            </div>

            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
            <InsightFeed 
                isOpen={showInsightFeed} 
                onClose={() => {
                    setShowInsightFeed(false);
                    fetchInsightStats(); // Refresh stats when closing
                }} 
            />

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.8;
                        transform: scale(1.05);
                    }
                }
            `}</style>
        </header>
    );
}

// Simple fallback icon if not imported, though I should have fixed the import up top for WeeklyRetro...
// Actually I missed the import for the icon that was already there. 
// The original code had: <RefreshCw size={16} /> for "Weekly Review".
// I replaced it with just <Settings> button and re-added the others.
// Correcting the button content to match original for Weekly Review:
function WeeklyRetroIcon(props) { return <RefreshCw {...props} />; }
