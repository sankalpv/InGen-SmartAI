'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Zap } from 'lucide-react';

export default function Header({ onRefresh, isLoading, onShowRetro }) {
    const [agentStatus, setAgentStatus] = useState(null);
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
    }, []);

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
                        onClick={onShowRetro}
                        style={{
                            marginRight: '12px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-secondary)'
                        }}
                    >
                        <RefreshCw size={16} />
                        Weekly Review
                    </button>

                    <button
                        className="btn btn-primary"
                        onClick={onRefresh}
                        disabled={isLoading}
                    >
                        <RefreshCw size={16} className={isLoading ? 'loading-spinner' : ''} />
                        {isLoading ? 'Analyzing...' : 'Generate Daily Brief'}
                    </button>
                </div>
            </div>
        </header>
    );
}
