'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Copy, Send } from 'lucide-react';

const avatarColors = [
    'linear-gradient(135deg, #4f8cff, #3b6fd4)',
    'linear-gradient(135deg, #a855f7, #7c3aed)',
    'linear-gradient(135deg, #f87171, #dc2626)',
    'linear-gradient(135deg, #34d399, #059669)',
    'linear-gradient(135deg, #fb923c, #ea580c)',
    'linear-gradient(135deg, #22d3ee, #0891b2)',
];

function getAvatarColor(name) {
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return avatarColors[hash % avatarColors.length];
}

function getInitials(name) {
    return name
        .split(' ')
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
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

    const handleGenerateDraft = async (e) => {
        e.stopPropagation();
        setIsGenerating(true);
        try {
            const res = await fetch('/api/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email,
                    intent: 'Reply positively and succinctly.' // Default intent
                })
            });
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

    return (
        <div
            className={`card animate-in ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpanded(!expanded)}
        >
            <div className="email-card-header">
                <div
                    className="email-avatar"
                    style={{ background: getAvatarColor(email.from.name) }}
                >
                    {getInitials(email.from.name)}
                </div>

                <div className="email-info">
                    <div className="email-from">{email.from.name}</div>
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

                    <div className="email-body-preview" style={{ whiteSpace: 'pre-wrap' }}>
                        {email.body || email.snippet}
                    </div>

                    {(draft || isGenerating) ? (
                        <div className="email-reply-section">
                            <div className="email-reply-label">
                                <Sparkles size={14} />
                                {isGenerating ? 'Agent Thinking...' : 'AI-Suggested Reply'}
                            </div>
                            {isGenerating ? (
                                <div className="loading-spinner" style={{ margin: '10px 0' }} />
                            ) : (
                                <div className="email-reply-text">{draft}</div>
                            )}
                            {!isGenerating && (
                                <div className="email-reply-actions">
                                    <button className="btn btn-secondary" onClick={handleCopy}>
                                        <Copy size={14} />
                                        {copied ? 'Copied!' : 'Copy Reply'}
                                    </button>
                                    <button className="btn btn-primary" onClick={(e) => e.stopPropagation()}>
                                        <Send size={14} />
                                        Send Reply
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary" onClick={handleGenerateDraft}>
                                <Sparkles size={14} style={{ marginRight: '6px' }} />
                                Draft Reply with Agent
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
