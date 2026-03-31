'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Users, MapPin, Send, RefreshCw, ChevronDown, ChevronUp, Mail, MessageSquare, FileText, Ticket } from 'lucide-react';

export default function MeetingPrepPage() {
    const [meetings, setMeetings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [prepState, setPrepState] = useState({}); // { [eventId]: { status, brief, context, expanded } }

    const loadMeetings = useCallback(async () => {
        setLoading(true);
        try {
            const dateParam = date ? `&date=${date}` : '';
            // Use the calendar route to get meetings for a specific date
            const res = await fetch(`/api/meeting-prep?list=true${dateParam}`);
            const data = await res.json();
            setMeetings(data.meetings || []);
        } catch (e) {
            console.error('Failed to load meetings:', e);
            setMeetings([]);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => { loadMeetings(); }, [loadMeetings]);

    async function prepMeeting(eventId, title) {
        setPrepState(prev => ({
            ...prev,
            [eventId]: { status: 'loading', brief: null, context: null, expanded: true },
        }));

        try {
            const dateParam = date ? `&date=${date}` : '';
            const res = await fetch(`/api/meeting-prep?preview=true&eventId=${encodeURIComponent(eventId)}${dateParam}`);
            const data = await res.json();

            if (!res.ok || data.error) throw new Error(data.error || 'Prep failed');

            setPrepState(prev => ({
                ...prev,
                [eventId]: { status: 'done', brief: data.brief, context: data.context, expanded: true },
            }));
        } catch (e) {
            setPrepState(prev => ({
                ...prev,
                [eventId]: { status: 'error', error: e.message, expanded: true },
            }));
        }
    }

    async function sendToSlack(eventId) {
        setPrepState(prev => ({
            ...prev,
            [eventId]: { ...prev[eventId], sending: true },
        }));
        try {
            const dateParam = date ? `&date=${date}` : '';
            const res = await fetch(`/api/meeting-prep?send=true&eventId=${encodeURIComponent(eventId)}${dateParam}`);
            const data = await res.json();
            setPrepState(prev => ({
                ...prev,
                [eventId]: { ...prev[eventId], sending: false, slackSent: data.slackSent },
            }));
        } catch (e) {
            setPrepState(prev => ({
                ...prev,
                [eventId]: { ...prev[eventId], sending: false, slackError: e.message },
            }));
        }
    }

    function toggleExpand(eventId) {
        setPrepState(prev => ({
            ...prev,
            [eventId]: { ...prev[eventId], expanded: !prev[eventId]?.expanded },
        }));
    }

    function formatTime(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }

    function formatDuration(start, end) {
        if (!start || !end) return '';
        const mins = Math.round((new Date(end) - new Date(start)) / 60000);
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    function minsUntil(iso) {
        if (!iso) return null;
        const diff = Math.round((new Date(iso) - Date.now()) / 60000);
        if (diff < 0) return null;
        if (diff < 60) return `in ${diff}m`;
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        return `in ${h}h${m > 0 ? ` ${m}m` : ''}`;
    }

    const isToday = date === new Date().toISOString().split('T')[0];

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Meeting Prep</h1>
                    <p className="page-subtitle">AI-powered context briefs from emails, Slack, and tickets</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--card-bg)',
                            color: 'var(--text)',
                            fontSize: '14px',
                        }}
                    />
                    <button
                        onClick={loadMeetings}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <RefreshCw size={14} />
                        Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner" />
                    <span>Loading meetings...</span>
                </div>
            ) : meetings.length === 0 ? (
                <div className="empty-state">
                    <Calendar size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                    <p>No meetings found for {isToday ? 'today' : date}</p>
                    <p style={{ fontSize: '13px', opacity: 0.6 }}>Solo blocks, all-day events, and cancelled meetings are filtered out</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {meetings.map(meeting => {
                        const state = prepState[meeting.id] || {};
                        const until = minsUntil(meeting.startTime);
                        const isUpcoming = until !== null;

                        return (
                            <div
                                key={meeting.id}
                                className="card"
                                style={{
                                    border: isUpcoming && parseInt(until) <= 20
                                        ? '1px solid var(--accent)'
                                        : '1px solid var(--border)',
                                }}
                            >
                                {/* Meeting header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                                                {meeting.title}
                                            </h3>
                                            {until && (
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    background: 'var(--accent)',
                                                    color: 'white',
                                                    fontWeight: 600,
                                                    flexShrink: 0,
                                                }}>
                                                    {until}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', opacity: 0.7 }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={12} />
                                                {formatTime(meeting.startTime)} – {formatTime(meeting.endTime)}
                                                <span style={{ opacity: 0.6 }}>({formatDuration(meeting.startTime, meeting.endTime)})</span>
                                            </span>
                                            {meeting.organizer && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Users size={12} />
                                                    {meeting.organizer}
                                                </span>
                                            )}
                                            {meeting.attendees?.length > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Users size={12} />
                                                    {meeting.attendees.slice(0, 3).join(', ')}
                                                    {meeting.attendees.length > 3 && ` +${meeting.attendees.length - 3}`}
                                                </span>
                                            )}
                                            {meeting.location && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <MapPin size={12} />
                                                    {meeting.location.length > 50 ? meeting.location.slice(0, 50) + '…' : meeting.location}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        {state.status === 'done' && (
                                            <>
                                                <button
                                                    onClick={() => toggleExpand(meeting.id)}
                                                    className="btn-secondary"
                                                    style={{ padding: '6px 10px' }}
                                                    title={state.expanded ? 'Collapse' : 'Expand'}
                                                >
                                                    {state.expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                                <button
                                                    onClick={() => sendToSlack(meeting.id)}
                                                    className="btn-secondary"
                                                    disabled={state.sending || state.slackSent}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
                                                    title="Send to Slack self-DM"
                                                >
                                                    <Send size={13} />
                                                    {state.slackSent ? 'Sent ✓' : state.sending ? 'Sending…' : 'Send to Slack'}
                                                </button>
                                                <button
                                                    onClick={() => prepMeeting(meeting.id, meeting.title)}
                                                    className="btn-secondary"
                                                    style={{ padding: '6px 10px' }}
                                                    title="Refresh brief"
                                                >
                                                    <RefreshCw size={13} />
                                                </button>
                                            </>
                                        )}
                                        {state.status !== 'done' && (
                                            <button
                                                onClick={() => prepMeeting(meeting.id, meeting.title)}
                                                className="btn-primary"
                                                disabled={state.status === 'loading'}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                {state.status === 'loading' ? (
                                                    <><RefreshCw size={13} className="spin" />Preparing…</>
                                                ) : (
                                                    <>📋 Prep Me</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Brief + context */}
                                {state.status === 'error' && (
                                    <div style={{ marginTop: '12px', padding: '10px', background: 'var(--error-bg, #fee)', borderRadius: '6px', fontSize: '13px', color: 'var(--error, #c00)' }}>
                                        Error: {state.error}
                                    </div>
                                )}

                                {state.status === 'done' && state.expanded && (
                                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                        {/* AI Brief */}
                                        <div style={{
                                            padding: '14px 16px',
                                            background: 'var(--hover-bg)',
                                            borderRadius: '8px',
                                            fontSize: '14px',
                                            lineHeight: '1.7',
                                            marginBottom: '14px',
                                            borderLeft: '3px solid var(--accent)',
                                        }}>
                                            {state.brief}
                                        </div>

                                        {/* Context sources */}
                                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', opacity: 0.7 }}>
                                            {state.context?.emailCount > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Mail size={11} /> {state.context.emailCount} email{state.context.emailCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {state.context?.slackCount > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <MessageSquare size={11} /> {state.context.slackCount} Slack message{state.context.slackCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {state.context?.quipCount > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FileText size={11} /> {state.context.quipCount} Quip doc{state.context.quipCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                            {state.context?.ticketCount > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Ticket size={11} /> {state.context.ticketCount} ticket{state.context.ticketCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Slack messages detail */}
                                        {state.context?.slackMessages?.length > 0 && (
                                            <details style={{ marginTop: '12px' }}>
                                                <summary style={{ fontSize: '12px', cursor: 'pointer', opacity: 0.6, userSelect: 'none' }}>
                                                    Show Slack sources ({state.context.slackMessages.length})
                                                </summary>
                                                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    {state.context.slackMessages.map((m, i) => (
                                                        <div key={i} style={{
                                                            padding: '8px 10px',
                                                            background: 'var(--hover-bg)',
                                                            borderRadius: '6px',
                                                            fontSize: '12px',
                                                        }}>
                                                            <div style={{ opacity: 0.6, marginBottom: '2px' }}>
                                                                #{m.channel} · @{m.user}
                                                            </div>
                                                            <div style={{ lineHeight: '1.5' }}>{m.text?.slice(0, 200)}{m.text?.length > 200 ? '…' : ''}</div>
                                                            {m.permalink && (
                                                                <a href={m.permalink} target="_blank" rel="noopener noreferrer"
                                                                    style={{ fontSize: '11px', opacity: 0.5, textDecoration: 'none' }}>
                                                                    View in Slack →
                                                                </a>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .page-container { padding: 24px; max-width: 900px; }
                .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
                .page-title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
                .page-subtitle { font-size: 14px; opacity: 0.6; margin: 0; }
                .card { padding: 16px 20px; border-radius: 12px; background: var(--card-bg); }
                .btn-primary { padding: 8px 16px; border-radius: 8px; background: var(--accent); color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
                .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
                .btn-secondary { padding: 8px 12px; border-radius: 8px; background: var(--hover-bg); color: var(--text); border: 1px solid var(--border); cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; }
                .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
                .loading-state { display: flex; align-items: center; gap: 12px; padding: 40px; opacity: 0.6; }
                .spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
                .spin { animation: spin 0.8s linear infinite; }
                .empty-state { text-align: center; padding: 60px 20px; opacity: 0.5; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
