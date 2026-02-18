'use client';

import { useState, useEffect } from 'react';
import { X, Save, Check, Loader2, Calendar as CalendarIcon } from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
    const [calendars, setCalendars] = useState([]);
    const [selectedId, setSelectedId] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
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
        if (!selectedId) return;
        setIsSaving(true);
        try {
            const res = await fetch('/api/settings/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ outlookCalendarId: selectedId })
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

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button onClick={onClose} className="close-button">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body">
                    <h3>Outlook Calendar Configuration</h3>
                    <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
                        Select the Outlook calendar you want to sync with SmartAI.
                        This allows you to choose between your personal, work, or shared calendars.
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
                        <div className="calendar-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
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
                </div>

                <div className="modal-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white' }}>
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !selectedId}
                        className="btn-primary"
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            background: '#2563eb',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: (isSaving || !selectedId) ? 0.7 : 1
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
