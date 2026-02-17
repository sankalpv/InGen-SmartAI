'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, AlertCircle, Copy } from 'lucide-react';

function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000 / 60);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
}

export default function SlackCard({ message }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(message.aiSuggestedReply || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className={`card animate-in ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpanded(!expanded)}
        >
            <div className="slack-card-header">
                <div className="slack-avatar">{message.from.avatar}</div>

                <div className="slack-info">
                    <div className="slack-from">{message.from.name}</div>
                    <div className="slack-channel">{message.channel} · {timeAgo(message.timestamp)}</div>
                </div>

                <div className="email-meta">
                    {message.needsResponse && (
                        <span className="priority-badge high">Needs Reply</span>
                    )}
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            <div className="slack-message">{message.message}</div>

            {expanded && (
                <>
                    {message.actionItem && (
                        <div className="slack-action-item">
                            <AlertCircle size={14} />
                            <strong>Action:</strong> {message.actionItem}
                        </div>
                    )}

                    {message.aiSuggestedReply && (
                        <div className="slack-reply-section">
                            <div className="slack-reply-label">
                                <Sparkles size={12} />
                                AI-Suggested Reply
                            </div>
                            <div className="slack-reply-text">{message.aiSuggestedReply}</div>
                            <div className="email-reply-actions" style={{ marginTop: 10 }}>
                                <button className="btn btn-secondary" onClick={handleCopy}>
                                    <Copy size={14} />
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
