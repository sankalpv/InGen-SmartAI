'use client';

import { useState, useEffect } from 'react';
import { Cloud, Cpu, ExternalLink, CheckCircle2, User, FileText, Sun, Moon, Database, Download, Shield, Trash2, HardDrive, Zap } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function SettingsPage() {
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

    // AI Temperature state
    const [aiTemperature, setAiTemperature] = useState(0.25);
    const [aiTempSaving, setAiTempSaving] = useState(false);
    const [aiTempMessage, setAiTempMessage] = useState('');
    
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

    // WBR/Team Goals settings state
    const [wbrSettings, setWbrSettings] = useState({
        roomId: '', folderId: '', goalPrefix: '', title: ''
    });
    const [wbrLoading, setWbrLoading] = useState(true);
    const [wbrSaving, setWbrSaving] = useState(false);
    const [wbrMessage, setWbrMessage] = useState('');

    // Org sync state
    const [orgStatus, setOrgStatus] = useState(null);
    const [orgSyncing, setOrgSyncing] = useState(false);
    const [orgMessage, setOrgMessage] = useState('');

    // Bulk Export state
    const [bulkStatus, setBulkStatus] = useState(null);
    const [bulkExtracting, setBulkExtracting] = useState(false);
    const [bulkIngesting, setBulkIngesting] = useState(false);
    const [bulkMessage, setBulkMessage] = useState('');

    // Data audit state
    const [dataAudit, setDataAudit] = useState(null);
    const [clearingData, setClearingData] = useState(false);
    const [clearMessage, setClearMessage] = useState('');

    // AI Provider / Bedrock state
    const [bedrockSettings, setBedrockSettings] = useState({
        region: 'us-west-2',
        modelId: 'us.anthropic.claude-sonnet-4-20250514-v1:0',
        maxTokens: 8192,
    });
    const [bedrockLoading, setBedrockLoading] = useState(true);
    const [bedrockSaving, setBedrockSaving] = useState(false);
    const [bedrockMessage, setBedrockMessage] = useState('');
    
    // Load settings on mount
    useEffect(() => {
        fetchDataAudit();
        fetchQuipSettings();
        fetchConfidenceThreshold();
        fetchAiTemperature();
        fetchPhonetoolAlias();
        fetchWbrSettings();
        fetchOrgStatus();
        fetchBulkStatus();
        fetchBedrockSettings();
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
    
    async function fetchAiTemperature() {
        try {
            const res = await fetch('/api/settings/config');
            const data = await res.json();
            if (data.aiTemperature !== undefined) {
                setAiTemperature(data.aiTemperature);
            }
        } catch (error) {
            console.error('Failed to load AI temperature:', error);
        }
    }

    async function saveAiTemperature() {
        setAiTempSaving(true);
        setAiTempMessage('');
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aiTemperature })
            });
            if (res.ok) {
                setAiTempMessage('✅ AI temperature saved');
                setTimeout(() => setAiTempMessage(''), 3000);
            } else {
                setAiTempMessage('❌ Failed to save temperature');
            }
        } catch (error) {
            setAiTempMessage('❌ Failed to save temperature');
        } finally {
            setAiTempSaving(false);
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

    async function fetchWbrSettings() {
        try {
            const res = await fetch('/api/settings/config');
            const data = await res.json();
            if (data.wbr) {
                setWbrSettings({
                    roomId: data.wbr.roomId || '',
                    folderId: data.wbr.folderId || '',
                    goalPrefix: data.wbr.goalPrefix || '',
                    title: data.wbr.title || '',
                    staleAnnouncementDays: data.wbr.staleAnnouncementDays || 6
                });
            }
        } catch (error) {
            console.error('Failed to load WBR settings:', error);
        } finally {
            setWbrLoading(false);
        }
    }

    async function saveWbrSettings() {
        setWbrSaving(true);
        setWbrMessage('');
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wbr: wbrSettings })
            });
            if (res.ok) {
                setWbrMessage('✅ Team Goals settings saved');
                setTimeout(() => setWbrMessage(''), 5000);
            } else {
                setWbrMessage('❌ Failed to save settings');
            }
        } catch (error) {
            setWbrMessage('❌ Failed to save settings');
        } finally {
            setWbrSaving(false);
        }
    }

    async function fetchOrgStatus() {
        try {
            const res = await fetch('/api/team?view=org-status');
            const data = await res.json();
            if (data.data) setOrgStatus(data.data);
        } catch (error) {
            console.error('Failed to load org status:', error);
        }
    }

    async function syncOrgTree() {
        setOrgSyncing(true);
        setOrgMessage('');
        try {
            const res = await fetch('/api/team?view=org-sync');
            const data = await res.json();
            if (data.data?.memberCount > 0) {
                setOrgMessage(`✅ Org tree synced: ${data.data.memberCount} people`);
                setOrgStatus(data.data);
                setTimeout(() => setOrgMessage(''), 5000);
            } else {
                setOrgMessage('⚠️ Sync completed but no members found. Check VPN + Midway.');
            }
        } catch (error) {
            setOrgMessage(`❌ Sync failed: ${error.message}. Ensure VPN + Midway are active.`);
        } finally {
            setOrgSyncing(false);
        }
    }

    async function fetchBulkStatus() {
        try {
            const res = await fetch('/api/bulk-export');
            const data = await res.json();
            setBulkStatus(data);
        } catch (e) { console.error('Bulk status error:', e); }
    }

    async function runBulkExtract() {
        setBulkExtracting(true);
        setBulkMessage('');
        try {
            const res = await fetch('/api/bulk-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            const data = await res.json();
            if (data.success) {
                const s = data.stats || {};
                setBulkMessage(`✅ Extracted: ${s.conversations_added || 0} new + ${s.conversations_updated || 0} updated conversations, ${s.meetings_added || 0} meetings, ${s.contacts_added || 0} contacts`);
                fetchBulkStatus();
            } else {
                setBulkMessage(`❌ ${data.error || 'Extraction failed'}`);
            }
        } catch (e) { setBulkMessage(`❌ ${e.message}`); }
        finally { setBulkExtracting(false); }
    }

    async function runBulkIngest() {
        setBulkIngesting(true);
        setBulkMessage('');
        try {
            const res = await fetch('/api/bulk-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ingest' }) });
            const data = await res.json();
            if (data.success) {
                setBulkMessage(`✅ Ingested ${data.ingested} conversations to vector store (${data.skipped} already indexed)`);
            } else {
                setBulkMessage(`❌ ${data.error || 'Ingestion failed'}`);
            }
        } catch (e) { setBulkMessage(`❌ ${e.message}`); }
        finally { setBulkIngesting(false); }
    }

    async function fetchDataAudit() {
        try {
            const res = await fetch('/api/settings/data-audit');
            if (res.ok) { const data = await res.json(); setDataAudit(data); }
        } catch (e) { console.error('Data audit fetch failed:', e); }
    }

    async function fetchBedrockSettings() {
        try {
            const res = await fetch('/api/settings/config');
            const data = await res.json();
            if (data.bedrock) {
                setBedrockSettings({
                    region: data.bedrock.region || 'us-west-2',
                    modelId: data.bedrock.modelId || 'us.anthropic.claude-sonnet-4-20250514-v1:0',
                    maxTokens: data.bedrock.maxTokens || 8192,
                });
            }
        } catch (error) {
            console.error('Failed to load Bedrock settings:', error);
        } finally {
            setBedrockLoading(false);
        }
    }

    async function saveBedrockSettings() {
        setBedrockSaving(true);
        setBedrockMessage('');
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bedrock: bedrockSettings })
            });
            if (res.ok) {
                setBedrockMessage('✅ Bedrock settings saved. Restart the app for changes to take effect.');
                setTimeout(() => setBedrockMessage(''), 5000);
            } else {
                setBedrockMessage('❌ Failed to save Bedrock settings');
            }
        } catch (error) {
            setBedrockMessage('❌ Failed to save Bedrock settings');
        } finally {
            setBedrockSaving(false);
        }
    }

    async function clearLocalData() {
        if (!confirm('⚠️ This will delete all cached emails, calendar, and AI embeddings from your laptop. Your Outlook data is NOT affected. Continue?')) return;
        setClearingData(true);
        setClearMessage('');
        try {
            const res = await fetch('/api/settings/data-audit', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setClearMessage('✅ All local cached data cleared. Your Outlook data is untouched.');
                fetchDataAudit();
                setTimeout(() => setClearMessage(''), 5000);
            } else { setClearMessage(`❌ ${data.error}`); }
        } catch (e) { setClearMessage(`❌ ${e.message}`); }
        finally { setClearingData(false); }
    }

    const integrations = [
        {
            id: 'outlook',
            name: 'Microsoft Outlook',
            description: 'Connected via local Outlook integration',
            icon: '📬',
            bgColor: 'rgba(0, 120, 212, 0.1)',
            scopes: ['Mail.Read', 'Calendars.Read'],
            connected: true,
        },
    ];

    return (
        <div className="settings-page">
            <h2 className="header-greeting" style={{ marginBottom: 8 }}>⚙️ Settings</h2>
            <p className="header-date" style={{ marginBottom: 32 }}>
                Connect your accounts and configure SmartAI
            </p>

            {/* Privacy & Security — First section for trust */}
            <div className="settings-section">
                <div className="settings-section-title">
                    <Shield size={20} />
                    Privacy &amp; Security
                </div>

                <div style={{
                    padding: '16px 20px', borderRadius: '12px', marginBottom: '16px',
                    background: 'rgba(34, 197, 94, 0.06)', border: '1px solid rgba(34, 197, 94, 0.2)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                        <Shield size={18} style={{ color: 'var(--accent-green)' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Your data never leaves your laptop</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <p style={{ margin: '0 0 8px' }}>✅ <strong>Read-only</strong> — InGen reads emails and calendar from Outlook. It never modifies, deletes, or sends anything.</p>
                        <p style={{ margin: '0 0 8px' }}>✅ <strong>Local-only storage</strong> — All cached data lives in files on your laptop (<code>data/</code> and <code>brain/</code> folders).</p>
                        <p style={{ margin: '0 0 8px' }}>✅ <strong>No cloud sync</strong> — Nothing is uploaded to any external server. No data shared between users.</p>
                        <p style={{ margin: '0 0 0px' }}>✅ <strong>Full control</strong> — Clear all cached data anytime with the button below. Your Outlook data is never affected.</p>
                    </div>
                </div>

                {/* Data Audit */}
                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                            <HardDrive size={20} style={{ color: '#818cf8' }} />
                        </div>
                        <div className="settings-card-text">
                            <h3>Local Data Audit</h3>
                            {dataAudit ? (
                                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {[
                                        ['📧', dataAudit.emailCount, 'emails'],
                                        ['📅', dataAudit.calendarCount, 'calendar events'],
                                        ['🧠', dataAudit.vectorCount, 'AI embeddings'],
                                        ['💾', dataAudit.totalSizeMB, 'MB total'],
                                    ].map(([icon, count, label]) => (
                                        <span key={label} style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', fontSize: '0.8rem' }}>
                                            {icon} {count ?? '—'} {label}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p>Loading data audit...</p>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={clearLocalData}
                        disabled={clearingData}
                        style={{ minWidth: 170, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', color: '#ef4444' }}
                    >
                        <Trash2 size={14} />
                        {clearingData ? 'Clearing...' : 'Clear All Cached Data'}
                    </button>
                </div>

                {clearMessage && (
                    <div style={{
                        padding: '12px', marginTop: '12px', borderRadius: '8px',
                        background: clearMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${clearMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem', textAlign: 'center',
                    }}>
                        {clearMessage}
                    </div>
                )}
            </div>

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

                {/* Org Sync */}
                <div className="settings-card" style={{ marginTop: '16px' }}>
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(34, 211, 238, 0.1)' }}>
                            🏢
                        </div>
                        <div className="settings-card-text">
                            <h3>Org Hierarchy</h3>
                            <p>
                                {orgStatus?.populated
                                    ? `${orgStatus.memberCount} people synced (root: ${orgStatus.rootAlias})${orgStatus.lastFetched ? ` · Last: ${new Date(orgStatus.lastFetched).toLocaleDateString()}` : ''}`
                                    : 'Not synced yet. Requires VPN + Midway.'}
                            </p>
                        </div>
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={syncOrgTree}
                        disabled={orgSyncing || !phonetoolAlias}
                        style={{ minWidth: 140 }}
                    >
                        {orgSyncing ? '⏳ Syncing...' : '🔄 Sync Org Tree'}
                    </button>
                </div>

                {orgMessage && (
                    <div style={{
                        padding: '12px',
                        marginTop: '12px',
                        borderRadius: '8px',
                        background: orgMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : orgMessage.includes('⚠️') ? 'rgba(251, 191, 36, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${orgMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : orgMessage.includes('⚠️') ? 'rgba(251, 191, 36, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {orgMessage}
                    </div>
                )}
            </div>

            {/* WBR / Team Goals Section */}
            <div className="settings-section">
                <div className="settings-section-title">
                    <FileText size={20} />
                    Team Goals (WBR)
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(124, 58, 237, 0.1)' }}>
                            🎯
                        </div>
                        <div className="settings-card-text">
                            <h3>SIM Goals Folder</h3>
                            <p>Configure the Taskei/SIM folder containing your team&apos;s goals for the Team Health dashboard.</p>
                            <div style={{ marginTop: '12px' }}>
                                <h3 style={{ fontSize: '0.95rem', marginBottom: '6px' }}>Paste Taskei URL</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        placeholder="https://taskei.amazon.dev/rooms/.../tasks?f=folder%3A..."
                                        id="wbr-url-input"
                                        style={{
                                            flex: 1, padding: '8px 12px', borderRadius: '6px',
                                            border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                            color: 'var(--text-primary)', fontSize: '0.85rem'
                                        }}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        style={{ whiteSpace: 'nowrap' }}
                                        onClick={() => {
                                            const input = document.getElementById('wbr-url-input')?.value || '';
                                            const roomMatch = input.match(/rooms\/([0-9a-f-]{36})/i);
                                            const folderQs = input.match(/folder(?:%3A|:)([0-9a-f-]{36})/i);
                                            const folderPath = input.match(/folders\/([0-9a-f-]{36})/i);
                                            const newSettings = { ...wbrSettings };
                                            if (roomMatch) newSettings.roomId = roomMatch[1];
                                            if (folderQs) newSettings.folderId = folderQs[1];
                                            else if (folderPath) newSettings.folderId = folderPath[1];
                                            setWbrSettings(newSettings);
                                            setWbrMessage(
                                                (newSettings.roomId && newSettings.folderId)
                                                    ? '✅ Room ID and Folder ID extracted from URL'
                                                    : '⚠️ Could not parse both IDs. Fill in manually below.'
                                            );
                                            setTimeout(() => setWbrMessage(''), 4000);
                                        }}
                                    >
                                        🔗 Parse URL
                                    </button>
                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                                    Also accepts: issues.amazon.com/folders/... (folder only — add room below)
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="settings-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 45%', minWidth: '200px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>SIM Folder ID</h3>
                        <input
                            type="text"
                            value={wbrSettings.folderId}
                            onChange={(e) => setWbrSettings({ ...wbrSettings, folderId: e.target.value })}
                            disabled={wbrLoading}
                            placeholder="ab02443f-f7a8-4fec-..."
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace'
                            }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                            From: issues.amazon.com/folders/{'<ID>'}
                        </span>
                    </div>
                    <div style={{ flex: '1 1 45%', minWidth: '200px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Taskei Room ID</h3>
                        <input
                            type="text"
                            value={wbrSettings.roomId}
                            onChange={(e) => setWbrSettings({ ...wbrSettings, roomId: e.target.value })}
                            disabled={wbrLoading}
                            placeholder="2c8f0ce4-0d0d-4ff9-..."
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace'
                            }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                            From: taskei.amazon.dev/rooms/{'<ID>'}
                        </span>
                    </div>
                </div>

                <div className="settings-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 30%', minWidth: '150px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Goal Prefix (optional)</h3>
                        <input
                            type="text"
                            value={wbrSettings.goalPrefix}
                            onChange={(e) => setWbrSettings({ ...wbrSettings, goalPrefix: e.target.value })}
                            disabled={wbrLoading}
                            placeholder="e.g. CPP2026Goal"
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.9rem'
                            }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                            Fallback if folder listing fails
                        </span>
                    </div>
                    <div style={{ flex: '2 1 60%', minWidth: '200px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Stale Announcement (days)</h3>
                        <input
                            type="number"
                            min="1"
                            max="30"
                            value={wbrSettings.staleAnnouncementDays || 6}
                            onChange={(e) => setWbrSettings({ ...wbrSettings, staleAnnouncementDays: parseInt(e.target.value) || 6 })}
                            disabled={wbrLoading}
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.9rem'
                            }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                            Goals with announcements older than this are highlighted as stale
                        </span>
                    </div>
                    <div style={{ flex: '2 1 60%', minWidth: '200px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Dashboard Title</h3>
                        <input
                            type="text"
                            value={wbrSettings.title}
                            onChange={(e) => setWbrSettings({ ...wbrSettings, title: e.target.value })}
                            disabled={wbrLoading}
                            placeholder="e.g. My Team - 2026 Goals"
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.9rem'
                            }}
                        />
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={saveWbrSettings}
                    disabled={wbrSaving || wbrLoading}
                    style={{ width: '100%', marginTop: '8px' }}
                >
                    {wbrSaving ? 'Saving...' : 'Save Team Goals Settings'}
                </button>

                {wbrMessage && (
                    <div style={{
                        padding: '12px',
                        marginTop: '12px',
                        borderRadius: '8px',
                        background: wbrMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${wbrMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {wbrMessage}
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

                {/* AI Temperature */}
                <div className="settings-card" style={{ marginTop: '16px' }}>
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(255, 159, 10, 0.1)' }}>
                            🌡️
                        </div>
                        <div className="settings-card-text">
                            <h3>AI Temperature</h3>
                            <p>Controls AI creativity vs factual precision. Lower = more factual &amp; deterministic, higher = more creative. Recommended: 0.1–0.3 for data-driven reports.</p>
                            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={aiTemperature}
                                    onChange={(e) => setAiTemperature(parseFloat(e.target.value))}
                                    style={{ flex: 1, cursor: 'pointer' }}
                                />
                                <span style={{
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    color: aiTemperature <= 0.3 ? 'var(--accent-green)' : aiTemperature <= 0.6 ? 'var(--accent-purple)' : '#ff9f0a',
                                    minWidth: '60px',
                                    textAlign: 'right'
                                }}>
                                    {aiTemperature.toFixed(2)}
                                </span>
                            </div>
                            <div style={{
                                marginTop: '12px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                color: 'var(--text-tertiary)'
                            }}>
                                <span>🎯 Factual / Precise</span>
                                <span>🎨 Creative / Varied</span>
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={saveAiTemperature}
                    disabled={aiTempSaving}
                    style={{ width: '100%', marginTop: '8px' }}
                >
                    {aiTempSaving ? 'Saving...' : 'Save AI Temperature'}
                </button>

                {aiTempMessage && (
                    <div style={{
                        padding: '12px',
                        marginTop: '12px',
                        borderRadius: '8px',
                        background: aiTempMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${aiTempMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem',
                        textAlign: 'center'
                    }}>
                        {aiTempMessage}
                    </div>
                )}
            </div>

            {/* AI Provider Section */}
            <div className="settings-section">
                <div className="settings-section-title">
                    <Zap size={20} />
                    AI Provider
                </div>

                <div style={{
                    padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                    background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.2)',
                    fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                    ⚡ <strong>AWS Bedrock</strong> is the default AI provider (Claude via your Amazon credentials). Ollama is used as a local fallback if Bedrock is unavailable.
                </div>

                <div className="settings-card" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '2 1 60%', minWidth: '220px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>Model ID</h3>
                        <input
                            type="text"
                            value={bedrockSettings.modelId}
                            onChange={(e) => setBedrockSettings({ ...bedrockSettings, modelId: e.target.value })}
                            disabled={bedrockLoading}
                            placeholder="us.anthropic.claude-sonnet-4-20250514-v1:0"
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace'
                            }}
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                            Cross-region inference prefix (us.) recommended
                        </span>
                    </div>
                    <div style={{ flex: '1 1 30%', minWidth: '160px' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>AWS Region</h3>
                        <input
                            type="text"
                            value={bedrockSettings.region}
                            onChange={(e) => setBedrockSettings({ ...bedrockSettings, region: e.target.value })}
                            disabled={bedrockLoading}
                            placeholder="us-west-2"
                            style={{
                                width: '100%', padding: '8px 12px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.9rem'
                            }}
                        />
                    </div>
                </div>

                <div className="settings-card">
                    <div className="settings-card-text" style={{ width: '100%' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '8px' }}>
                            Max Tokens: <strong style={{ color: 'var(--accent-purple)' }}>{bedrockSettings.maxTokens.toLocaleString()}</strong>
                        </h3>
                        <input
                            type="range"
                            min="1024"
                            max="32768"
                            step="1024"
                            value={bedrockSettings.maxTokens}
                            onChange={(e) => setBedrockSettings({ ...bedrockSettings, maxTokens: parseInt(e.target.value) })}
                            disabled={bedrockLoading}
                            style={{ width: '100%', cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                            <span>1K (fast)</span>
                            <span>32K (detailed)</span>
                        </div>
                    </div>
                </div>

                <button
                    className="btn btn-primary"
                    onClick={saveBedrockSettings}
                    disabled={bedrockSaving || bedrockLoading}
                    style={{ width: '100%', marginTop: '8px' }}
                >
                    {bedrockSaving ? 'Saving...' : 'Save Bedrock Settings'}
                </button>

                {bedrockMessage && (
                    <div style={{
                        padding: '12px', marginTop: '12px', borderRadius: '8px',
                        background: bedrockMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${bedrockMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem', textAlign: 'center'
                    }}>
                        {bedrockMessage}
                    </div>
                )}
            </div>

            {/* Bulk Data Export Section */}
            <div className="settings-section">
                <div className="settings-section-title">
                    <Database size={20} />
                    Outlook Data Export (Windows)
                </div>

                <div className="settings-card">
                    <div className="settings-card-info">
                        <div className="settings-card-icon" style={{ background: 'rgba(251, 146, 60, 0.1)' }}>
                            📦
                        </div>
                        <div className="settings-card-text">
                            <h3>Step 1: Extract from Outlook</h3>
                            <p>
                                {!bulkStatus?.available
                                    ? 'New Outlook database not detected on this machine.'
                                    : 'Extract conversations, meetings, and contacts from New Outlook\'s local cache. Close Outlook first for best results.'}
                            </p>
                            {bulkStatus?.stats && (
                                <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {[
                                        ['💬', bulkStatus.stats.conversations, 'conversations'],
                                        ['📅', bulkStatus.stats.meetings, 'meetings'],
                                        ['👤', bulkStatus.stats.contacts, 'contacts'],
                                    ].map(([icon, count, label]) => (
                                        <span key={label} style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', fontSize: '0.8rem' }}>
                                            {icon} {count} {label}
                                        </span>
                                    ))}
                                    {bulkStatus.lastExtraction && (
                                        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--bg-tertiary)', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                                            🕐 {new Date(bulkStatus.lastExtraction.timestamp).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {bulkStatus?.available && (
                        <button className="btn btn-primary" onClick={runBulkExtract} disabled={bulkExtracting}
                            style={{ minWidth: 170, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                            {bulkExtracting ? '⏳ Extracting...' : <><Download size={14} /> Extract Data</>}
                        </button>
                    )}
                </div>

                {bulkStatus?.available && bulkStatus?.stats?.conversations > 0 && (
                    <div className="settings-card">
                        <div className="settings-card-info">
                            <div className="settings-card-icon" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                                🧠
                            </div>
                            <div className="settings-card-text">
                                <h3>Step 2: Ingest to AI Vector Store</h3>
                                <p>Index conversations into the RAG vector store for AI-powered search, briefings, and insights. Only new conversations are ingested (incremental).</p>
                            </div>
                        </div>
                        <button className="btn btn-secondary" onClick={runBulkIngest} disabled={bulkIngesting}
                            style={{ minWidth: 170, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                            {bulkIngesting ? '⏳ Ingesting...' : '🧠 Ingest to RAG'}
                        </button>
                    </div>
                )}

                {bulkMessage && (
                    <div style={{
                        padding: '12px', marginTop: '12px', borderRadius: '8px',
                        background: bulkMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${bulkMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        fontSize: '0.9rem', textAlign: 'center'
                    }}>
                        {bulkMessage}
                    </div>
                )}
            </div>

        </div>
    );
}
