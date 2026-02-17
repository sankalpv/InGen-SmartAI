'use client';

import { useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Cloud, Cpu, ExternalLink, CheckCircle2, LogOut, User } from 'lucide-react';

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const isGoogleConnected = !!session?.user;

    const handleGoogleConnect = () => {
        signIn('google', { callbackUrl: '/settings' });
    };

    const handleGoogleDisconnect = () => {
        signOut({ callbackUrl: '/settings' });
    };

    const integrations = [
        {
            id: 'gmail',
            name: 'Gmail & Google Calendar',
            description: isGoogleConnected
                ? `Connected as ${session.user.email}`
                : 'Connect your Google account to monitor emails and Calendar',
            icon: '📧',
            bgColor: 'rgba(234, 67, 53, 0.1)',
            scopes: ['Gmail API', 'Google Calendar API'],
            connected: isGoogleConnected,
            onConnect: handleGoogleConnect,
            onDisconnect: handleGoogleDisconnect,
        },
        {
            id: 'outlook',
            name: 'Microsoft Outlook',
            description: 'Connect your Outlook account for emails and calendar via Microsoft Graph',
            icon: '📬',
            bgColor: 'rgba(0, 120, 212, 0.1)',
            scopes: ['Mail.Read', 'Calendars.Read'],
            connected: false,
            onConnect: () => { },
            disabled: true,
        },
        {
            id: 'slack',
            name: 'Slack',
            description: 'Connect your Slack workspace to monitor DMs and channel mentions',
            icon: '💬',
            bgColor: 'rgba(74, 21, 75, 0.1)',
            scopes: ['channels:history', 'im:history', 'users:read'],
            connected: false,
            onConnect: () => { },
            disabled: true,
        },
        {
            id: 'openai',
            name: 'AI Engine (OpenAI)',
            description: process.env.NEXT_PUBLIC_OPENAI_CONFIGURED === 'true'
                ? 'AI engine active — GPT-4o'
                : 'Using mock AI responses (no API key configured)',
            icon: '🧠',
            bgColor: 'rgba(16, 163, 127, 0.1)',
            scopes: ['GPT-4o', 'Chat Completions API'],
            connected: false,
            onConnect: () => { },
            disabled: true,
        },
    ];

    return (
        <div className="settings-page">
            <h2 className="header-greeting" style={{ marginBottom: 8 }}>⚙️ Settings</h2>
            <p className="header-date" style={{ marginBottom: 32 }}>
                Connect your accounts and configure SmartAI
            </p>

            {/* User Profile Card */}
            {isGoogleConnected && (
                <div className="settings-card" style={{ marginBottom: 24, borderColor: 'rgba(52, 211, 153, 0.3)' }}>
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(52, 211, 153, 0.1)' }}>
                            {session.user.image ? (
                                <img
                                    src={session.user.image}
                                    alt=""
                                    style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)' }}
                                />
                            ) : (
                                <User size={22} />
                            )}
                        </div>
                        <div className="settings-card-text">
                            <h3>{session.user.name || 'Connected User'}</h3>
                            <p>Signed in with Google · {session.user.email}</p>
                        </div>
                    </div>
                    <button className="btn btn-secondary" onClick={handleGoogleDisconnect}>
                        <LogOut size={14} />
                        Sign Out
                    </button>
                </div>
            )}

            <div className="settings-section">
                <div className="settings-section-title">
                    <Cloud size={20} />
                    Connected Accounts
                </div>

                {integrations.map((integration) => (
                    <div key={integration.id} className="settings-card">
                        <div className="settings-card-info">
                            <div
                                className="settings-card-icon"
                                style={{ background: integration.bgColor }}
                            >
                                {integration.icon}
                            </div>
                            <div className="settings-card-text">
                                <h3>{integration.name}</h3>
                                <p>{integration.description}</p>
                                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {integration.scopes.map((scope) => (
                                        <span
                                            key={scope}
                                            style={{
                                                padding: '2px 8px',
                                                borderRadius: 6,
                                                background: 'var(--bg-tertiary)',
                                                fontSize: '0.7rem',
                                                color: 'var(--text-tertiary)',
                                            }}
                                        >
                                            {scope}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {integration.connected ? (
                            <button
                                className="btn btn-secondary"
                                onClick={integration.onDisconnect}
                                style={{ minWidth: 120 }}
                            >
                                <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
                                Connected
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={integration.onConnect}
                                disabled={integration.disabled}
                                style={{ minWidth: 120, opacity: integration.disabled ? 0.5 : 1 }}
                            >
                                <ExternalLink size={14} />
                                {integration.disabled ? 'Coming Soon' : 'Connect'}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">
                    <Cpu size={20} />
                    AI Preferences
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(168, 85, 247, 0.1)' }}>
                            ✨
                        </div>
                        <div className="settings-card-text">
                            <h3>AI Analysis Mode</h3>
                            <p>Currently using: Mock data (no API key configured)</p>
                        </div>
                    </div>
                    <span className="priority-badge medium">Mock Mode</span>
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(79, 140, 255, 0.1)' }}>
                            📊
                        </div>
                        <div className="settings-card-text">
                            <h3>Data Source</h3>
                            <p>{isGoogleConnected
                                ? 'Using live data from Google (set USE_MOCK_DATA=false to activate)'
                                : 'Connect Google account to enable live data'
                            }</p>
                        </div>
                    </div>
                    <span className={`priority-badge ${isGoogleConnected ? 'high' : 'low'}`}>
                        {isGoogleConnected ? 'Ready' : 'Mock Only'}
                    </span>
                </div>
            </div>

            <div className="ai-briefing" style={{ marginTop: 32 }}>
                <div className="ai-briefing-header">
                    <div className="ai-badge">
                        <span className="sparkle">💡</span>
                        {isGoogleConnected ? 'Next Steps' : 'Getting Started'}
                    </div>
                </div>
                <p className="ai-briefing-text" style={{ fontSize: '0.9rem' }}>
                    {isGoogleConnected ? (
                        <>
                            Google account connected! To see your real emails and calendar: set{' '}
                            <code style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', fontSize: '0.8rem' }}>
                                USE_MOCK_DATA=false
                            </code>{' '}
                            in your <code style={{ padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', fontSize: '0.8rem' }}>.env.local</code> file and restart the dev server.
                        </>
                    ) : (
                        <>
                            SmartAI is running with <strong>mock data</strong>. Click{' '}
                            <strong>Connect</strong> on Gmail to sign in with your Google account and start
                            seeing real data.
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}
