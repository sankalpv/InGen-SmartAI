'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, Clock } from 'lucide-react';

/**
 * StreamingBriefing — ChatGPT-style progressive text rendering for AI Daily Briefing
 * Streams tokens from /api/analyze?stream=true and renders sections as they appear
 */
export default function StreamingBriefing({ onComplete, sourceUrl = '/api/analyze?stream=true&source=outlook' }) {
    const [streamText, setStreamText] = useState('');
    const [isStreaming, setIsStreaming] = useState(true);
    const [status, setStatus] = useState('Connecting...');
    const [parsedBriefing, setParsedBriefing] = useState(null);
    const containerRef = useRef(null);

    useEffect(() => {
        let cancelled = false;

        async function startStream() {
            try {
                setStatus('Fetching emails...');
                const res = await fetch(sourceUrl);

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || cancelled) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            if (data.type === 'start') {
                                setStatus('Generating briefing...');
                            } else if (data.type === 'progress') {
                                setStatus(data.message);
                            } else if (data.type === 'chunk') {
                                fullText += data.text;
                                if (!cancelled) setStreamText(fullText);
                            } else if (data.type === 'done') {
                                if (!cancelled) {
                                    setIsStreaming(false);
                                    setStatus('Complete');
                                    // Parse into structured format
                                    const parsed = parseStreamedBriefing(fullText);
                                    setParsedBriefing(parsed);
                                    if (onComplete) onComplete(parsed);
                                }
                            } else if (data.type === 'error') {
                                if (!cancelled) {
                                    setIsStreaming(false);
                                    setStatus(`Error: ${data.message}`);
                                }
                            }
                        } catch (parseErr) { }
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    setIsStreaming(false);
                    setStatus(`Failed: ${error.message}`);
                }
            }
        }

        startStream();
        return () => { cancelled = true; };
    }, [sourceUrl, onComplete]);

    // Auto-scroll to bottom as text streams
    useEffect(() => {
        if (containerRef.current && isStreaming) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [streamText, isStreaming]);

    // If we have a final parsed briefing, render the structured view
    if (parsedBriefing && !isStreaming) {
        return <StructuredBriefing briefing={parsedBriefing} />;
    }

    // Streaming view — render text progressively with section detection
    return (
        <div className="ai-briefing animate-in" style={{ position: 'relative', overflow: 'hidden' }}>
            <div className="ai-briefing-header">
                <div className="ai-badge">
                    <Sparkles size={12} className="sparkle" />
                    AI Daily Briefing
                </div>
                <span style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    marginLeft: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                }}>
                    {isStreaming && (
                        <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: 'var(--accent-purple)',
                            animation: 'pulse 1.2s ease-in-out infinite',
                        }} />
                    )}
                    {status}
                </span>
            </div>

            <div ref={containerRef} style={{
                maxHeight: '500px',
                overflowY: 'auto',
                marginTop: '12px'
            }}>
                {streamText ? (
                    <StreamedSections text={streamText} isStreaming={isStreaming} />
                ) : (
                    // Skeleton while waiting for first token
                    <div>
                        {[100, 85, 92, 60].map((w, i) => (
                            <div key={i} style={{
                                height: '14px',
                                width: `${w}%`,
                                borderRadius: '6px',
                                background: 'var(--glass-border, rgba(255,255,255,0.08))',
                                marginTop: i === 0 ? 0 : '8px',
                                animation: `shimmer 1.6s ease-in-out ${i * 0.12}s infinite`,
                                backgroundSize: '200% 100%',
                                backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                            }} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * StreamedSections — renders streaming text with section header detection
 * Parses ## headers in real-time and applies appropriate styling
 */
function StreamedSections({ text, isStreaming }) {
    // Split by ## headers
    const sections = [];
    const lines = text.split('\n');
    let currentSection = { title: null, content: '' };

    for (const line of lines) {
        const headerMatch = line.match(/^##\s+(.+)/);
        if (headerMatch) {
            if (currentSection.title || currentSection.content.trim()) {
                sections.push({ ...currentSection });
            }
            currentSection = { title: headerMatch[1].trim(), content: '' };
        } else {
            currentSection.content += line + '\n';
        }
    }
    sections.push(currentSection);

    return (
        <div>
            {sections.map((section, idx) => (
                <div key={idx} style={{ marginBottom: '16px' }}>
                    {section.title && (
                        <SectionHeader title={section.title} />
                    )}
                    <div style={{
                        whiteSpace: 'pre-wrap',
                        fontSize: '0.9rem',
                        lineHeight: '1.7',
                        color: 'var(--text-primary)',
                        ...(section.title === 'LINKED DOCUMENTS' ? {
                            background: 'rgba(59, 130, 246, 0.05)',
                            padding: '16px',
                            borderRadius: '8px',
                            border: '1px solid rgba(59, 130, 246, 0.15)',
                        } : {})
                    }}>
                        {section.content.trim()}
                        {/* Blinking cursor at the end of the last section */}
                        {isStreaming && idx === sections.length - 1 && (
                            <span style={{
                                display: 'inline-block',
                                width: '3px',
                                height: '1em',
                                background: 'var(--accent-purple, #a78bfa)',
                                animation: 'blink 0.8s step-end infinite',
                                marginLeft: '2px',
                                verticalAlign: 'text-bottom',
                                borderRadius: '1px',
                            }} />
                        )}
                    </div>
                </div>
            ))}

            <style jsx>{`
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}

/**
 * SectionHeader — styled header for ## sections
 */
function SectionHeader({ title }) {
    const titleUpper = title.toUpperCase();
    let icon = '📋';
    let color = 'var(--accent-purple)';

    if (titleUpper.includes('EXECUTIVE') || titleUpper.includes('SUMMARY')) {
        icon = '✨';
        color = 'var(--accent-purple)';
    } else if (titleUpper.includes('LINKED') || titleUpper.includes('DOCUMENT')) {
        icon = '📄';
        color = 'var(--accent-blue)';
    } else if (titleUpper.includes('PRIORIT')) {
        icon = '🎯';
        color = 'var(--accent-purple)';
    }

    return (
        <h3 style={{
            fontSize: '0.9rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: color,
            marginBottom: '12px',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
        }}>
            <span style={{ fontSize: '1.1rem' }}>{icon}</span>
            {title}
        </h3>
    );
}

/**
 * StructuredBriefing — final rendered view after streaming completes
 */
function StructuredBriefing({ briefing }) {
    return (
        <div className="ai-briefing animate-in">
            <div className="ai-briefing-header">
                <div className="ai-badge">
                    <Sparkles size={12} className="sparkle" />
                    AI Daily Briefing
                </div>
            </div>
            <p className="ai-briefing-text">{briefing.greeting}</p>

            {briefing.linkedDocuments && (
                <div className="linked-documents">
                    <h3 style={{
                        fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: 'var(--accent-blue)',
                        marginBottom: '12px', marginTop: '20px',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <span style={{ fontSize: '1.1rem' }}>📄</span> Linked Documents
                    </h3>
                    <div style={{
                        whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: '1.7',
                        color: 'var(--text-primary)',
                        background: 'rgba(59, 130, 246, 0.05)', padding: '16px',
                        borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.15)'
                    }}>
                        {briefing.linkedDocuments}
                    </div>
                </div>
            )}

            {briefing.topPriorities && briefing.topPriorities.length > 0 && (
                <div className="priorities-list">
                    <h3 style={{
                        fontSize: '0.9rem', fontWeight: '700', textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: 'var(--accent-purple)',
                        marginBottom: '12px', marginTop: '20px'
                    }}>
                        Top Priorities
                    </h3>
                    {briefing.topPriorities.map((p, i) => (
                        <div key={i} className="priority-item">
                            <span className={`priority-badge ${p.urgency}`}>{p.urgency}</span>
                            <div className="priority-content">
                                <div className="priority-title">{p.title}</div>
                                <div className="priority-reason">{p.reason}</div>
                            </div>
                            {p.deadline && (
                                <span className="priority-deadline">
                                    <Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                    {p.deadline}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Parse streamed text into structured briefing format
 */
function parseStreamedBriefing(rawText) {
    let greeting = rawText;
    let linkedDocuments = null;
    let topPriorities = [];

    const summaryMatch = rawText.match(/##\s*EXECUTIVE SUMMARY([\s\S]*?)(?=##|$)/i);
    const linkedDocsMatch = rawText.match(/##\s*LINKED DOCUMENTS([\s\S]*?)(?=##|$)/i);
    const prioritiesMatch = rawText.match(/##\s*TOP PRIORITIES([\s\S]*?)(?=##|$)/i);

    if (summaryMatch || prioritiesMatch) {
        greeting = summaryMatch ? summaryMatch[1].trim() : "Here is your executive summary.";

        if (linkedDocsMatch) {
            linkedDocuments = linkedDocsMatch[1].trim();
        }

        if (prioritiesMatch) {
            const lines = prioritiesMatch[1].split('\n').filter(l => l.trim().length > 0);
            topPriorities = lines.map(line => {
                const cleanLine = line.trim().replace(/^[-*•]\s*/, '');
                const complexMatch = cleanLine.match(/^(?:\[URGENCY:\s*(HIGH|MEDIUM|LOW)\])?\s*([^|]+)(?:\|\s*(.+))?$/i);

                if (complexMatch) {
                    return {
                        type: 'general',
                        urgency: (complexMatch[1] || 'medium').toLowerCase(),
                        title: complexMatch[2].trim(),
                        reason: complexMatch[3] ? complexMatch[3].trim() : 'AI Highlight',
                        deadline: 'today'
                    };
                }
                return {
                    type: 'general', urgency: 'medium',
                    title: cleanLine, reason: 'AI Suggested', deadline: 'today'
                };
            }).slice(0, 5);
        }
    }

    return {
        summary: { generatedAt: new Date().toISOString() },
        greeting,
        linkedDocuments,
        topPriorities,
        source: 'streamed'
    };
}