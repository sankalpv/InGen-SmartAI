'use client';

import { useState, useEffect } from 'react';
import { FileText, RefreshCw, Copy, Check, ChevronDown, ChevronUp, Settings, RotateCcw, Loader2, Database, Sparkles } from 'lucide-react';

export default function WbrPrepPage() {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState('');
    const [context, setContext] = useState('');
    const [prompt, setPrompt] = useState('');
    const [weekId, setWeekId] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [showContext, setShowContext] = useState(false);
    const [promptSaving, setPromptSaving] = useState(false);
    const [promptMessage, setPromptMessage] = useState('');
    const [generated, setGenerated] = useState(false);

    // Load prompt on mount
    useEffect(() => {
        fetchPrompt();
    }, []);

    async function fetchPrompt() {
        try {
            const res = await fetch('/api/wbr-prep?view=prompt');
            const data = await res.json();
            if (data.prompt) setPrompt(data.prompt);
        } catch (e) {
            console.error('Failed to load prompt:', e);
        }
    }

    async function generateReport() {
        setLoading(true);
        setError('');
        setResult('');
        try {
            const res = await fetch('/api/wbr-prep?view=generate');
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setResult(data.result || '');
                setContext(data.context || '');
                setPrompt(data.prompt || '');
                setWeekId(data.weekId || '');
                setDateRange(data.dateRange || null);
                setGenerated(true);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function regenerateReport() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/wbr-prep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'regenerate', prompt }),
            });
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setResult(data.result || '');
                setContext(data.context || '');
                setWeekId(data.weekId || '');
                setDateRange(data.dateRange || null);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function savePrompt() {
        setPromptSaving(true);
        setPromptMessage('');
        try {
            const res = await fetch('/api/wbr-prep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'save-prompt', prompt }),
            });
            if (res.ok) {
                setPromptMessage('✅ Prompt saved');
                setTimeout(() => setPromptMessage(''), 3000);
            }
        } catch (e) {
            setPromptMessage('❌ Failed to save');
        } finally {
            setPromptSaving(false);
        }
    }

    async function resetPrompt() {
        setPromptSaving(true);
        try {
            const res = await fetch('/api/wbr-prep', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reset-prompt' }),
            });
            const data = await res.json();
            if (data.prompt) {
                setPrompt(data.prompt);
                setPromptMessage('✅ Prompt reset to default');
                setTimeout(() => setPromptMessage(''), 3000);
            }
        } catch (e) {
            setPromptMessage('❌ Failed to reset');
        } finally {
            setPromptSaving(false);
        }
    }

    function copyToClipboard() {
        navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    // Render inline markdown bold
    function renderInline(text) {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    }

    // Simple markdown-like rendering
    function renderResult(text) {
        if (!text) return null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {text.split('\n').map((line, i) => {
                    if (line.startsWith('## ')) {
                        return <h3 key={i} style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '28px', marginBottom: '14px', color: 'var(--text-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>{line.replace('## ', '')}</h3>;
                    }
                    if (line.startsWith('- ')) {
                        return <div key={i} style={{ paddingLeft: '20px', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.7, textIndent: '-12px' }}>• {renderInline(line.replace('- ', ''))}</div>;
                    }
                    if (line.startsWith('*') && line.endsWith('*') && !line.startsWith('**')) {
                        return <p key={i} style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontStyle: 'italic', marginBottom: '8px' }}>{line.replace(/^\*|\*$/g, '')}</p>;
                    }
                    if (line.trim() === '') return <div key={i} style={{ height: '8px' }} />;
                    return <p key={i} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.7 }}>{renderInline(line)}</p>;
                })}
            </div>
        );
    }

    return (
        <div className="settings-page">
            <h2 className="header-greeting" style={{ marginBottom: 8 }}>📋 WBR Prep</h2>
            <p className="header-date" style={{ marginBottom: 24 }}>
                {weekId ? `Week ${weekId.split('-')[1]} · ${dateRange?.start || ''} to ${dateRange?.end || ''}` : 'AI-generated Weekly Business Review Insights, Wins & Misses'}
            </p>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button
                    className="btn btn-primary"
                    onClick={generated ? regenerateReport : generateReport}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'center' }}
                >
                    {loading ? <Loader2 size={16} className="loading-spinner" /> : <Sparkles size={16} />}
                    {loading ? 'Generating...' : generated ? 'Regenerate' : 'Generate Report'}
                </button>

                {result && (
                    <button
                        className="btn btn-secondary"
                        onClick={copyToClipboard}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {copied ? <Check size={16} style={{ color: 'var(--accent-green)' }} /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                )}
            </div>

            {/* Error */}
            {error && (
                <div style={{ padding: '16px', marginBottom: '20px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', fontSize: '0.9rem', color: '#ef4444' }}>
                    ❌ {error}
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="settings-card" style={{ marginBottom: '24px', padding: '24px' }}>
                    {renderResult(result)}
                </div>
            )}

            {/* Loading placeholder */}
            {loading && (
                <div className="settings-card" style={{ marginBottom: '24px', padding: '40px', textAlign: 'center' }}>
                    <Loader2 size={32} className="loading-spinner" style={{ margin: '0 auto 16px', display: 'block', color: 'var(--accent-purple)' }} />
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Collecting data from eng-metrics & WBR goals, then generating AI insights...</p>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginTop: '8px' }}>This may take 15-30 seconds</p>
                </div>
            )}

            {/* Prompt Editor (Collapsible) */}
            <div className="settings-section" style={{ marginTop: '16px' }}>
                <button
                    onClick={() => setShowPrompt(!showPrompt)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                        padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--glass-border)',
                        background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer',
                        fontSize: '0.95rem', fontWeight: 600, fontFamily: 'inherit', justifyContent: 'space-between',
                    }}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Settings size={18} />
                        AI Prompt
                    </span>
                    {showPrompt ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showPrompt && (
                    <div style={{ marginTop: '12px' }}>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={16}
                            style={{
                                width: '100%', padding: '16px', borderRadius: '10px',
                                border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'monospace',
                                lineHeight: 1.5, resize: 'vertical',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <button className="btn btn-primary" onClick={savePrompt} disabled={promptSaving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {promptSaving ? 'Saving...' : '💾 Save Prompt'}
                            </button>
                            <button className="btn btn-secondary" onClick={resetPrompt} disabled={promptSaving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <RotateCcw size={14} /> Reset to Default
                            </button>
                            {generated && (
                                <button className="btn btn-secondary" onClick={regenerateReport} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <RefreshCw size={14} /> Regenerate with Changes
                                </button>
                            )}
                        </div>
                        {promptMessage && (
                            <div style={{
                                padding: '10px', marginTop: '12px', borderRadius: '8px', fontSize: '0.85rem', textAlign: 'center',
                                background: promptMessage.includes('✅') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${promptMessage.includes('✅') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            }}>
                                {promptMessage}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Raw Data Context (Collapsible) */}
            {context && (
                <div className="settings-section" style={{ marginTop: '16px' }}>
                    <button
                        onClick={() => setShowContext(!showContext)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                            padding: '14px 20px', borderRadius: '12px', border: '1px solid var(--glass-border)',
                            background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer',
                            fontSize: '0.95rem', fontWeight: 600, fontFamily: 'inherit', justifyContent: 'space-between',
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Database size={18} />
                            Raw Data Context ({context.split('\n').length} lines)
                        </span>
                        {showContext ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {showContext && (
                        <pre style={{
                            marginTop: '12px', padding: '16px', borderRadius: '10px',
                            border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                            color: 'var(--text-tertiary)', fontSize: '0.75rem', fontFamily: 'monospace',
                            lineHeight: 1.4, overflow: 'auto', maxHeight: '400px', whiteSpace: 'pre-wrap',
                        }}>
                            {context}
                        </pre>
                    )}
                </div>
            )}

            {/* Getting Started hint */}
            {!generated && !loading && (
                <div className="ai-briefing" style={{ marginTop: 32 }}>
                    <div className="ai-briefing-header">
                        <div className="ai-badge">
                            <span className="sparkle">💡</span>
                            How It Works
                        </div>
                    </div>
                    <p className="ai-briefing-text" style={{ fontSize: '0.9rem' }}>
                        Click <strong>Generate Report</strong> to collect data from your team&apos;s code metrics (CRs created/reviewed, velocity trends) and WBR goals (status, comments, ECDs), then have AI synthesize Wins, Misses, and Insights for your Weekly Business Review. You can customize the AI prompt in the <strong>AI Prompt</strong> section below.
                    </p>
                </div>
            )}
        </div>
    );
}
