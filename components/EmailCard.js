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

// Safely extract sender display name from email.from (handles both object and string formats)
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

export default function EmailCard({ email }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [draft, setDraft] = useState(email.aiSuggestedReply);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isFindingTime, setIsFindingTime] = useState(false);
    const [showSlots, setShowSlots] = useState(false);
    const [slots, setSlots] = useState([]);
    const [constraints, setConstraints] = useState(null);

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
        // Optional: Auto-populate draft
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
            if (!res.ok) {
                const errorText = await res.text();
                console.error('Draft API Error:', errorText);
                throw new Error(`Server Error: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            if (data.draft) {
                setDraft(data.draft);
            }
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
                    email: email  // Pass full email object for Quip URL detection
                })
            });
            const data = await res.json();
            if (data.answer) {
                setAnswer(data.answer);
            }
        } catch (error) {
            console.error('Ask Question failed:', error);
        } finally {
            setIsAsking(false);
        }
    };

    return (
        <div
            className={`card animate-in ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpanded(!expanded)}
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
                    {/* AI Summary Section */}
                    {email.summary && (
                        <div className="email-summary-box" style={{
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
                            <div style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>
                                {email.summary}
                            </div>
                        </div>
                    )}

                    {/* Ask Question UI */}
                    <div className="ask-question-section" style={{ marginBottom: '16px', padding: '12px', background: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}>
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAskQuestion(e);
                                }}
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

                    <div style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        overflowWrap: 'anywhere',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        maxHeight: '400px',
                        fontSize: '0.9rem',
                        lineHeight: '1.65',
                        color: 'var(--text-secondary)',
                        padding: '12px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        marginTop: '8px',
                    }}>
                        {email.body || email.snippet}
                    </div>

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

                                    {/* Action Row */}
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

                                    {/* Regeneration Options */}
                                    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', borderTop: '1px solid #334155', paddingTop: '8px' }}>
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center', marginRight: '4px' }}>Regenerate:</span>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e)} title="Retry with default settings">
                                            <RefreshCw size={12} style={{ marginRight: '4px' }} />
                                            Retry
                                        </button>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e, 'Write a detailed and professional reply.')}>
                                            Detailed
                                        </button>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e, 'Write a concise and short reply.')}>
                                            Concise
                                        </button>
                                        <button className="btn btn-secondary btn-xs" onClick={(e) => handleGenerateDraft(e, 'Write a polite but firm decline reply.')}>
                                            Decline
                                        </button>
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

                    {/* Time Slots Popover */}
                    {showSlots && (
                        <div className="slots-popover animate-in" style={{
                            marginTop: '10px',
                            background: '#1e293b',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            padding: '12px'
                        }}>
                            <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Based on: {constraints?.durationMinutes}m, {constraints?.dateRange}</span>
                                <button onClick={() => setShowSlots(false)}><X size={14} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                {slots.map((slot, i) => (
                                    <button
                                        key={i}
                                        className="slot-btn"
                                        onClick={(e) => handleSlotClick(slot, e)}
                                        style={{
                                            padding: '8px',
                                            fontSize: '0.85rem',
                                            background: '#334155',
                                            border: 'none',
                                            borderRadius: '6px',
                                            color: 'white',
                                            cursor: 'pointer',
                                            textAlign: 'left'
                                        }}
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
