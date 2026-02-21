'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Mail,
    Calendar,
    MessageSquare,
    Sparkles,
    AlertTriangle,
    Clock,
    Inbox,
    RefreshCw, // Added
    BarChart2, // Added
} from 'lucide-react';
import Header from '@/components/Header';
import EmailCard from '@/components/EmailCard';
import MeetingCard from '@/components/MeetingCard';
import SlackCard from '@/components/SlackCard';
import WeeklyRetroModal from '@/components/WeeklyRetroModal'; // Added
import InsightNotifications from '@/components/InsightNotifications'; // Added

import AIChat from '@/components/AIChat'; // Added

// Email Priority Lanes Component - Visual swim lanes by urgency
function EmailPriorityLanes({ emails }) {
    const lanes = [
        {
            id: 'respond_now',
            label: '🔴 Respond Now',
            color: '#ef4444',
            bgColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
            emails: emails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_now'),
            defaultOpen: true
        },
        {
            id: 'respond_today',
            label: '🟡 Respond Today',
            color: '#eab308',
            bgColor: 'rgba(234, 179, 8, 0.06)',
            borderColor: 'rgba(234, 179, 8, 0.2)',
            emails: emails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_today'),
            defaultOpen: true
        },
        {
            id: 'fyi',
            label: '🟢 FYI / Low Priority',
            color: '#6b7280',
            bgColor: 'rgba(107, 114, 128, 0.05)',
            borderColor: 'rgba(107, 114, 128, 0.15)',
            emails: emails.filter(e => {
                const cat = (e.aiCategory || 'fyi').toLowerCase();
                return cat !== 'respond_now' && cat !== 'respond_today';
            }),
            defaultOpen: false
        }
    ];

    const [openLanes, setOpenLanes] = useState(
        lanes.reduce((acc, lane) => ({ ...acc, [lane.id]: lane.defaultOpen }), {})
    );

    const toggleLane = (laneId) => {
        setOpenLanes(prev => ({ ...prev, [laneId]: !prev[laneId] }));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {lanes.map(lane => (
                <div key={lane.id} style={{
                    background: lane.bgColor,
                    border: `1px solid ${lane.borderColor}`,
                    borderRadius: '12px',
                    overflow: 'hidden'
                }}>
                    {/* Lane Header */}
                    <div
                        onClick={() => toggleLane(lane.id)}
                        style={{
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            borderBottom: openLanes[lane.id] && lane.emails.length > 0 ? `1px solid ${lane.borderColor}` : 'none'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                {lane.label}
                            </span>
                            <span style={{
                                background: lane.emails.length > 0 ? lane.color : 'rgba(107, 114, 128, 0.3)',
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: '600',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                minWidth: '24px',
                                textAlign: 'center'
                            }}>
                                {lane.emails.length}
                            </span>
                        </div>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '14px', transition: 'transform 0.2s' }}>
                            {openLanes[lane.id] ? '▾' : '▸'}
                        </span>
                    </div>

                    {/* Lane Content */}
                    {openLanes[lane.id] && lane.emails.length > 0 && (
                        <div style={{ padding: '8px' }}>
                            {lane.emails.map(email => (
                                <EmailCard key={email.id} email={email} />
                            ))}
                        </div>
                    )}

                    {/* Empty Lane */}
                    {openLanes[lane.id] && lane.emails.length === 0 && (
                        <div style={{
                            padding: '16px',
                            textAlign: 'center',
                            color: 'var(--text-tertiary)',
                            fontSize: '13px'
                        }}>
                            No emails in this category
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('emails');
    const [briefing, setBriefing] = useState(null);
    const [emails, setEmails] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [slackMessages, setSlackMessages] = useState([]);
    const [stats, setStats] = useState({ emails: 0, meetings: 0, slack: 0 }); // Added
    const [isLoading, setIsLoading] = useState(true);
    const [isBriefingLoading, setIsBriefingLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [showRetro, setShowRetro] = useState(false); // Added
    const [showInsightFeed, setShowInsightFeed] = useState(false); // Added
    const [selectedInsight, setSelectedInsight] = useState(null); // Added
    const [emailSource, setEmailSource] = useState('outlook');

    const fetchData = useCallback(async (sourceOverride) => {
        const currentSource = sourceOverride || emailSource;
        setError(null);
        setBriefing(null);
        setIsBriefingLoading(true); // Show skeleton immediately

        try {
            const emailUrl = currentSource === 'outlook' ? '/api/outlook-local' : '/api/emails';

            // Fire all requests in parallel — none block each other
            const [emailRes, calendarRes] = await Promise.allSettled([
                fetch(emailUrl),
                fetch('/api/calendar'),
            ]);

            // Handle emails
            if (emailRes.status === 'fulfilled') {
                if (emailRes.value.status === 401) {
                    setEmailSource('outlook');
                    return fetchData('outlook');
                }
                try {
                    const data = await emailRes.value.json();
                    if (!data.error) setEmails(data.emails || []);
                } catch (e) { }
            }

            // Handle calendar
            if (calendarRes.status === 'fulfilled' && calendarRes.value.ok) {
                try {
                    const data = await calendarRes.value.json();
                    if (!data.error) setMeetings(data.meetings || []);
                } catch (e) { }
            }

            // Reveal the dashboard as soon as emails + meetings are ready
            setIsLoading(false);

            // Slack — fire and forget
            fetch('/api/slack')
                .then(r => r.json())
                .then(data => { if (!data.error) setSlackMessages(data.messages || []); })
                .catch(() => { });

            // Briefing — skeleton is already showing, replace when ready
            try {
                const res = await fetch(`/api/analyze?source=${currentSource}`);
                const data = await res.json();
                if (!data.error) setBriefing(data);
                else console.warn('Analysis error:', data.error);
            } catch (e) {
                console.error('Analysis fetch failed', e);
            } finally {
                setIsBriefingLoading(false);
            }

        } catch (error) {
            console.error('Failed to fetch data:', error);
            setError('System error: Failed to fetch data');
            setIsLoading(false);
            setIsBriefingLoading(false);
        }
    }, [emailSource]);


    useEffect(() => {
        let mounted = true;
        async function load() {
            setIsLoading(true);
            await fetchData();
            // Safety net: if fetchData returned early (e.g. redirect), clear the spinner
            if (mounted) setIsLoading(false);
        }
        load();
        return () => { mounted = false; };
    }, [fetchData]);




    const handleSourceChange = async (source) => {
        if (source === emailSource) return;
        setEmailSource(source);
        setIsLoading(true);
        // Clear current data to indicate loading
        setEmails([]);
        setBriefing(null);

        await fetchData(source);
        setIsLoading(false);
    };

    // Check fetchData dependency if we need to modify it too.
    // For now, handleSourceChange does the fetch.

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // await fetchData(); // Refetch based on current source?
        // Let's modify handleRefresh to check source
        if (false) { // Gmail removed — Outlook-only
            await fetchData();
        } else {
            await handleSourceChange('outlook');
        }
        setIsRefreshing(false);
    };

    // Filter out sent emails - only show received emails in triage
    const receivedEmails = emails.filter(e => !e.isSent && e.folder !== 'Sent Items');

    // Filter Logic to handle "FYI" fallback for unknown AI categories
    const urgentEmails = receivedEmails.filter(e => e.aiCategory === 'respond_now');

    // Improved sort: Don't drop emails with unknown categories
    const sortedEmails = [...receivedEmails].sort((a, b) => {
        const priority = { 'respond_now': 0, 'respond_today': 1, 'fyi': 2 };

        // Normalize categories to lowercase to handle AI inconsistencies
        const catA = (a.aiCategory || 'fyi').toLowerCase();
        const catB = (b.aiCategory || 'fyi').toLowerCase();

        const pA = priority[catA] ?? 2; // Default to 'fyi' (bottom)
        const pB = priority[catB] ?? 2;

        return pA - pB;
    });

    const actionSlack = slackMessages.filter(m => m.needsResponse || m.actionItem);

    const tabs = [
        { id: 'emails', label: 'Email Triage', icon: Mail, count: receivedEmails.length },
        { id: 'meetings', label: 'Meeting Prep', icon: Calendar, count: meetings.length },
        { id: 'slack', label: 'Slack Digest', icon: MessageSquare, count: slackMessages.length },
    ];

    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
                <div className="loading-text">
                    Preparing your daily briefing<span className="dots"></span>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Header onRefresh={handleRefresh} isLoading={isRefreshing} onShowRetro={() => setShowRetro(true)} />

            {/* Error Banner */}
            {error && (
                <div style={{
                    backgroundColor: '#fee2e2',
                    color: '#dc2626',
                    padding: '12px 16px',
                    marginBottom: '20px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    border: '1px solid #fecaca'
                }}>
                    <AlertTriangle size={20} />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{error}</span>
                </div>
            )}

            {/* ... Error Banner ... */}

            {/* Source: Outlook Local only */}

            {/* Stats Bar */}
            <div className="stats-bar">
                <div className="stat-card animate-in">
                    <div className="stat-icon blue">
                        <Inbox size={22} />
                    </div>
                    <div>
                        <div className="stat-value">{briefing?.summary?.totalEmails || emails.length}</div>
                        <div className="stat-label">Total Emails</div>
                    </div>
                </div>
                <div className="stat-card animate-in">
                    <div className="stat-icon red">
                        <AlertTriangle size={22} />
                    </div>
                    <div>
                        <div className="stat-value">{briefing?.summary?.urgentCount || urgentEmails.length}</div>
                        <div className="stat-label">Urgent</div>
                    </div>
                </div>
                <div className="stat-card animate-in">
                    <div className="stat-icon purple">
                        <Calendar size={22} />
                    </div>
                    <div>
                        <div className="stat-value">{briefing?.summary?.meetingsToday || meetings.length}</div>
                        <div className="stat-label">Meetings Today</div>
                    </div>
                </div>
                <div className="stat-card animate-in">
                    <div className="stat-icon orange">
                        <MessageSquare size={22} />
                    </div>
                    <div>
                        <div className="stat-value">{briefing?.summary?.slackActionItems || actionSlack.length}</div>
                        <div className="stat-label">Slack Actions</div>
                    </div>
                </div>
            </div>

            <WeeklyRetroModal isOpen={showRetro} onClose={() => setShowRetro(false)} />

            {/* AI Briefing Skeleton — shown while generating */}
            {isBriefingLoading && !briefing && (
                <div className="ai-briefing animate-in" style={{ position: 'relative', overflow: 'hidden' }}>
                    <div className="ai-briefing-header">
                        <div className="ai-badge">
                            <Sparkles size={12} className="sparkle" />
                            AI Daily Briefing
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{
                                display: 'inline-block',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: 'var(--accent-purple)',
                                animation: 'pulse 1.2s ease-in-out infinite',
                            }} />
                            Generating with AI…
                        </span>
                    </div>
                    {/* Skeleton lines */}
                    {[100, 85, 92, 60].map((w, i) => (
                        <div key={i} style={{
                            height: '14px',
                            width: `${w}%`,
                            borderRadius: '6px',
                            background: 'var(--glass-border, rgba(255,255,255,0.08))',
                            marginTop: i === 0 ? '12px' : '8px',
                            animation: `shimmer 1.6s ease-in-out ${i * 0.12}s infinite`,
                            backgroundSize: '200% 100%',
                            backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                        }} />
                    ))}
                    <div style={{
                        marginTop: '16px',
                        display: 'flex',
                        gap: '8px',
                    }}>
                        {[40, 55, 35].map((w, i) => (
                            <div key={i} style={{
                                height: '28px',
                                width: `${w}%`,
                                borderRadius: '8px',
                                background: 'var(--glass-border, rgba(255,255,255,0.05))',
                                animation: `shimmer 1.6s ease-in-out ${0.3 + i * 0.1}s infinite`,
                                backgroundSize: '200% 100%',
                                backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                            }} />
                        ))}
                    </div>
                </div>
            )}

            {/* AI Briefing — shown when ready */}
            {briefing && (
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
                                fontSize: '0.9rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: 'var(--accent-blue)',
                                marginBottom: '12px',
                                marginTop: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{
                                    fontSize: '1.1rem'
                                }}>📄</span>
                                Linked Documents
                            </h3>
                            <div style={{
                                whiteSpace: 'pre-wrap',
                                fontSize: '0.9rem',
                                lineHeight: '1.7',
                                color: 'var(--text-primary)',
                                background: 'rgba(59, 130, 246, 0.05)',
                                padding: '16px',
                                borderRadius: '8px',
                                border: '1px solid rgba(59, 130, 246, 0.15)',
                                fontFamily: 'inherit'
                            }}>
                                {briefing.linkedDocuments}
                            </div>
                        </div>
                    )}

                    {briefing.topPriorities && briefing.topPriorities.length > 0 && (
                        <div className="priorities-list">
                            <h3 style={{
                                fontSize: '0.9rem',
                                fontWeight: '700',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: 'var(--accent-purple)',
                                marginBottom: '12px',
                                marginTop: '20px'
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
            )}

            {/* Section Tabs */}
            <div className="section-tabs">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            className={`section-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon size={16} />
                            {tab.label}
                            <span className="tab-count">{tab.count}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {activeTab === 'emails' && (
                <div>
                    {sortedEmails.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📭</div>
                            <div className="empty-state-text">No emails to show</div>
                        </div>
                    ) : (
                        <EmailPriorityLanes emails={sortedEmails} />
                    )}
                </div>
            )}

            {activeTab === 'meetings' && (
                <div>
                    {meetings.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📅</div>
                            <div className="empty-state-text">No meetings today</div>
                        </div>
                    ) : (
                        meetings.map((meeting) => (
                            <MeetingCard key={meeting.id} meeting={meeting} />
                        ))
                    )}
                </div>
            )}

            {activeTab === 'slack' && (
                <div>
                    {slackMessages.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">💬</div>
                            <div className="empty-state-text">No Slack messages to show</div>
                        </div>
                    ) : (
                        slackMessages.map((msg) => (
                            <SlackCard key={msg.id} message={msg} />
                        ))
                    )}
                </div>
            )}
            {/* Chat Interface */}
            <AIChat />

            {/* Toast Notifications */}
            <InsightNotifications 
                onInsightClick={(insight) => {
                    setSelectedInsight(insight);
                    setShowInsightFeed(true);
                }} 
            />
        </div>
    );
}
