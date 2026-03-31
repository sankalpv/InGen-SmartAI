'use client';

import { useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    MapPin,
    Users,
    Clock,
    Sparkles,
    HelpCircle,
    Send,
    Mail,
    MessageSquare,
    FileText,
} from 'lucide-react';

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

function getDuration(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const mins = Math.round((endDate - startDate) / 1000 / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

export default function MeetingCard({ meeting }) {
    const [expanded, setExpanded] = useState(false);
    // Pre-populate brief from data already fetched by the calendar API
    const initialBrief = meeting.aiContext
        ? { context: meeting.aiContext, questions: meeting.aiQuestions || [] }
        : null;
    const [brief, setBrief] = useState(initialBrief);
    const [prepContext, setPrepContext] = useState(null); // richer context from meeting-prep
    const [slackSent, setSlackSent] = useState(false);
    const [slackSending, setSlackSending] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleGenerateBrief = async (e) => {
        e.stopPropagation();
        setLoading(true);
        try {
            // Use the richer meeting-prep API first (Slack + emails + tickets)
            // Always pass title so the service can fall back if eventId doesn't match local store
            const params = new URLSearchParams({ preview: 'true' });
            if (meeting.title) params.set('title', meeting.title);
            if (meeting.id) params.set('eventId', meeting.id);
            const res = await fetch(`/api/meeting-prep?${params}`);
            const data = await res.json();
            if (data.brief) {
                // Store as rich object so we can show source chips
                setBrief({ context: data.brief, questions: [] });
                setPrepContext(data.context || null);
            } else if (data.error) {
                // Fallback to old meeting-brief endpoint if meeting not in local calendar
                const attendeesStr = (meeting.attendees || []).map(a => a.email).join(',');
                const fallbackParams = new URLSearchParams({
                    title: meeting.title,
                    description: meeting.description || '',
                    attendees: attendeesStr,
                    startTime: meeting.startTime || '',
                });
                const res2 = await fetch(`/api/meeting-brief?${fallbackParams}`);
                const data2 = await res2.json();
                if (data2.brief) setBrief(data2.brief);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSendToSlack = async (e) => {
        e.stopPropagation();
        setSlackSending(true);
        try {
            const params = new URLSearchParams({ send: 'true' });
            if (meeting.id) params.set('eventId', meeting.id);
            else params.set('title', meeting.title);
            await fetch(`/api/meeting-prep?${params}`);
            setSlackSent(true);
        } catch (err) {
            console.error(err);
        } finally {
            setSlackSending(false);
        }
    };

    const timeStr = formatTime(meeting.startTime);
    const hour = timeStr.replace(/:[0-9]{2}/, '').replace(/ (AM|PM)/, '');
    const period = timeStr.includes('AM') ? 'AM' : 'PM';
    const mins = timeStr.match(/:(\d{2})/)?.[1] || '00';

    return (
        <div
            className={`card animate-in ${expanded ? 'expanded' : ''}`}
            onClick={() => setExpanded(!expanded)}
        >
            <div className="meeting-card-header">
                <div className="meeting-time-block">
                    <div className="meeting-time-hour">{hour}:{mins}</div>
                    <div className="meeting-time-period">{period}</div>
                </div>

                <div className="meeting-info">
                    <div className="meeting-title">{meeting.title}</div>
                    <div className="meeting-details">
                        <span className="meeting-detail">
                            <Clock size={14} />
                            {getDuration(meeting.startTime, meeting.endTime)}
                        </span>
                        <span className="meeting-detail">
                            <MapPin size={14} />
                            {meeting.location}
                        </span>
                        <span className="meeting-detail">
                            <Users size={14} />
                            {meeting.attendees.length} attendees
                        </span>
                    </div>

                    <div className="meeting-attendees-list">
                        {meeting.attendees.slice(0, 4).map((a, i) => (
                            <span key={i} className="attendee-chip">
                                {a.name}
                            </span>
                        ))}
                        {meeting.attendees.length > 4 && (
                            <span className="attendee-chip">
                                +{meeting.attendees.length - 4} more
                            </span>
                        )}
                    </div>
                </div>

                <div className="email-meta">
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {expanded && (
                <>
                    <div className="meeting-context-section">
                        <div className="meeting-context-label">
                            <Sparkles size={14} />
                            AI Context Brief
                        </div>

                        {brief ? (
                            <div>
                                {/* AI brief prose */}
                                {(typeof brief === 'object' ? brief.context : brief) && (
                                    <div className="meeting-context-text" style={{ whiteSpace: 'pre-line', marginBottom: '12px' }}>
                                        {typeof brief === 'object' ? brief.context : brief}
                                    </div>
                                )}

                                {/* Source chips (email / Slack / Quip / ticket counts) */}
                                {prepContext && (
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', opacity: 0.65, marginBottom: '12px' }}>
                                        {prepContext.emailCount > 0 && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Mail size={11} /> {prepContext.emailCount} email{prepContext.emailCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {prepContext.slackCount > 0 && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MessageSquare size={11} /> {prepContext.slackCount} Slack
                                            </span>
                                        )}
                                        {prepContext.quipCount > 0 && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <FileText size={11} /> {prepContext.quipCount} Quip
                                            </span>
                                        )}
                                        {prepContext.ticketCount > 0 && (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <HelpCircle size={11} /> {prepContext.ticketCount} ticket{prepContext.ticketCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Send to Slack + Refresh buttons */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        onClick={handleSendToSlack}
                                        disabled={slackSending || slackSent}
                                        style={{
                                            background: slackSent ? 'rgba(34,197,94,0.1)' : 'var(--accent-purple-glow)',
                                            border: `1px solid ${slackSent ? 'rgba(34,197,94,0.5)' : 'var(--accent-purple)'}`,
                                            color: slackSent ? 'rgb(34,197,94)' : 'var(--accent-purple)',
                                            padding: '6px 14px',
                                            borderRadius: 'var(--radius-md)',
                                            cursor: slackSending || slackSent ? 'default' : 'pointer',
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                        }}
                                    >
                                        <Send size={12} />
                                        {slackSent ? 'Sent to Slack ✓' : slackSending ? 'Sending…' : 'Send to Slack'}
                                    </button>
                                    <button
                                        onClick={handleGenerateBrief}
                                        disabled={loading}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-muted)',
                                            padding: '6px 12px',
                                            borderRadius: 'var(--radius-md)',
                                            cursor: loading ? 'wait' : 'pointer',
                                            fontSize: '0.8rem',
                                        }}
                                    >
                                        {loading ? 'Refreshing…' : 'Refresh Brief'}
                                    </button>
                                </div>

                                {/* Questions / Action Items (legacy fallback) */}
                                {typeof brief === 'object' && brief.questions?.length > 0 && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <HelpCircle size={12} /> Questions &amp; Action Items
                                        </div>
                                        <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {brief.questions.map((q, i) => (
                                                <li key={i} style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{q}</li>
                                            ))}
                                        </ol>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ marginTop: '5px' }}>
                                <button
                                    onClick={handleGenerateBrief}
                                    disabled={loading}
                                    style={{
                                        background: 'var(--accent-purple-glow)',
                                        border: '1px solid var(--accent-purple)',
                                        color: 'var(--accent-purple)',
                                        padding: '8px 16px',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: loading ? 'wait' : 'pointer',
                                        fontSize: '0.85rem',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {loading ? (
                                        <>Generating Context...</>
                                    ) : (
                                        <>Generate Brief for {meeting.title}</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
