'use client';

import { useState, useEffect } from 'react';
import { X, Save, Check, Loader2, Calendar as CalendarIcon, RefreshCw, AlertTriangle, Upload } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
    const [calendars, setCalendars] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [promptUrl, setPromptUrl] = useState('');
    const [ignoreExternal, setIgnoreExternal] = useState(false);
    const [bedrockBearerToken, setBedrockBearerToken] = useState('');
    const [logUploadUrl, setLogUploadUrl] = useState('');
    const [slackIndexerEnabled, setSlackIndexerEnabled] = useState(false);
    const [slackIndexerChannels, setSlackIndexerChannels] = useState('');
    const [isUploadingLogs, setIsUploadingLogs] = useState(false);
    const [logUploadStatus, setLogUploadStatus] = useState(null);
    const [gistUrl, setGistUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingPrompts, setIsUpdatingPrompts] = useState(false);
    const [updateStatus, setUpdateStatus] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) fetchData();
    }, [isOpen]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const configRes = await fetch('/api/settings/config');
            const configData = await configRes.json();
            setPromptUrl(configData.promptUpdateUrl || '');
            setIgnoreExternal(configData.ignoreExternalEmails === true);
            setBedrockBearerToken(configData.bedrockBearerToken || '');
            setLogUploadUrl(configData.logUploadUrl || '');
            setSlackIndexerEnabled(configData.slackIndexer?.enabled === true);
            setSlackIndexerChannels((configData.slackIndexer?.channels || []).join(', '));

            const calRes = await fetch('/api/settings/calendars');
            const calData = await calRes.json();
            const calList = calData.calendars;
            setCalendars(Array.isArray(calList) ? calList : []);

            const currentId = configData.outlookCalendarId || '';
            if (currentId) setSelectedId(String(currentId));
        } catch (err) {
            setError('Failed to load settings.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    outlookCalendarId: selectedId,
                    promptUpdateUrl: promptUrl,
                    ignoreExternalEmails: ignoreExternal,
                    bedrockBearerToken: bedrockBearerToken,
                    logUploadUrl: logUploadUrl,
                    slackIndexer: {
                        enabled: slackIndexerEnabled,
                        channels: slackIndexerChannels.split(',').map(c => c.trim().replace(/^#/, '')).filter(Boolean).map(c => `#${c}`),
                        lookbackDays: 30,
                    }
                })
            });
            if (!res.ok) throw new Error('Failed to save');
            onClose();
            window.location.reload();
        } catch (err) {
            setError('Failed to save settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdatePrompts = async () => {
        if (!promptUrl) return;
        setIsUpdatingPrompts(true);
        setUpdateStatus(null);
        try {
            const res = await fetch('/api/settings/update-prompts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: promptUrl })
            });
            if (!res.ok) throw new Error('Update failed');
            setUpdateStatus('success');
            setTimeout(() => setUpdateStatus(null), 3000);
        } catch (err) {
            setUpdateStatus('error');
        } finally {
            setIsUpdatingPrompts(false);
        }
    };

    const handleUploadLogs = async () => {
        setIsUploadingLogs(true);
        setLogUploadStatus(null);
        setGistUrl(null);
        try {
            const res = await fetch('/api/logs/upload', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            if(data.content){const b=new Blob([data.content],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=data.filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u)} setGistUrl("downloaded");
            setLogUploadStatus('success');
        } catch (err) {
            setLogUploadStatus('error');
        } finally {
            setIsUploadingLogs(false);
        }
    };

    if (!isOpen) return null;

    const inputStyle = {
        width: '100%', padding: '10px 14px', borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
        color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
        outline: 'none', boxSizing: 'border-box',
    };

    const sectionTitle = (icon, text) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '16px' }}>{icon}</span> {text}
        </div>
    );

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{
                position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.4)', zIndex: 999,
                animation: 'fadeIn 0.2s ease-out',
            }} />

            {/* Slide-out Panel */}
            <div style={{
                position: 'fixed', top: 0, right: 0, width: '480px', height: '100vh',
                background: 'rgba(18,18,28,0.97)', backdropFilter: 'blur(24px)',
                borderLeft: '1px solid rgba(139,92,246,0.2)', zIndex: 1000,
                overflowY: 'auto', padding: '28px',
                boxShadow: '-16px 0 60px rgba(0,0,0,0.5)',
                animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                `}</style>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ⚙️ Quick Settings
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                    }}>
                        ✕ Close
                    </button>
                </div>

                {error && (
                    <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)', color: '#ff453a', fontSize: '13px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}

                {/* Calendar Selection */}
                <div style={{ marginBottom: '24px' }}>
                    {sectionTitle('📅', 'Outlook Calendar')}
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : calendars.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No calendars found in Outlook.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                            {calendars.map(cal => {
                                const isSelected = String(selectedId) === String(cal.id);
                                return (
                                    <button key={cal.id} onClick={() => setSelectedId(String(cal.id))} style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                                        borderRadius: '10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                                        background: isSelected ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)',
                                        border: isSelected ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                        color: 'var(--text-primary)', transition: 'all 0.15s',
                                    }}>
                                        <CalendarIcon size={16} style={{ color: isSelected ? '#a78bfa' : 'var(--text-tertiary)', flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{cal.name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{cal.account} · ID: {cal.id}</div>
                                        </div>
                                        {isSelected && <Check size={16} color="#a78bfa" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Email Preferences */}
                <div style={{ marginBottom: '24px' }}>
                    {sectionTitle('📧', 'Email Preferences')}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', borderRadius: '10px',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Ignore External Emails</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Hide [EXTERNAL] emails from triage & AI</div>
                        </div>
                        <input type="checkbox" checked={ignoreExternal} onChange={(e) => setIgnoreExternal(e.target.checked)}
                            style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', cursor: 'pointer' }} />
                    </div>
                </div>

                {/* Slack Channel Indexer */}
                <div style={{ marginBottom: '24px' }}>
                    {sectionTitle('💬', 'Slack Channel Indexer')}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', borderRadius: '10px', marginBottom: '10px',
                        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Enable Auto-Indexing</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>Index Slack channels every 15 min for semantic search</div>
                        </div>
                        <input type="checkbox" checked={slackIndexerEnabled} onChange={(e) => setSlackIndexerEnabled(e.target.checked)}
                            style={{ width: '18px', height: '18px', accentColor: '#8b5cf6', cursor: 'pointer' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>
                            Channels to Index
                        </label>
                        <input
                            type="text"
                            value={slackIndexerChannels}
                            onChange={(e) => setSlackIndexerChannels(e.target.value)}
                            placeholder="#my-team, #eng-leads, #staff-eng"
                            style={inputStyle}
                        />
                        {slackIndexerChannels && (
                            <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {slackIndexerChannels.split(',').map(c => c.trim()).filter(Boolean).map((ch, i) => (
                                    <span key={i} style={{
                                        padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                        background: 'rgba(139,92,246,0.12)', color: '#a78bfa',
                                        border: '1px solid rgba(139,92,246,0.2)',
                                    }}>
                                        {ch.startsWith('#') ? ch : `#${ch}`}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                            Comma-separated channel names. Messages are embedded into the vector store for RAG search.
                            {' '}Requires app restart to pick up changes. Set to 90 days lookback for better recall.
                        </div>
                    </div>
                </div>

                {/* AI Prompts */}
                <div style={{ marginBottom: '24px' }}>
                    {sectionTitle('🤖', 'AI Prompts')}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>
                                Prompts URL
                            </label>
                            <input type="text" value={promptUrl} onChange={(e) => setPromptUrl(e.target.value)}
                                placeholder="https://code.amazon.com/packages/InGen-SmartAI/blobs/mainline/--/config/prompts.json" style={inputStyle} />
                        </div>
                        <button onClick={handleUpdatePrompts} disabled={isUpdatingPrompts || !promptUrl} style={{
                            padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(139,92,246,0.12)', color: '#a78bfa', cursor: isUpdatingPrompts ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600,
                            opacity: !promptUrl ? 0.4 : 1,
                        }}>
                            {isUpdatingPrompts ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                            Sync
                        </button>
                    </div>
                    {updateStatus === 'success' && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#30d158', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={12} /> Prompts updated!
                        </div>
                    )}
                    {updateStatus === 'error' && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#ff453a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={12} /> Failed — check URL
                        </div>
                    )}
                </div>

                {/* Bedrock API Key */}
                <div style={{ marginBottom: '24px' }}>
                    {sectionTitle('🔑', 'Bedrock API Key')}
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>
                            ABSK Bearer Token
                        </label>
                        <input
                            type="password"
                            value={bedrockBearerToken}
                            onChange={(e) => setBedrockBearerToken(e.target.value)}
                            placeholder="Paste your Bedrock API key (ABSK)…"
                            style={inputStyle}
                        />
                        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.5' }}>
                            Generate at{' '}
                            <a href="https://us-west-2.console.aws.amazon.com/bedrock/home?region=us-west-2#/api-keys"
                                target="_blank" rel="noreferrer"
                                style={{ color: '#a78bfa', textDecoration: 'none' }}>
                                Bedrock Console → API Keys
                            </a>
                            {' '}· Never expires · Saved to settings.json
                        </div>
                    </div>
                </div>

                {/* Diagnostics */}
                <div style={{ marginBottom: '24px' }}>
                    {sectionTitle('🔧', 'Diagnostics')}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button onClick={handleUploadLogs} disabled={isUploadingLogs} style={{
                            padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)',
                            cursor: isUploadingLogs ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                        }}>
                            {isUploadingLogs ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
                            {isUploadingLogs ? 'Uploading...' : 'Download Logs'}
                        </button>
                        {logUploadStatus === 'success' && gistUrl && (
                            <span style={{ fontSize: '12px', color: '#30d158' }}>✅ Log downloaded</span>
                        )}
                    </div>
                    {logUploadStatus === 'error' && (
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#ff453a' }}>
                            <AlertTriangle size={12} /> Upload failed — ensure Midway is active
                        </div>
                    )}
                </div>

                {/* Save Footer */}
                <div style={{
                    position: 'sticky', bottom: 0, padding: '16px 0', marginTop: '16px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(18,18,28,0.97)',
                    display: 'flex', justifyContent: 'flex-end', gap: '10px',
                }}>
                    <button onClick={onClose} style={{
                        padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                        cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500,
                    }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving} style={{
                        padding: '10px 24px', borderRadius: '10px', border: 'none',
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                        cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: '6px', opacity: isSaving ? 0.7 : 1,
                        boxShadow: '0 4px 12px rgba(139,92,246,0.25)',
                    }}>
                        {isSaving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                        Save Changes
                    </button>
                </div>

                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)', textAlign: 'center', marginTop: '12px' }}>
                    Full settings available at /settings
                </div>
            </div>
        </>
    );
}