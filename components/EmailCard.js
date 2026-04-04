'use client';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Copy, Send, Clock, X, RefreshCw, MessageSquare, ThumbsUp, ThumbsDown, Tag } from 'lucide-react';

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
    // Strip Outlook VML/CSS artifacts that leak through (with and without backslashes)
    text = text.replace(/[vow]\\?\:\*\s*\{[^}]*\}/gi, '');
    text = text.replace(/\.shape\s*\{[^}]*\}/gi, '');
    // Strip @font-face, @media, and other CSS at-rules
    text = text.replace(/@font-face\s*\{[^}]*\}/gi, '');
    text = text.replace(/@media[^{]*\{[^}]*(\{[^}]*\}[^}]*)*\}/gi, '');
    // Strip CSS class/selector blocks: .className { ... } or selector { ... }
    text = text.replace(/[.#]?[a-zA-Z][a-zA-Z0-9_-]*(?:\s*[,>+~]\s*[.#]?[a-zA-Z][a-zA-Z0-9_-]*)*\s*\{[^}]*\}/g, '');
    // Strip remaining CSS-like single-line declarations
    text = text.replace(/^[a-z\-]+\s*\{[^}]*\}\s*$/gim, '');
    // Strip HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/-->/g, '');
    // Strip isolated numbers on their own line (from CSS like "96")
    text = text.replace(/^\s*\d{1,4}\s*$/gm, '');
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

/** 
 * Rich HTML email body renderer.
 * Uses a sandboxed iframe for HTML emails (preserves tables, images, CSS).
 * Falls back to plain text for non-HTML content.
 */
function EmailBody({ body, bodyHtml, snippet }) {
    const [iframeHeight, setIframeHeight] = useState(200);
    const content = body || snippet || '';
    
    // Prefer raw HTML for iframe rendering (preserved from normalizeEmail)
    const htmlContent = bodyHtml || '';
    const hasHtml = htmlContent.length > 0 || /<[a-z][\s\S]*>/i.test(content);

    const handleIframeLoad = (e) => {
        try {
            const doc = e.target.contentDocument || e.target.contentWindow?.document;
            if (doc?.body) {
                const height = Math.min(doc.body.scrollHeight + 20, 600);
                setIframeHeight(Math.max(height, 100));
            }
        } catch { /* cross-origin — use default height */ }
    };

    if (!content) {
        return (
            <div style={{ padding: '12px', color: 'var(--text-tertiary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                (no body)
            </div>
        );
    }

    if (hasHtml) {
        // Render rich HTML in sandboxed iframe — use preserved raw HTML if available
        const iframeBody = htmlContent || content;
        /* Force dark-mode readable text — !important overrides Outlook's
           inline color:black / color:windowtext / color:#000 styles.
           Colors match globals.css --text-primary (#e2e8f0) and --accent (#818cf8). */
        const styledContent = `
            <html><head><style>
                body, p, div, span, td, th, li, h1, h2, h3, h4, h5, h6,
                b, strong, em, i, u, blockquote, pre, code, font, center,
                .MsoNormal, .MsoListParagraph, .WordSection1, .WordSection2 {
                    color: #e2e8f0 !important;
                    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif !important;
                }
                body {
                    margin: 8px;
                    font-size: 14px;
                    line-height: 1.6;
                    background: #0f1729 !important;
                }
                a { color: #818cf8 !important; }
                img { max-width: 100%; height: auto; }
                table { max-width: 100%; border-collapse: collapse; }
                td, th { border-color: rgba(255,255,255,0.1) !important; padding: 4px 8px; }
                hr { border-color: rgba(255,255,255,0.1) !important; }
            </style></head><body>${iframeBody}</body></html>`;

        return (
            <div style={{ marginBottom: '12px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}
                 onClick={(e) => e.stopPropagation()}>
                <iframe
                    srcDoc={styledContent}
                    sandbox="allow-same-origin"
                    style={{
                        width: '100%',
                        height: `${iframeHeight}px`,
                        border: 'none',
                        background: '#0f1729',
                        borderRadius: '8px',
                    }}
                    onLoad={handleIframeLoad}
                    title="Email content"
                />
            </div>
        );
    }

    // Plain text fallback
    return (
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
            {htmlToText(content)}
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

    // Adaptive Learning: category override + draft feedback
    const [overriddenCategory, setOverriddenCategory] = useState(null);
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [draftFeedback, setDraftFeedback] = useState(null); // 'up' | 'down' | null
    const [answerFeedback, setAnswerFeedback] = useState(null); // 'up' | 'down' | null

    const categoryConfig = {
        respond_now: { label: 'Respond Now', className: 'urgent', color: '#ef4444' },
        respond_today: { label: 'Respond Today', className: 'high', color: '#eab308' },
        fyi: { label: 'FYI', className: 'low', color: '#6b7280' },
    };

    const effectiveCategory = overriddenCategory || email.aiCategory || 'fyi';
    const category = categoryConfig[effectiveCategory] || categoryConfig.fyi;

    // Send category correction to adaptive learning backend
    const handleCategoryOverride = (newCat, e) => {
        e.stopPropagation();
        setOverriddenCategory(newCat);
        setShowCategoryPicker(false);
        fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'category-correction',
                emailId: email.id,
                originalCategory: email.aiCategory || 'fyi',
                correctedCategory: newCat,
                from: typeof email.from === 'string' ? email.from : email.from?.email || '',
                subject: email.subject,
            }),
        }).catch(() => {});
    };

    // Send draft quality feedback to adaptive learning backend
    const handleDraftFeedback = (score, e) => {
        e.stopPropagation();
        setDraftFeedback(score);
        fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'draft-feedback',
                emailId: email.id,
                score: score === 'up' ? 1 : -1,
                draftText: draft?.substring(0, 500),
            }),
        }).catch(() => {});
    };

    // Send answer quality feedback
    const handleAnswerFeedback = (score, e) => {
        e.stopPropagation();
        setAnswerFeedback(score);
        fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'answer-feedback',
                emailId: email.id,
                score: score === 'up' ? 1 : -1,
                question,
                answerText: answer?.substring(0, 500),
            }),
        }).catch(() => {});
    };

    const handleToggle = async () => {
        const opening = !expanded;
        setExpanded(opening);
        // Track email click for adaptive learning
        if (opening && email?.id) {
            fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'result-click', sessionId: 'email-triage', docId: email.id, dwellMs: null }),
            }).catch(() => {});
        }
        // Fetch full email body on first open
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
            // Build full email body: prefer thread content > displayed body > preview
            // Cap per-message at 4000 chars, total at 50000 to stay within LLM limits
            const MAX_PER_MSG = 4000;
            const MAX_TOTAL = 50000;
            let fullBody = email.body || email.snippet || '';
            if (thread && thread.length > 0) {
                fullBody = thread.map(m => {
                    const sender = m.sender?.name || m.sender?.email || 'Unknown';
                    const body = (m.body || '').slice(0, MAX_PER_MSG);
                    return `From: ${sender}\n${body}`;
                }).join('\n---\n');
            }
            if (fullBody.length > MAX_TOTAL) {
                fullBody = fullBody.slice(0, MAX_TOTAL) + '\n\n[... thread truncated for LLM context limit ...]';
            }
            const emailWithFullBody = { ...email, body: fullBody };

            const res = await fetch('/api/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailWithFullBody,
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
                    {/* Clickable category badge — click to override AI categorization */}
                    <span
                        className={`priority-badge ${category.className}`}
                        onClick={(e) => { e.stopPropagation(); setShowCategoryPicker(p => !p); }}
                        title="Click to re-categorize (teaches InGen)"
                        style={{ cursor: 'pointer', position: 'relative' }}
                    >
                        {overriddenCategory && <Tag size={10} style={{ marginRight: '3px', opacity: 0.7 }} />}
                        {category.label}
                    </span>
                    {/* Category picker dropdown */}
                    {showCategoryPicker && (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                position: 'absolute', zIndex: 50, right: '60px', top: '45px',
                                background: '#1e293b', border: '1px solid #334155', borderRadius: '8px',
                                padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px',
                                boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                            }}
                        >
                            <div style={{ fontSize: '10px', color: '#94a3b8', padding: '2px 8px', fontWeight: 600, textTransform: 'uppercase' }}>
                                Re-categorize
                            </div>
                            {Object.entries(categoryConfig).map(([key, cfg]) => (
                                <button
                                    key={key}
                                    onClick={(e) => handleCategoryOverride(key, e)}
                                    style={{
                                        padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
                                        background: effectiveCategory === key ? `${cfg.color}22` : 'transparent',
                                        color: effectiveCategory === key ? cfg.color : '#94a3b8',
                                        fontSize: '12px', fontWeight: 500, textAlign: 'left',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.target.style.background = `${cfg.color}15`; }}
                                    onMouseLeave={(e) => { e.target.style.background = effectiveCategory === key ? `${cfg.color}22` : 'transparent'; }}
                                >
                                    {cfg.label}
                                </button>
                            ))}
                        </div>
                    )}
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
                    {/* Fallback: show cached body when thread is empty or not loaded */}
                    {(!thread || (thread && thread.length === 0)) && !threadLoading && (
                        <EmailBody body={email.body} bodyHtml={email.bodyHtml} snippet={email.snippet} />
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div><strong>Answer:</strong> {answer}</div>
                                    {/* Answer feedback — adaptive learning */}
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                                        <button
                                            onClick={(e) => handleAnswerFeedback('up', e)}
                                            style={{
                                                padding: '3px 6px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                                background: answerFeedback === 'up' ? 'rgba(34,197,94,0.2)' : 'transparent',
                                                color: answerFeedback === 'up' ? '#22c55e' : '#64748b',
                                            }}
                                            title="Helpful answer"
                                        >
                                            <ThumbsUp size={13} />
                                        </button>
                                        <button
                                            onClick={(e) => handleAnswerFeedback('down', e)}
                                            style={{
                                                padding: '3px 6px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                                background: answerFeedback === 'down' ? 'rgba(239,68,68,0.2)' : 'transparent',
                                                color: answerFeedback === 'down' ? '#ef4444' : '#64748b',
                                            }}
                                            title="Not helpful"
                                        >
                                            <ThumbsDown size={13} />
                                        </button>
                                    </div>
                                </div>
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
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px', alignItems: 'center' }}>
                                        {/* Draft feedback — adaptive learning */}
                                        <div style={{ display: 'flex', gap: '2px', marginRight: 'auto' }}>
                                            <button
                                                onClick={(e) => handleDraftFeedback('up', e)}
                                                title="Good draft"
                                                style={{
                                                    padding: '4px 8px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                                    background: draftFeedback === 'up' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)',
                                                    color: draftFeedback === 'up' ? '#22c55e' : '#64748b',
                                                    fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px',
                                                }}
                                            >
                                                <ThumbsUp size={12} /> {draftFeedback === 'up' ? 'Thanks!' : ''}
                                            </button>
                                            <button
                                                onClick={(e) => handleDraftFeedback('down', e)}
                                                title="Poor draft"
                                                style={{
                                                    padding: '4px 8px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                                    background: draftFeedback === 'down' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                                    color: draftFeedback === 'down' ? '#ef4444' : '#64748b',
                                                    fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px',
                                                }}
                                            >
                                                <ThumbsDown size={12} /> {draftFeedback === 'down' ? 'Noted' : ''}
                                            </button>
                                        </div>
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
