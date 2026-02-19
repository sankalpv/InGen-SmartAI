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

    const [loading, setLoading] = useState(false);

    const handleGenerateBrief = async (e) => {
        e.stopPropagation();
        setLoading(true);
        try {
            const attendeesStr = meeting.attendees.map(a => a.email).join(',');
            const params = new URLSearchParams({
                title: meeting.title,
                description: meeting.description || '',
                attendees: attendeesStr,
                startTime: meeting.startTime || '',
            });
            const res = await fetch(`/api/meeting-brief?${params}`);
            const data = await res.json();
            if (data.brief) setBrief(data.brief);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
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
                                {/* Context section */}
                                {(typeof brief === 'object' ? brief.context : brief) && (
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '6px' }}>
                                            Context
                                        </div>
                                        <div className="meeting-context-text" style={{ whiteSpace: 'pre-line' }}>
                                            {typeof brief === 'object' ? brief.context : brief}
                                        </div>
                                    </div>
                                )}

                                {/* Questions / Action Items */}
                                {typeof brief === 'object' && brief.questions?.length > 0 && (
                                    <div>
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
