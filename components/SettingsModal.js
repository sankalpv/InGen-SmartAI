'use client';

import { useState, useEffect } from 'react';
import { X, Save, Check, Loader2, Calendar as CalendarIcon, RefreshCw, TriangleAlert, Upload } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
    const [calendars, setCalendars] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [promptUrl, setPromptUrl] = useState('');
    const [ignoreExternal, setIgnoreExternal] = useState(false);
    const [logUploadUrl, setLogUploadUrl] = useState('');
    const [isUploadingLogs, setIsUploadingLogs] = useState(false);
    const [logUploadStatus, setLogUploadStatus] = useState(null); // 'success' | 'error' | null
    const [gistUrl, setGistUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isUpdatingPrompts, setIsUpdatingPrompts] = useState(false);
    const [updateStatus, setUpdateStatus] = useState(null); // 'success' | 'error' | null
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // 1. Fetch Config
            const configRes = await fetch('/api/settings/config');
            const configData = await configRes.json();
            const currentId = configData.outlookCalendarId || '';
            setPromptUrl(configData.promptUpdateUrl || '');
            setIgnoreExternal(configData.ignoreExternalEmails === true);
            setLogUploadUrl(configData.logUploadUrl || '');

            // 2. Fetch Calendars
            const calRes = await fetch('/api/settings/calendars');
            const calData = await calRes.json();

            setCalendars(calData.calendars || []);

            // Set selected ID (fallback to first found if not set, or keep empty)
            if (currentId) {
                setSelectedId(String(currentId));
            } else if (calData.calendars?.length > 0) {
                // Optionally auto-select the first one if nothing is saved?
                // Let's force user to pick or just show nothing selected
                // setSelectedId(String(calData.calendars[0].id));
            }

        } catch (err) {
            console.error('Failed to load settings:', err);
            setError('Failed to load local Outlook calendars.');
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
                    logUploadUrl: logUploadUrl
                })
            });

            if (!res.ok) throw new Error('Failed to save');

            onClose();
            // detailed success feedback or reload could happen here
            // For now, closing is enough. The app might need a refresh to pick up changes immediately implies a reload
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

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Update failed');

            setUpdateStatus('success');
            // Auto-clear success message after 3s
            setTimeout(() => setUpdateStatus(null), 3000);
        } catch (err) {
            console.error(err);
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
            setGistUrl(data.gistUrl);
            setLogUploadStatus('success');
        } catch (err) {
            console.error(err);
            setLogUploadStatus('error');
        } finally {
            setIsUploadingLogs(false);
        }
    };


    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button onClick={onClose} className="close-button">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* --- Calendars --- */}
                    <section style={{ marginBottom: '32px' }}>
                        <h3>Outlook Calendar Configuration</h3>
                        <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                            Select the Outlook calendar you want to sync with SmartAI.
                        </p>

                        {error && (
                            <div className="error-banner" style={{ marginBottom: '16px', padding: '8px', background: '#ffebee', color: '#c62828', borderRadius: '4px' }}>
                                {error}
                            </div>
                        )}

                        {isLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                                <Loader2 className="animate-spin" size={24} />
                            </div>
                        ) : (
                            <div className="calendar-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                {calendars.length === 0 ? (
                                    <p>No calendars found in Outlook (New UI).</p>
                                ) : (
                                    calendars.map(cal => (
                                        <button
                                            key={cal.id}
                                            onClick={() => setSelectedId(String(cal.id))}
                                            className={`calendar-option ${String(selectedId) === String(cal.id) ? 'selected' : ''}`}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '12px',
                                                border: String(selectedId) === String(cal.id) ? '2px solid #2563eb' : '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                background: String(selectedId) === String(cal.id) ? '#eff6ff' : 'white',
                                                cursor: 'pointer',
                                                textAlign: 'left'
                                            }}
                                        >
                                            <CalendarIcon size={18} style={{ marginRight: '12px', color: '#4b5563' }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 500 }}>{cal.name}</div>
                                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                    {cal.account} • ID: {cal.id}
                                                </div>
                                            </div>
                                            {String(selectedId) === String(cal.id) && <Check size={18} color="#2563eb" />}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </section>

                    {/* --- Email Filters --- */}
                    <section style={{ borderTop: '1px solid #eee', paddingTop: '24px', marginBottom: '24px' }}>
                        <h3>Email Preferences</h3>
                        <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                            Configure how SmartAI handles your emails.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                            <div>
                                <div style={{ fontWeight: 500, color: '#374151' }}>Ignore External Emails</div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    If enabled, emails with <code>[EXTERNAL]</code> in the subject line will be hidden from the triage tab and excluded from AI analysis and vector search.
                                </div>
                            </div>
                            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0, marginLeft: '16px' }}>
                                <input
                                    type="checkbox"
                                    checked={ignoreExternal}
                                    onChange={(e) => setIgnoreExternal(e.target.checked)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span className="slider round" style={{
                                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: ignoreExternal ? '#2563eb' : '#ccc',
                                    transition: '.4s', borderRadius: '24px'
                                }}>
                                    <span style={{
                                        position: 'absolute', content: '""', height: '18px', width: '18px', left: '3px', bottom: '3px',
                                        backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                                        transform: ignoreExternal ? 'translateX(20px)' : 'translateX(0)'
                                    }}></span>
                                </span>
                            </label>
                        </div>
                    </section>

                    {/* --- AI Prompts --- */}
                    <section style={{ borderTop: '1px solid #eee', paddingTop: '24px' }}>
                        <h3>AI & Prompts</h3>
                        <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                            Configure the URL for fetching the latest AI prompts.
                        </p>

                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                                    Prompts Update URL (JSON)
                                </label>
                                <input
                                    type="text"
                                    value={promptUrl}
                                    onChange={(e) => setPromptUrl(e.target.value)}
                                    placeholder="https://gist.githubusercontent.com/..."
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '6px',
                                        border: '1px solid #d1d5db',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>
                            <button
                                onClick={handleUpdatePrompts}
                                disabled={isUpdatingPrompts || !promptUrl}
                                style={{
                                    marginTop: '22px',
                                    padding: '10px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    background: '#f9fafb',
                                    color: '#374151',
                                    cursor: isUpdatingPrompts ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {isUpdatingPrompts ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                Update
                            </button>
                        </div>

                        {updateStatus === 'success' && (
                            <div style={{ marginTop: '8px', fontSize: '13px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Check size={14} /> Prompts updated successfully!
                            </div>
                        )}
                        {updateStatus === 'error' && (
                            <div style={{ marginTop: '8px', fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <TriangleAlert size={14} /> Failed to update prompts. Check URL and try again.
                            </div>
                        )}
                    </section>

                    {/* --- Log Upload --- */}
                    <section style={{ borderTop: '1px solid #eee', paddingTop: '24px' }}>
                        <h3>Diagnostics & Logs</h3>
                        <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                            Upload <code>smartai.log</code> to a secret GitHub Gist for remote debugging.
                            Requires <code>GITHUB_GIST_TOKEN</code> in <code>.env.local</code>.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleUploadLogs}
                                disabled={isUploadingLogs}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    background: '#f9fafb',
                                    color: '#374151',
                                    cursor: isUploadingLogs ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontWeight: 500
                                }}
                            >
                                {isUploadingLogs ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                {isUploadingLogs ? 'Uploading...' : 'Send Logs to GitHub Gist'}
                            </button>

                            {logUploadStatus === 'success' && gistUrl && (
                                <a
                                    href={gistUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: '13px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'underline' }}
                                >
                                    <Check size={14} color="#10b981" /> View Gist →
                                </a>
                            )}
                        </div>

                        {logUploadStatus === 'error' && (
                            <div style={{ marginTop: '8px', fontSize: '13px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <TriangleAlert size={14} /> Upload failed. Check that GITHUB_GIST_TOKEN is set in .env.local.
                            </div>
                        )}
                    </section>
                </div>


                <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white' }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="btn-primary"
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: '#2563eb',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: isSaving ? 0.7 : 1
                        }}
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save Changes
                    </button>
                </div>
            </div>

            <style jsx>{`
                .modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                    backdrop-filter: blur(2px);
                }
                .modal-content {
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .modal-header h2 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                }
                .close-button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    color: #6b7280;
                }
                .close-button:hover {
                    color: #111827;
                }
            `}</style>
        </div>
    );
}
