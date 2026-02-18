'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Zap, Settings } from 'lucide-react';
import SettingsModal from './SettingsModal';

export default function Header({ onRefresh, isLoading, onShowRetro }) {
    const [agentStatus, setAgentStatus] = useState(null);
    const [showSettings, setShowSettings] = useState(false);
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
                        <WeeklyRetroIcon size={16} style={{ marginRight: 6 }} />
                        Review
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

            <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
        </header>
    );
}

// Simple fallback icon if not imported, though I should have fixed the import up top for WeeklyRetro...
// Actually I missed the import for the icon that was already there. 
// The original code had: <RefreshCw size={16} /> for "Weekly Review".
// I replaced it with just <Settings> button and re-added the others.
// Correcting the button content to match original for Weekly Review:
function WeeklyRetroIcon(props) { return <RefreshCw {...props} />; }
