'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Bot, Sparkles, Trash2, Maximize2, Minimize2, Clock } from 'lucide-react';

// Simple markdown-like formatting for AI responses
function FormattedMessage({ content }) {
    if (!content) return null;

    const lines = content.split('\n');
    const elements = [];
    let inList = false;
    let listItems = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`list-${elements.length}`} style={{ margin: '8px 0', paddingLeft: '20px', listStyleType: 'disc' }}>
                    {listItems.map((item, i) => (
                        <li key={i} style={{ marginBottom: '4px', lineHeight: '1.6' }}>{formatInline(item)}</li>
                    ))}
                </ul>
            );
            listItems = [];
            inList = false;
        }
    };

    const formatInline = (text) => {
        // Bold: **text**
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
            }
            // Inline code: `code`
            const codeParts = part.split(/(`[^`]+`)/g);
            return codeParts.map((cp, j) => {
                if (cp.startsWith('`') && cp.endsWith('`')) {
                    return (
                        <code key={`${i}-${j}`} style={{
                            background: 'rgba(139, 92, 246, 0.15)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontSize: '0.85em',
                            color: '#c4b5fd'
                        }}>
                            {cp.slice(1, -1)}
                        </code>
                    );
                }
                return cp;
            });
        });
    };

    lines.forEach((line, idx) => {
        const trimmed = line.trim();

        // Bullet list items
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.match(/^\d+\.\s/)) {
            inList = true;
            const text = trimmed.replace(/^[-•]\s+/, '').replace(/^\d+\.\s+/, '');
            listItems.push(text);
            return;
        }

        flushList();

        // Empty line
        if (trimmed === '') {
            elements.push(<div key={`br-${idx}`} style={{ height: '8px' }} />);
            return;
        }

        // Heading-like (starts with ### or ## or #)
        if (trimmed.startsWith('### ')) {
            elements.push(
                <div key={idx} style={{ fontWeight: 600, fontSize: '0.95em', color: '#c4b5fd', marginTop: '12px', marginBottom: '4px' }}>
                    {formatInline(trimmed.slice(4))}
                </div>
            );
            return;
        }
        if (trimmed.startsWith('## ')) {
            elements.push(
                <div key={idx} style={{ fontWeight: 700, fontSize: '1em', color: '#a78bfa', marginTop: '14px', marginBottom: '4px' }}>
                    {formatInline(trimmed.slice(3))}
                </div>
            );
            return;
        }

        // Regular paragraph
        elements.push(
            <p key={idx} style={{ margin: '4px 0', lineHeight: '1.65' }}>{formatInline(trimmed)}</p>
        );
    });

    flushList();

    return <div>{elements}</div>;
}

// Suggested prompts for empty chat state
const SUGGESTED_PROMPTS = [
    { emoji: '📧', text: 'Summarize my emails from today' },
    { emoji: '📅', text: "What's my busiest day this week?" },
    { emoji: '👥', text: 'Who should I follow up with?' },
    { emoji: '🎯', text: 'What meetings need prep?' },
];

function formatTime(date) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AIChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: "Hi! I'm your **Dive Deep Assistant**. Ask me anything about your emails, meetings, or schedule.\n\nTry one of the suggestions below, or type your own question.", time: new Date() }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Keyboard shortcut: Escape to close
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleClear = () => {
        setMessages([{ role: 'assistant', content: "Chat cleared. Ready to **dive deep** again!\n\nTry one of the suggestions below.", time: new Date() }]);
    };

    const sendMessage = useCallback(async (messageText) => {
        if (!messageText.trim() || isLoading) return;

        const userMessage = { role: 'user', content: messageText, time: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Add placeholder assistant message for streaming
        setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [], streaming: true, time: new Date() }]);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: messageText,
                    history: messages.map(m => ({ role: m.role, content: m.content })),
                    stream: true
                }),
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let sources = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'sources') {
                            sources = data.sources || [];
                        } else if (data.type === 'chunk') {
                            fullText += data.text;
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (updated[lastIdx]?.streaming) {
                                    updated[lastIdx] = { ...updated[lastIdx], content: fullText, sources };
                                }
                                return updated;
                            });
                        } else if (data.type === 'done') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (updated[lastIdx]?.streaming) {
                                    updated[lastIdx] = { ...updated[lastIdx], content: fullText, sources, streaming: false };
                                }
                                return updated;
                            });
                        } else if (data.type === 'error') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                updated[lastIdx] = { role: 'assistant', content: `Error: ${data.message}`, streaming: false, time: new Date() };
                                return updated;
                            });
                        }
                    } catch (parseErr) {
                        // Skip malformed SSE lines
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.streaming) {
                    updated[lastIdx] = { role: 'assistant', content: "Sorry, I encountered an error. Please try again.", streaming: false, time: new Date() };
                } else {
                    updated.push({ role: 'assistant', content: "Sorry, I encountered an error. Please try again.", time: new Date() });
                }
                return updated;
            });
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handleSuggestionClick = (text) => {
        sendMessage(text);
    };

    const showSuggestions = messages.length <= 1 && !isLoading;

    // Size classes
    const panelWidth = isExpanded ? 'w-[640px]' : 'w-[420px]';
    const panelHeight = isExpanded ? 'h-[720px]' : 'h-[600px]';

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    padding: '14px 22px',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                    color: 'white',
                    borderRadius: '16px',
                    border: 'none',
                    boxShadow: '0 8px 32px rgba(139, 92, 246, 0.4), 0 2px 8px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    zIndex: 50,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '15px',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit'
                }}
                onMouseEnter={(e) => { e.target.style.transform = 'scale(1.05)'; e.target.style.boxShadow = '0 12px 40px rgba(139, 92, 246, 0.5), 0 4px 12px rgba(0,0,0,0.4)'; }}
                onMouseLeave={(e) => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 8px 32px rgba(139, 92, 246, 0.4), 0 2px 8px rgba(0,0,0,0.3)'; }}
            >
                <Sparkles size={20} />
                Dive Deep
            </button>
        );
    }

    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: isExpanded ? '640px' : '420px',
            height: isExpanded ? '720px' : '600px',
            background: 'rgba(15, 15, 20, 0.92)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '20px',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            overflow: 'hidden',
            fontFamily: 'inherit',
            transition: 'width 0.3s ease, height 0.3s ease',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.08) 0%, transparent 100%)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                    }}>
                        <Bot size={20} color="white" />
                    </div>
                    <div>
                        <h3 style={{ fontWeight: 600, color: 'white', fontSize: '15px', margin: 0, letterSpacing: '0.01em' }}>
                            Dive Deep
                        </h3>
                        <p style={{ fontSize: '12px', color: '#818cf8', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                            RAG-powered · your data
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? 'Minimize' : 'Expand'}
                        style={{
                            padding: '8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: 'rgba(255,255,255,0.4)',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                    >
                        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button
                        onClick={handleClear}
                        title="Clear History"
                        style={{
                            padding: '8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: 'rgba(255,255,255,0.4)',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                    >
                        <Trash2 size={16} />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        title="Close (Esc)"
                        style={{
                            padding: '8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: 'rgba(255,255,255,0.4)',
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
            }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}>
                        <div style={{
                            maxWidth: '88%',
                            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            padding: '12px 16px',
                            fontSize: '14px',
                            lineHeight: '1.6',
                            ...(msg.role === 'user'
                                ? {
                                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                    color: 'white',
                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                                }
                                : {
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    color: '#e2e8f0',
                                }),
                        }}>
                            {msg.role === 'user' ? (
                                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                            ) : (
                                <>
                                    <FormattedMessage content={msg.content} />
                                    {msg.streaming && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginLeft: '4px',
                                        }}>
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#818cf8', animation: 'pulse 1s ease-in-out infinite' }} />
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a78bfa', animation: 'pulse 1s ease-in-out 0.2s infinite' }} />
                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c4b5fd', animation: 'pulse 1s ease-in-out 0.4s infinite' }} />
                                        </span>
                                    )}
                                </>
                            )}

                            {/* Sources */}
                            {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                                <div style={{
                                    marginTop: '12px',
                                    paddingTop: '10px',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                }}>
                                    <p style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        color: '#818cf8',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.08em',
                                        marginBottom: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}>
                                        <Sparkles size={10} /> Sources ({msg.sources.length})
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {msg.sources.slice(0, 4).map((source, i) => (
                                            <div key={i} style={{
                                                fontSize: '12px',
                                                color: '#94a3b8',
                                                padding: '6px 10px',
                                                borderRadius: '8px',
                                                background: 'rgba(0, 0, 0, 0.2)',
                                                border: '1px solid rgba(255, 255, 255, 0.04)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                overflow: 'hidden',
                                            }}>
                                                <span style={{ width: '3px', height: '16px', borderRadius: '2px', background: '#6366f1', flexShrink: 0 }} />
                                                <span style={{ fontWeight: 500, color: '#818cf8', flexShrink: 0 }}>
                                                    {source.from ? source.from.split(' ')[0] : 'Unknown'}
                                                </span>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {source.subject}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Timestamp */}
                        {msg.time && (
                            <span style={{
                                fontSize: '10px',
                                color: 'rgba(255, 255, 255, 0.2)',
                                marginTop: '4px',
                                padding: '0 4px',
                            }}>
                                {formatTime(msg.time)}
                            </span>
                        )}
                    </div>
                ))}

                {/* Loading indicator when not streaming yet */}
                {isLoading && !messages[messages.length - 1]?.streaming && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.04)',
                            borderRadius: '16px 16px 16px 4px',
                            padding: '14px 18px',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}>
                            <span style={{ fontSize: '12px', color: '#818cf8', fontWeight: 500 }}>Thinking</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#818cf8', animation: 'bounce 1s ease-in-out infinite' }} />
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#a78bfa', animation: 'bounce 1s ease-in-out 0.15s infinite' }} />
                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#c4b5fd', animation: 'bounce 1s ease-in-out 0.3s infinite' }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            {showSuggestions && (
                <div style={{
                    padding: '0 20px 12px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                }}>
                    {SUGGESTED_PROMPTS.map((prompt, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleSuggestionClick(prompt.text)}
                            disabled={isLoading}
                            style={{
                                padding: '10px 12px',
                                borderRadius: '12px',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                background: 'rgba(255, 255, 255, 0.03)',
                                color: '#94a3b8',
                                fontSize: '12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.15s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                lineHeight: '1.4',
                                fontFamily: 'inherit',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
                                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                                e.currentTarget.style.color = '#c4b5fd';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                                e.currentTarget.style.color = '#94a3b8';
                            }}
                        >
                            <span style={{ fontSize: '16px', flexShrink: 0 }}>{prompt.emoji}</span>
                            {prompt.text}
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} style={{
                padding: '16px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(0, 0, 0, 0.2)',
            }}>
                <div style={{ position: 'relative' }}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your emails, meetings, schedule..."
                        style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'white',
                            borderRadius: '14px',
                            padding: '14px 52px 14px 18px',
                            fontSize: '14px',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            outline: 'none',
                            transition: 'all 0.2s',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box',
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'rgba(139, 92, 246, 0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)'; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'; e.target.style.boxShadow = 'none'; }}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        style={{
                            position: 'absolute',
                            right: '6px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            padding: '10px',
                            background: input.trim() ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                            color: 'white',
                            borderRadius: '10px',
                            border: 'none',
                            cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: input.trim() ? 1 : 0.3,
                        }}
                    >
                        <Send size={16} />
                    </button>
                </div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: '8px',
                }}>
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)' }}>
                        Powered by local AI · RAG search across your emails & calendar
                    </span>
                </div>
            </form>
        </div>
    );
}