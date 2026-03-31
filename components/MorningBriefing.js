'use client';

import { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Sparkles } from 'lucide-react';

// ─── Section config ───────────────────────────────────────────────────────────

const SECTION_ICONS = {
    'Needs Your Attention': '🔔',
    'Email Summary': '📧',
    'Slack Summary': '💬',
    'Meeting Summary': '📅',
    'Ticket Summary': '🎫',
    'Goals Summary': '🎯',
    'Code Metrics': '📊',
};

// ─── Source cards ─────────────────────────────────────────────────────────────

const SOURCE_CARDS = [
    { key: 'emails', label: 'Emails', icon: '📧' },
    { key: 'slack', label: 'Slack', icon: '💬' },
    { key: 'calendar', label: 'Calendar', icon: '📅' },
    { key: 'tickets', label: 'Tickets', icon: '🎫' },
    { key: 'goals', label: 'Goals', icon: '🎯' },
    { key: 'codeMetrics', label: 'Code', icon: '📊' },
];

function formatSourceSummary(key, data) {
    if (!data) return 'No data';
    switch (key) {
        case 'emails': return `${data.total ?? 0} total · ${data.urgent ?? 0} urgent`;
        case 'slack': return `${data.total ?? 0} msgs · ${data.dmCount ?? 0} DMs`;
        case 'calendar': return `${data.totalToday ?? 0} meetings · ${data.upcomingCount ?? 0} upcoming`;
        case 'tickets': return `${data.totalOpen ?? 0} open · ${data.aging14d ?? 0} aging`;
        case 'goals': return `🟢${data.green ?? 0} 🟡${data.yellow ?? 0} 🔴${data.red ?? 0}`;
        case 'codeMetrics': return `${data.crsCreated ?? 0} CRs · ${data.staleCrs ?? 0} stale`;
        default: return 'Loaded';
    }
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        // H2 section header
        if (/^## /.test(line)) {
            const title = line.replace(/^## /, '').trim();
            elements.push(
                <h2 key={key++} style={{
                    fontSize: '1rem', fontWeight: 700, letterSpacing: '0.04em',
                    color: 'var(--accent-purple, #a78bfa)',
                    margin: '24px 0 10px', padding: '0 0 6px',
                    borderBottom: '1px solid rgba(167,139,250,0.2)',
                    display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                    {title}
                </h2>
            );
            i++;
            continue;
        }

        // Table
        if (/^\|/.test(line)) {
            const tableLines = [];
            while (i < lines.length && /^\|/.test(lines[i])) {
                tableLines.push(lines[i]);
                i++;
            }
            elements.push(<MarkdownTable key={key++} rows={tableLines} />);
            continue;
        }

        // Numbered list item
        if (/^\d+\. /.test(line)) {
            const items = [];
            while (i < lines.length && /^\d+\. /.test(lines[i])) {
                items.push(lines[i].replace(/^\d+\. /, ''));
                i++;
            }
            elements.push(
                <ol key={key++} style={{ margin: '4px 0 8px', paddingLeft: '20px' }}>
                    {items.map((item, idx) => (
                        <li key={idx} style={{ color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '4px', fontSize: '0.9rem' }}>
                            <InlineMarkdown text={item} />
                        </li>
                    ))}
                </ol>
            );
            continue;
        }

        // Bullet list item
        if (/^[•\-\*] /.test(line)) {
            const items = [];
            while (i < lines.length && /^[•\-\*] /.test(lines[i])) {
                items.push(lines[i].replace(/^[•\-\*] /, ''));
                i++;
            }
            elements.push(
                <ul key={key++} style={{ margin: '4px 0 8px', paddingLeft: '18px', listStyle: 'none' }}>
                    {items.map((item, idx) => (
                        <li key={idx} style={{ color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '3px', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <span style={{ color: 'var(--accent-purple, #a78bfa)', flexShrink: 0, marginTop: '2px' }}>›</span>
                            <InlineMarkdown text={item} />
                        </li>
                    ))}
                </ul>
            );
            continue;
        }

        // Empty line
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Normal paragraph
        elements.push(
            <p key={key++} style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6, margin: '3px 0' }}>
                <InlineMarkdown text={line} />
            </p>
        );
        i++;
    }

    return elements;
}

function InlineMarkdown({ text }) {
    // Handle **bold**, `code`, [URGENT]/[TODAY] badges
    const parts = [];
    let remaining = text;
    let k = 0;

    // Replace [URGENT] and [TODAY] with styled badges
    remaining = remaining.replace(/\[URGENT\]/g, '‹URGENT›').replace(/\[TODAY\]/g, '‹TODAY›');

    const segments = remaining.split(/(\*\*[^*]+\*\*|`[^`]+`|‹URGENT›|‹TODAY›)/g);
    for (const seg of segments) {
        if (!seg) continue;
        if (seg.startsWith('**') && seg.endsWith('**')) {
            parts.push(<strong key={k++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{seg.slice(2, -2)}</strong>);
        } else if (seg.startsWith('`') && seg.endsWith('`')) {
            parts.push(<code key={k++} style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', padding: '1px 5px', borderRadius: '4px', fontSize: '0.85em', fontFamily: 'monospace' }}>{seg.slice(1, -1)}</code>);
        } else if (seg === '‹URGENT›') {
            parts.push(<span key={k++} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '0.72rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.05em', marginRight: '4px' }}>URGENT</span>);
        } else if (seg === '‹TODAY›') {
            parts.push(<span key={k++} style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', letterSpacing: '0.05em', marginRight: '4px' }}>TODAY</span>);
        } else {
            parts.push(<span key={k++}>{seg}</span>);
        }
    }
    return <>{parts}</>;
}

function MarkdownTable({ rows }) {
    if (rows.length < 2) return null;
    const parseRow = (row) => row.split('|').map(c => c.trim()).filter(Boolean);
    const headers = parseRow(rows[0]);
    const isAlignRow = (r) => /^[\s|:\-]+$/.test(r);
    const dataRows = rows.slice(1).filter(r => !isAlignRow(r)).map(parseRow);

    return (
        <div style={{ overflowX: 'auto', margin: '6px 0 12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                    <tr>
                        {headers.map((h, i) => (
                            <th key={i} style={{
                                textAlign: 'left', padding: '6px 12px',
                                background: 'rgba(167,139,250,0.08)',
                                color: 'var(--accent-purple, #a78bfa)',
                                fontWeight: 600, fontSize: '0.78rem',
                                letterSpacing: '0.04em', textTransform: 'uppercase',
                                borderBottom: '1px solid rgba(167,139,250,0.15)',
                                whiteSpace: 'nowrap',
                            }}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataRows.map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            {row.map((cell, ci) => (
                                <td key={ci} style={{
                                    padding: '6px 12px', color: 'var(--text-primary)',
                                    verticalAlign: 'top', lineHeight: 1.5,
                                }}>
                                    <InlineMarkdown text={cell} />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MorningBriefing({ isOpen, onClose }) {
    const [phase, setPhase] = useState('idle'); // idle | loading | streaming | done | error
    const [briefingText, setBriefingText] = useState('');
    const [sources, setSources] = useState(null);
    const [meta, setMeta] = useState(null); // { label, emoji, period }
    const [status, setStatus] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const contentRef = useRef(null);
    const abortRef = useRef(null);

    // Fetch briefing when opened
    useEffect(() => {
        if (!isOpen) return;
        setPhase('loading');
        setBriefingText('');
        setSources(null);
        setMeta(null);
        setStatus('');
        setErrorMsg('');
        fetchBriefing(false);
        return () => { if (abortRef.current) abortRef.current.abort(); };
    }, [isOpen]);

    // Auto-scroll as text streams
    useEffect(() => {
        if (phase === 'streaming' && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [briefingText, phase]);

    async function fetchBriefing(forceRefresh) {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const url = `/api/morning-briefing${forceRefresh ? '?refresh=true' : ''}`;
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'meta') {
                            setMeta(evt.data);
                        } else if (evt.type === 'status') {
                            setStatus(evt.message);
                        } else if (evt.type === 'sources') {
                            setSources(evt.data);
                        } else if (evt.type === 'chunk') {
                            setPhase('streaming');
                            setBriefingText(prev => prev + evt.text);
                        } else if (evt.type === 'done') {
                            setPhase('done');
                        } else if (evt.type === 'error') {
                            setErrorMsg(evt.message);
                            setPhase('error');
                        }
                    } catch { /* skip bad JSON */ }
                }
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                setErrorMsg(err.message);
                setPhase('error');
            }
        }
    }

    function handleRefresh() {
        if (abortRef.current) abortRef.current.abort();
        setPhase('loading');
        setBriefingText('');
        setSources(null);
        setMeta(null);
        setStatus('');
        setErrorMsg('');
        fetchBriefing(true);
    }

    if (!isOpen) return null;

    const title = meta ? `${meta.emoji} ${meta.label}` : '🌅 Briefing';

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 'var(--sidebar-width, 280px)',
            right: 0,
            bottom: 0,
            background: 'var(--bg-primary, #0f0f1a)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            {/* ── Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 24px',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                flexShrink: 0,
                background: 'rgba(0,0,0,0.2)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: 30, height: 30, borderRadius: '8px',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                        <Sparkles size={14} color="white" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                        {title}
                    </span>
                    {(phase === 'loading' || phase === 'streaming') && (
                        <span style={{
                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                            background: '#a78bfa',
                            animation: 'pulse 1.2s ease-in-out infinite',
                            flexShrink: 0,
                        }} />
                    )}
                    {status && phase === 'loading' && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginLeft: 4 }}>
                            {status}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(phase === 'done' || phase === 'error') && (
                        <button
                            onClick={handleRefresh}
                            title="Refresh briefing"
                            style={{
                                background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)',
                                borderRadius: '7px', padding: '5px 10px', cursor: 'pointer',
                                color: '#a78bfa', display: 'flex', alignItems: 'center', gap: '5px',
                                fontSize: '0.8rem', fontWeight: 500,
                            }}
                        >
                            <RefreshCw size={13} />
                            Refresh
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        title="Close"
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '7px', padding: '6px', cursor: 'pointer',
                            color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* ── Source cards ── */}
            {sources && (
                <div style={{
                    display: 'flex', gap: '8px', padding: '12px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
                }}>
                    {SOURCE_CARDS.map(card => (
                        <div key={card.key} style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px', padding: '7px 12px',
                            flexShrink: 0, minWidth: 110,
                        }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                                {card.icon} {card.label}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                {formatSourceSummary(card.key, sources[card.key])}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Content area ── */}
            <div
                ref={contentRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px 32px 40px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: 'rgba(167,139,250,0.2) transparent',
                }}
            >
                {/* Loading state */}
                {phase === 'loading' && !briefingText && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '800px' }}>
                        <div style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                            {status || 'Gathering your data...'}
                        </div>
                        {[90, 75, 85, 60, 80, 55, 70].map((w, i) => (
                            <div key={i} style={{
                                height: '14px', width: `${w}%`, borderRadius: '6px',
                                background: 'rgba(255,255,255,0.06)',
                                animation: `shimmer 1.6s ease-in-out ${i * 0.1}s infinite`,
                            }} />
                        ))}
                    </div>
                )}

                {/* Error state */}
                {phase === 'error' && (
                    <div style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: '10px', padding: '20px 24px', maxWidth: '600px',
                    }}>
                        <div style={{ color: '#f87171', fontWeight: 600, marginBottom: '8px' }}>Failed to generate briefing</div>
                        <div style={{ color: 'rgba(248,113,113,0.7)', fontSize: '0.875rem' }}>{errorMsg}</div>
                    </div>
                )}

                {/* Briefing content — rendered as markdown */}
                {briefingText && (
                    <div style={{ maxWidth: '960px', lineHeight: 1.6 }}>
                        {renderMarkdown(briefingText)}
                        {phase === 'streaming' && (
                            <span style={{
                                display: 'inline-block', width: '3px', height: '1em',
                                background: '#a78bfa', borderRadius: '1px',
                                animation: 'blink 0.8s step-end infinite',
                                marginLeft: '2px', verticalAlign: 'text-bottom',
                            }} />
                        )}
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes shimmer {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.8; }
                }
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.85); }
                }
            `}</style>
        </div>
    );
}
