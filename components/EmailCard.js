'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Copy, Send, Clock, X, RefreshCw, MessageSquare } from 'lucide-react';

const avatarColors = [
    'linear-gradient(135deg, #4f8cff, #3b6fd4)',
    'linear-gradient(135deg, #a855f7, #7c3aed)',
    'linear-gradient(135deg, #f87171, #dc2626)',
    'linear-gradient(135deg, #34d399, #059669)',
    'linear-gradient(135deg, #fb923c, #ea580c)',
    'linear-gradient(135deg, #22d3ee, #0891b2)',
];

function getAvatarColor(name) {
    const safeName = name || 'Unknown';
    const hash = safeName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatarColors[hash % avatarColors.length];
}

function getInitials(name) {
    const safeName = name || 'U';
    return safeName
        .split(' ')
        .map(w => w[0])
        .filter(Boolean)
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';
}

function getSenderName(from) {
    if (!from) return 'Unknown';
    if (typeof from === 'string') return from;
    return from.name || from.address || from.email || 'Unknown';
}

function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
}

/**
 * Decode a raw MIME body (multipart/base64) to plain text.
 * Runs client-side as a fallback for emails already cached before the
 * server-side decodeMimeBody fix was deployed.
 */
function decodeMimeBodyClient(raw) {
    if (!raw) return '';
    if (!raw.includes('Content-Type:') && !raw.includes('--=')) return raw;

    try {
        // Find text/plain parts first, then text/html
        const partRegex = /Content-Type:\s*(text\/(?:plain|html))[^\n]*\n(?:Content-Transfer-Encoding:\s*(\S+)\s*\n)?(?:[^\n]+\n)*?\n([\s\S]*?)(?=--=|$)/gim;
        const parts = [];
        let match;
        while ((match = partRegex.exec(raw)) !== null) {
            const mimeType = match[1].toLowerCase();
            const encoding = (match[2] || 'plain').toLowerCase().trim();
            let content = match[3] || '';
            if (encoding === 'base64') {
                try {
                    content = atob(content.replace(/\s+/g, ''));
                } catch { content = ''; }
            } else if (encoding === 'quoted-printable') {
                content = content.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
            }
            content = content.trim();
            if (content) parts.push({ mimeType, content });
        }
        const plain = parts.find(p => p.mimeType === 'text/plain');
        const html = parts.find(p => p.mimeType === 'text/html');
        const chosen = plain || html;
        if (chosen) return chosen.content;
    } catch { /* fall through */ }

    return raw;
}

/** Strips HTML tags and decodes MIME/base64, returns plain text */
function htmlToText(html) {
    if (!html) return '';
    // Decode raw MIME bodies (e.g. from aws-outlook-mcp returning multipart messages)
    html = decodeMimeBodyClient(html);
    // Remove style/script blocks
    let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    // Replace block-level tags with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(p|div|tr|li|h[1-6]|blockquote)[^>]*>/gi, '\n');
    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode common HTML entities
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Collapse excessive blank lines
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
}

/** A single message bubble inside the thread */
function ThreadMessage({ msg, senderName, defaultOpen }) {
    const [open, setOpen] = useState(defaultOpen);
    const plainBody = htmlToText(msg.body);
    const preview = plainBody.slice(0, 120).replace(/\n/g, ' ');

    return (
        <div
            style={{
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px',
                overflow: 'hidden',
                background: open ? 'rgba(255,255,255,0.03)' : 'transparent',
            }}
        >
            {/* Message header — always visible */}
            <div
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                }}
            >
                <div
                    style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        background: getAvatarColor(senderName),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '700', color: 'white',
                    }}
                >
                    {getInitials(senderName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {senderName}
                    </div>
                    {!open && (
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {preview}
                        </div>
                    )}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {msg.receivedAt ? timeAgo(msg.receivedAt) : ''}
                </div>
                <div style={{ flexShrink: 0, color: 'var(--text-tertiary)' }}>
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {/* Message body */}
            {open && (
                <div
                    style={{
                        padding: '0 12px 14px 54px',
                        fontSize: '0.88rem',
                        lineHeight: '1.65',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '500px',
                        overflowY: 'auto',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {plainBody || '(no body)'}
                </div>
            )}
        </div>
    );
}

export default function EmailCard({ email }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [draft, setDraft] = useState(email.aiSuggestedReply);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isFindingTime, setIsFindingTime] = useState(false);
    const [showSlots, setShowSlots] = useState(false);
    const [slots, setSlots] = useState([]);
    const [constraints, setConstraints] = useState(null);

    // Thread state
    const [thread, setThread] = useState(null);
    const [threadLoading, setThreadLoading] = useState(false);
    const [threadError, setThreadError] = useState(null);

    // Ask Question State
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState(null);
    const [isAsking, setIsAsking] = useState(false);

    const categoryConfig = {
        respond_now: { label: 'Respond Now', className: 'urgent' },
        respond_today: { label: 'Respond Today', className: 'high' },
        fyi: { label: 'FYI', className: 'low' },
    };

    const category = categoryConfig[email.aiCategory] || categoryConfig.fyi;

    const handleToggle = async () => {
        const opening = !expanded;
        setExpanded(opening);
        // Fetch thread on first open
        if (opening && !thread && !threadLoading && email.conversationId) {
            setThreadLoading(true);
            setThreadError(null);
            try {
                const res = await fetch(`/api/email-thread?conversationId=${encodeURIComponent(email.conversationId)}`);
                const data = await res.json();
                if (data.success) {
                    setThread(data.messages);
                } else {
                    setThreadError(data.error || 'Failed to load thread');
                }
            } catch (e) {
                setThreadError(e.message);
            } finally {
                setThreadLoading(false);
            }
        }
    };

    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(draft || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFindTime = async (e) => {
        e.stopPropagation();
        setIsFindingTime(true);
        setShowSlots(false);
        try {
            const res = await fetch('/api/schedule/propose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailBody: email.body || email.snippet })
            });
            const data = await res.json();
            if (data.slots) {
                setSlots(data.slots);
                setConstraints(data.constraints);
                setShowSlots(true);
            }
        } catch (error) {
            console.error('Find Time failed:', error);
        } finally {
            setIsFindingTime(false);
        }
    };

    const handleSlotClick = (slot, e) => {
        e.stopPropagation();
        const text = `I'm free on ${slot.label}. Does that work for you?`;
        navigator.clipboard.writeText(text);
        setDraft(prev => (prev ? prev + '\n\n' + text : text));
    };

    const handleGenerateDraft = async (e, customIntent) => {
        e.stopPropagation();
        setIsGenerating(true);
        try {
            const res = await fetch('/api/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    intent: customIntent || 'Reply positively and succinctly.'
                })
            });
            if (!res.ok) throw new Error(`Server Error: ${res.status} ${res.statusText}`);
            const data = await res.json();
            if (data.draft) setDraft(data.draft);
        } catch (error) {
            console.error('Failed to generate draft:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAskQuestion = async (e) => {
        e.stopPropagation();
        if (!question.trim()) return;
        setIsAsking(true);
        setAnswer(null);
        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    emailBody: email.body || email.snippet,
                    question: question,
                    email: email
                })
            });
            const data = await res.json();
            if (data.answer) setAnswer(data.answer);
        } catch (error) {
            console.error('Ask Question failed:', error);
        } finally {
            setIsAsking(false);
        }
    };

    return (
        <div
            className={`card animate-in ${expanded ? 'expanded' : ''}`}
            onClick={handleToggle}
        >
            <div className="email-card-header">
                <div
                    className="email-avatar"
                    style={{ background: getAvatarColor(getSenderName(email.from)) }}
                >
                    {getInitials(getSenderName(email.from))}
                </div>

                <div className="email-info">
                    <div className="email-from">{getSenderName(email.from)}</div>
                    <div className="email-subject">{email.subject}</div>
                </div>

                <div className="email-meta">
                    <span className={`priority-badge ${category.className}`}>
                        {category.label}
                    </span>
                    <span className={`email-source ${email.source}`}>
                        {email.source}
                    </span>
                    <span className="email-time">{timeAgo(email.date)}</span>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {expanded && (
                <>
                    {/* AI Summary */}
                    {email.summary && (
                        <div style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            padding: '12px',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            borderLeft: '3px solid #3b82f6'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', color: '#3b82f6', fontWeight: 600, fontSize: '0.85rem' }}>
                                <Sparkles size={14} style={{ marginRight: '6px' }} />
                                AI Summary
                            </div>
                            <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>{email.summary}</div>
                        </div>
                    )}

                    {/* Full Conversation Thread */}
                    {threadLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 0', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                            <div className="loading-spinner" style={{ width: 14, height: 14 }} />
                            Loading conversation…
                        </div>
                    )}
                    {threadError && (
                        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>
                            Could not load thread: {threadError}
                        </div>
                    )}
                    {thread && thread.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                                Conversation · {thread.length} message{thread.length !== 1 ? 's' : ''}
                            </div>
                            {thread.map((msg, idx) => (
                                <ThreadMessage
                                    key={msg.id || idx}
                                    msg={msg}
                                    senderName={msg.sender?.name || msg.sender?.email || 'Unknown'}
                                    defaultOpen={idx === thread.length - 1}
                                />
                            ))}
                        </div>
                    )}
                    {/* Fallback: show cached body while thread loads */}
                    {!thread && !threadLoading && (
                        <div style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            overflowY: 'auto',
                            maxHeight: '300px',
                            fontSize: '0.9rem',
                            lineHeight: '1.65',
                            color: 'var(--text-secondary)',
                            padding: '12px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px',
                            marginBottom: '12px',
                        }}>
                            {htmlToText(email.body) || email.snippet}
                        </div>
                    )}

                    {/* Ask Question */}
                    <div style={{ marginBottom: '16px', padding: '12px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                placeholder="Ask a question about this email..."
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    flex: 1,
                                    background: '#0f172a',
                                    border: '1px solid #334155',
                                    borderRadius: '6px',
                                    padding: '8px 12px',
                                    color: 'white',
                                    fontSize: '0.9rem'
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAskQuestion(e); }}
                            />
                            <button
                                className="btn btn-primary"
                                onClick={handleAskQuestion}
                                disabled={isAsking || !question.trim()}
                                style={{ minWidth: '80px' }}
                            >
                                {isAsking ? <div className="loading-spinner" style={{ width: 16, height: 16 }} /> : <MessageSquare size={16} />}
                            </button>
                        </div>
                        {answer && (
                            <div style={{ marginTop: '12px', padding: '10px', background: '#0f172a', borderRadius: '6px', fontSize: '0.9rem', lineHeight: '1.5', borderLeft: '3px solid #10b981' }}>
                                <strong>Answer:</strong> {answer}
                            </div>
                        )}
                    </div>

                    {/* Draft Reply */}
                    {(draft || isGenerating) ? (
                        <div className="email-reply-section">
                            <div className="email-reply-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>
                                    <Sparkles size={14} style={{ display: 'inline', marginRight: '6px' }} />
                                    {isGenerating ? 'Agent Thinking...' : 'AI-Suggested Reply (Editable)'}
                                </span>
                            </div>

                            {isGenerating ? (
                                <div className="loading-spinner" style={{ margin: '20px auto', display: 'block' }} />
                            ) : (
                                <textarea
                                    className="email-reply-textarea"
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        width: '100%',
                                        minHeight: '150px',
                                        background: '#1e293b',
                                        color: '#e2e8f0',
                                        border: '1px solid #334155',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        fontSize: '0.95rem',
                                        lineHeight: '1.5',
                                        resize: 'vertical',
                                        marginTop: '8px',
                                        fontFamily: 'inherit'
                                    }}
                                />
                            )}

                            {!isGenerating && (
                                <div className="email-reply-actions" style={{ flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                        <button className="btn btn-secondary" onClick={handleCopy}>
                                            <Copy size={14} />
                                            {copied ? 'Copied!' : 'Copy'}
                                        </button>
                                        <button className="btn btn-primary" onClick={(e) => e.stopPropagation()}>
                                            <Send size={14} />
                                            Send Reply
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', borderTop: '1px solid #334155', paddingTop: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center', marginRight: '4px' }}>Regenerate:</span>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e)}>
                                            <RefreshCw size={12} style={{ marginRight: '4px' }} /> Retry
                                        </button>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e, 'Write a detailed and professional reply.')}>Detailed</button>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e, 'Write a concise and short reply.')}>Concise</button>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e, 'Write a polite but firm decline reply.')}>Decline</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-secondary" onClick={handleFindTime} disabled={isFindingTime}>
                                <Clock size={14} style={{ marginRight: '6px' }} />
                                {isFindingTime ? 'Scanning Calendar...' : 'Find Time'}
                            </button>
                            <button className="btn btn-primary" onClick={(e) => handleGenerateDraft(e)}>
                                <Sparkles size={14} style={{ marginRight: '6px' }} />
                                Draft Reply with Agent
                            </button>
                        </div>
                    )}

                    {/* Time Slots */}
                    {showSlots && (
                        <div style={{ marginTop: '10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '12px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Based on: {constraints?.durationMinutes}m, {constraints?.dateRange}</span>
                                <button onClick={() => setShowSlots(false)}><X size={14} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                {slots.map((slot, i) => (
                                    <button
                                        key={i}
                                        onClick={(e) => handleSlotClick(slot, e)}
                                        style={{ padding: '8px', fontSize: '0.85rem', background: '#334155', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', textAlign: 'left' }}
                                    >
                                        {slot.label}
                                    </button>
                                ))}
                            </div>
                            {slots.length === 0 && <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>No slots found.</div>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
