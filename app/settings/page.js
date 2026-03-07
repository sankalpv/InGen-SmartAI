'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Cloud, Cpu, ExternalLink, CheckCircle2, LogOut, User, FileText, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function SettingsPage() {
    const { data: session, status } = useSession();
    const isGoogleConnected = !!session?.user;
    
    // Theme
    const { theme, toggleTheme } = useTheme();

    // Phonetool alias state
    const [phonetoolAlias, setPhonetoolAlias] = useState('');
    const [aliasSaving, setAliasSaving] = useState(false);
    const [aliasMessage, setAliasMessage] = useState('');

    // Insight confidence threshold state
    const [confidenceThreshold, setConfidenceThreshold] = useState(0.7);
    const [thresholdLoading, setThresholdLoading] = useState(true);
    const [thresholdSaving, setThresholdSaving] = useState(false);
    const [thresholdMessage, setThresholdMessage] = useState('');
    
    // Quip settings state
    const [quipSettings, setQuipSettings] = useState({
        enabled: true,
        baseUrl: 'https://quip-amazon.com',
        maxDocsPerEmail: 5,
        timeoutSeconds: 30
    });
    const [quipLoading, setQuipLoading] = useState(true);
    const [quipSaving, setQuipSaving] = useState(false);
    const [quipMessage, setQuipMessage] = useState('');
    
    // Load settings on mount
    useEffect(() => {
        fetchQuipSettings();
        fetchConfidenceThreshold();
        fetchPhonetoolAlias();
    }, []);

    async function fetchPhonetoolAlias() {
        try {
            const res = await fetch('/api/settings/config');
            const data = await res.json();
            if (data.phonetoolAlias) {
                setPhonetoolAlias(data.phonetoolAlias);
            }
        } catch (error) {
            console.error('Failed to load phonetool alias:', error);
        }
    }

    async function savePhonetoolAlias() {
        setAliasSaving(true);
        setAliasMessage('');
        
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phonetoolAlias })
            });
            
            if (res.ok) {
                setAliasMessage('✅ Alias saved! Direct reports will appear in Leadership → Relationships tab.');
                setTimeout(() => setAliasMessage(''), 5000);
            } else {
                setAliasMessage('❌ Failed to save alias');
            }
        } catch (error) {
            setAliasMessage('❌ Failed to save alias');
        } finally {
            setAliasSaving(false);
        }
    }

    async function fetchConfidenceThreshold() {
        try {
            const res = await fetch('/api/settings/config');
            const data = await res.json();
            if (data.insightConfidenceThreshold !== undefined) {
                setConfidenceThreshold(data.insightConfidenceThreshold);
            }
        } catch (error) {
            console.error('Failed to load confidence threshold:', error);
        } finally {
            setThresholdLoading(false);
        }
    }

    async function saveConfidenceThreshold() {
        setThresholdSaving(true);
        setThresholdMessage('');
        
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ insightConfidenceThreshold: confidenceThreshold })
            });
            
            if (res.ok) {
                setThresholdMessage('✅ Confidence threshold saved');
                setTimeout(() => setThresholdMessage(''), 3000);
            } else {
                setThresholdMessage('❌ Failed to save threshold');
            }
        } catch (error) {
            setThresholdMessage('❌ Failed to save threshold');
        } finally {
            setThresholdSaving(false);
        }
    }
    
    async function fetchQuipSettings() {
        try {
            const res = await fetch('/api/settings/quip');
            const data = await res.json();
            if (data.quip) {
                setQuipSettings(data.quip);
            }
        } catch (error) {
            console.error('Failed to load Quip settings:', error);
        } finally {
            setQuipLoading(false);
        }
    }
    
    async function saveQuipSettings() {
        setQuipSaving(true);
        setQuipMessage('');
        
        try {
            const res = await fetch('/api/settings/quip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quipSettings)
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setQuipMessage('✅ Settings saved successfully');
                setTimeout(() => setQuipMessage(''), 3000);
            } else {
                setQuipMessage(`❌ Error: ${data.error}`);
            }
        } catch (error) {
            setQuipMessage('❌ Failed to save settings');
        } finally {
            setQuipSaving(false);
        }
    }

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

            {/* Appearance Section */}
            <div className="settings-section">
                <div className="settings-section-title">
                    <Sun size={20} />
                    Appearance
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: theme === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(251, 191, 36, 0.1)' }}>
                            {theme === 'dark' ? '🌙' : '☀️'}
                        </div>
                        <div className="settings-card-text">
                            <h3>Color Scheme</h3>
                            <p>Switch between dark and light mode. Your preference is saved locally.</p>
                        </div>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="btn btn-secondary"
                        style={{
                            minWidth: 140,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            justifyContent: 'center',
                        }}
                    >
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                </div>
            </div>

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
                    <FileText size={20} />
                    Document Context
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                            📄
                        </div>
                        <div className="settings-card-text">
                            <h3>Quip Document Reading</h3>
                            <p>Automatically fetch linked Quip documents to provide better context for AI-generated drafts and daily briefings</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={quipSettings.enabled}
                                onChange={(e) => setQuipSettings({ ...quipSettings, enabled: e.target.checked })}
                                disabled={quipLoading}
                                style={{ marginRight: '8px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                {quipSettings.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </label>
                    </div>
                </div>

                {quipSettings.enabled && (
                    <>
                        <div className="settings-card">
                            <div className="settings-card-info">
                                <div className="settings-card-text">
                                    <h3 style={{ fontSize: '0.95rem' }}>Base URL</h3>
                                    <input
                                        type="text"
                                        value={quipSettings.baseUrl}
                                        onChange={(e) => setQuipSettings({ ...quipSettings, baseUrl: e.target.value })}
                                        disabled={quipLoading}
                                        placeholder="https://quip-amazon.com"
                                        style={{
                                            width: '100%',
                                            padding: '8px 12px',
                                            marginTop: '8px',
                                            borderRadius: '6px',
                                            border: '1px solid var(--glass-border)',
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.9rem'
                                        }}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="settings-card" style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Max Docs Per Email</h3>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={quipSettings.maxDocsPerEmail}
                                    onChange={(e) => setQuipSettings({ ...quipSettings, maxDocsPerEmail: parseInt(e.target.value) })}
                                    disabled={quipLoading}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--glass-border)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Timeout (seconds)</h3>
                                <input
                                    type="number"
                                    min="5"
                                    max="120"
                                    value={quipSettings.timeoutSeconds}
                                    onChange={(e) => setQuipSettings({ ...quipSettings, timeoutSeconds: parseInt(e.target.value) })}
                                    disabled={quipLoading}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--glass-border)',
                                        background: 'var(--bg-secondary)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.9rem'
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={saveQuipSettings}
                            disabled={quipSaving || quipLoading}
                            style={{ width: '100%', marginTop: '8px' }}
                        >
                            {quipSaving ? 'Saving...' : 'Save Quip Settings'}
                        </button>

                        {quipMessage && (
                            <div style={{
                                padding: '12px',
                                marginTop: '12px',
                                borderRadius: '8px',
                                background: quipMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${quipMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                fontSize: '0.9rem',
                                textAlign: 'center'
                            }}>
                                {quipMessage}
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">
                    <User size={20} />
                    Team Settings
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                            👥
                        </div>
                        <div className="settings-card-text">
                            <h3>Phonetool Alias</h3>
                            <p>Enter your Amazon alias to automatically fetch your direct reports and track relationship health with your team.</p>
                            <input
                                type="text"
                                value={phonetoolAlias}
                                onChange={(e) => setPhonetoolAlias(e.target.value)}
                                placeholder="e.g. sankalpv"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    marginTop: '8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--glass-border)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.9rem'
                                }}
                            />
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={savePhonetoolAlias}
                    disabled={aliasSaving}
                    style={{ width: '100%', marginTop: '8px' }}
                >
                    {aliasSaving ? 'Saving...' : 'Save Alias & Fetch Team'}
                </button>

                {aliasMessage && (
                    <div style={{
                        padding: '12px',
                        marginTop: '12px',
                        borderRadius: '8px',
                        background: aliasMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${aliasMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {aliasMessage}
                    </div>
                )}
            </div>

            <div className="settings-section">
                <div className="settings-section-title">
                    <Cpu size={20} />
                    Insight Settings
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                            🎯
                        </div>
                        <div className="settings-card-text">
                            <h3>Confidence Threshold</h3>
                            <p>Minimum confidence level for showing insights (0.5 = more insights, 0.9 = fewer but higher quality)</p>
                            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="0.9"
                                    step="0.05"
                                    value={confidenceThreshold}
                                    onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                                    disabled={thresholdLoading}
                                    style={{ flex: 1, cursor: 'pointer' }}
                                />
                                <span style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: 'var(--accent-purple)',
                                    minWidth: '60px',
                                    textAlign: 'right'
                                }}>
                                    {(confidenceThreshold * 100).toFixed(0)}%
                                </span>
                            </div>
                            <div style={{
                                marginTop: '12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                color: 'var(--text-tertiary)'
                            }}>
                                <span>More insights</span>
                                <span>Fewer insights</span>
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={saveConfidenceThreshold}
                    disabled={thresholdSaving || thresholdLoading}
                    style={{ width: '100%', marginTop: '8px' }}
                >
                    {thresholdSaving ? 'Saving...' : 'Save Threshold'}
                </button>

                {thresholdMessage && (
                    <div style={{
                        padding: '12px',
                        marginTop: '12px',
                        borderRadius: '8px',
                        background: thresholdMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${thresholdMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {thresholdMessage}
                    </div>
                )}
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
