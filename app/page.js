'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Mail,
    Calendar,
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
import WeeklyRetroModal from '@/components/WeeklyRetroModal'; // Added
import InsightNotifications from '@/components/InsightNotifications'; // Added

import AIChat from '@/components/AIChat'; // Added
import StreamingBriefing from '@/components/StreamingBriefing'; // Phase 3: ChatGPT-style streaming

// Email Priority Lanes Component - Visual swim lanes by urgency
const PAGE_SIZE = 20;

function EmailPriorityLanes({ emails }) {
    const [emailDateRange, setEmailDateRange] = useState(3); // Default: today + last 2 days (3 days)
    const [currentPage, setCurrentPage] = useState(1);

    // Filter emails by date range
    const cutoffDate = new Date(Date.now() - emailDateRange * 24 * 60 * 60 * 1000);
    const filteredEmails = emails.filter(e => {
        const emailDate = new Date(e.date || e.received || e.receivedDateTime);
        return emailDate >= cutoffDate;
    });

    // Pagination
    const totalPages = Math.ceil(filteredEmails.length / PAGE_SIZE);
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const paginatedEmails = filteredEmails.slice(startIdx, startIdx + PAGE_SIZE);

    // Reset to page 1 when date range changes
    const handleDateRangeChange = (value) => {
        setEmailDateRange(value);
        setCurrentPage(1);
    };

    const dateRangeOptions = [
        { value: 1, label: 'Today' },
        { value: 3, label: '3 days' },
        { value: 7, label: '7 days' },
        { value: 14, label: '14 days' },
        { value: 30, label: '30 days' },
    ];

    const lanes = [
        {
            id: 'respond_now',
            label: '🔴 Respond Now',
            color: '#ef4444',
            bgColor: 'rgba(239, 68, 68, 0.08)',
            borderColor: 'rgba(239, 68, 68, 0.25)',
            emails: paginatedEmails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_now'),
            defaultOpen: true
        },
        {
            id: 'respond_today',
            label: '🟡 Respond Today',
            color: '#eab308',
            bgColor: 'rgba(234, 179, 8, 0.06)',
            borderColor: 'rgba(234, 179, 8, 0.2)',
            emails: paginatedEmails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_today'),
            defaultOpen: true
        },
        {
            id: 'fyi',
            label: '🟢 FYI / Low Priority',
            color: '#6b7280',
            bgColor: 'rgba(107, 114, 128, 0.05)',
            borderColor: 'rgba(107, 114, 128, 0.15)',
            emails: paginatedEmails.filter(e => {
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
            {/* Date Range Filter + Pagination Info */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                    Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filteredEmails.length)} of {filteredEmails.length} emails
                    {filteredEmails.length !== emails.length && ` (${emails.length} total)`}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                    {dateRangeOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => handleDateRangeChange(opt.value)}
                            style={{
                                padding: '5px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: emailDateRange === opt.value ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                color: emailDateRange === opt.value ? '#a78bfa' : 'var(--text-secondary)',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

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

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    marginTop: '8px',
                    padding: '12px 0'
                }}>
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: currentPage === 1 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(139, 92, 246, 0.15)',
                            color: currentPage === 1 ? 'var(--text-tertiary)' : '#a78bfa',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: currentPage === 1 ? 'default' : 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        ← Previous
                    </button>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: currentPage === totalPages ? 'rgba(255, 255, 255, 0.03)' : 'rgba(139, 92, 246, 0.15)',
                            color: currentPage === totalPages ? 'var(--text-tertiary)' : '#a78bfa',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: currentPage === totalPages ? 'default' : 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('emails');
    const [briefing, setBriefing] = useState(null);
    const [emails, setEmails] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [stats, setStats] = useState({ emails: 0, meetings: 0 }); // Added
    const [isLoading, setIsLoading] = useState(true);
    const [isBriefingLoading, setIsBriefingLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [showRetro, setShowRetro] = useState(false); // Added
    const [showInsightFeed, setShowInsightFeed] = useState(false); // Added
    const [selectedInsight, setSelectedInsight] = useState(null); // Added
    const [emailSource, setEmailSource] = useState('outlook');
    const [isStreamingBriefing, setIsStreamingBriefing] = useState(false);

    const fetchData = useCallback(async (sourceOverride) => {
        const currentSource = sourceOverride || emailSource;
        setError(null);
        setBriefing(null);
        setIsBriefingLoading(true); // Show skeleton immediately

        try {
            // PHASE 1: Fast initial load (20 emails + calendar) - target <3s
            const emailUrl = currentSource === 'outlook' ? '/api/outlook-local?count=200' : '/api/emails';

            const [emailRes, calendarRes] = await Promise.allSettled([
                fetch(emailUrl),
                fetch('/api/calendar'),
            ]);

            // Handle emails (initial batch)
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

            // Reveal the dashboard immediately with initial data
            setIsLoading(false);

            // PHASE 2: Background lazy loading (non-blocking)
            // Note: Phase 1 now requests full cache (count=200), so no need for a second email fetch


            // Briefing — try cached first (instant), then use streaming for fresh generation
            try {
                const res = await fetch(`/api/analyze?source=${currentSource}`);
                const data = await res.json();
                if (!data.error) {
                    setBriefing(data);
                    setIsBriefingLoading(false);
                    
                    if (data.source === 'cached') {
                        console.log(`[Dashboard] Serving cached briefing (${data.cacheAge}s old)`);
                    }
                } else {
                    // No cache available — use streaming mode (ChatGPT-style)
                    console.log('[Dashboard] No cached briefing, switching to streaming mode');
                    setIsBriefingLoading(false);
                    setIsStreamingBriefing(true);
                }
            } catch (e) {
                console.error('Analysis fetch failed, switching to streaming mode', e);
                setIsBriefingLoading(false);
                setIsStreamingBriefing(true);
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


    // Filter to last 3 days (today + 2 previous days) for stats and default view
    const threeDaysAgo = new Date(new Date().toDateString());
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    const todayEnd = new Date(new Date().toDateString());
    todayEnd.setDate(todayEnd.getDate() + 1);

    const recentEmails = receivedEmails.filter(e => {
        const d = new Date(e.date || e.received || e.receivedDateTime);
        return d >= threeDaysAgo && d < todayEnd;
    });
    const recentUrgent = recentEmails.filter(e => (e.aiCategory || '').toLowerCase() === 'respond_now');
    const recentMeetings = meetings.filter(m => {
        const d = new Date(m.startTime || m.start || m.date);
        return d >= threeDaysAgo && d < todayEnd;
    });

    const tabs = [
        { id: 'emails', label: 'Email Triage', icon: Mail },
        { id: 'meetings', label: 'Meeting Prep', icon: Calendar, count: recentMeetings.length },
    ];

    // XKCD comic state for loading screen
    const [xkcdComic, setXkcdComic] = useState(null);

    useEffect(() => {
        if (!isLoading) return;
        
        let cancelled = false;
        
        async function fetchRandomXkcd() {
            try {
                const num = Math.floor(Math.random() * 2900) + 1;
                const res = await fetch('/api/xkcd');
                if (res.ok && !cancelled) {
                    const data = await res.json();
                    setXkcdComic(data);
                }
            } catch (e) { /* network error — skip */ }
        }
        
        fetchRandomXkcd();
        const interval = setInterval(fetchRandomXkcd, 15000);
        
        return () => { cancelled = true; clearInterval(interval); };
    }, [isLoading]);

    if (isLoading) {
        return (
            <div className="loading-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
                <div className="loading-spinner" />
                <div className="loading-text" style={{ marginBottom: '24px' }}>
                    Preparing your daily briefing<span className="dots"></span>
                </div>
                
                {/* XKCD Comic — rotates every 5 seconds */}
                {xkcdComic && (
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                        padding: '16px',
                        marginTop: '20px',
                        animation: 'fadeIn 0.5s ease'
                    }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            While you wait... xkcd #{xkcdComic.num}
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '12px' }}>
                            {xkcdComic.title}
                        </div>
                        <img 
                            src={xkcdComic.img} 
                            alt={xkcdComic.alt}
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: '300px', 
                                borderRadius: '8px',
                                margin: '0 auto',
                                display: 'block'
                            }} 
                        />
                        {xkcdComic.alt && (
                            <div style={{ 
                                fontSize: '12px', 
                                color: 'var(--text-secondary)', 
                                marginTop: '10px',
                                fontStyle: 'italic',
                                lineHeight: '1.5'
                            }}>
                                {xkcdComic.alt}
                            </div>
                        )}
                    </div>
                )}
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
                        <div className="stat-value">{recentEmails.length}</div>
                        <div className="stat-label">Last 3 Days Emails</div>
                    </div>
                </div>
                <div className="stat-card animate-in">
                    <div className="stat-icon red">
                        <AlertTriangle size={22} />
                    </div>
                    <div>
                        <div className="stat-value">{recentUrgent.length}</div>
                        <div className="stat-label">Urgent</div>
                    </div>
                </div>
                <div className="stat-card animate-in">
                    <div className="stat-icon purple">
                        <Calendar size={22} />
                    </div>
                    <div>
                        <div className="stat-value">{recentMeetings.length}</div>
                        <div className="stat-label">Last 3 Days Meetings</div>
                    </div>
                </div>
            </div>

            <WeeklyRetroModal isOpen={showRetro} onClose={() => setShowRetro(false)} />

            {/* AI Briefing — Streaming mode (ChatGPT-style word-by-word) */}
            {isStreamingBriefing && !briefing && (
                <StreamingBriefing 
                    onComplete={(parsed) => {
                        setBriefing(parsed);
                        setIsStreamingBriefing(false);
                    }}
                />
            )}

            {/* AI Briefing Skeleton — shown briefly while checking cache */}
            {isBriefingLoading && !briefing && !isStreamingBriefing && (
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
                            Checking cache…
                        </span>
                    </div>
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
                            {tab.count != null && <span className="tab-count">{tab.count}</span>}
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
                        meetings.map((meeting, idx) => (
                            <MeetingCard key={`${meeting.id}_${meeting.startTime || idx}`} meeting={meeting} />
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
