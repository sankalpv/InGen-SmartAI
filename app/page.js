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

import AIChat from '@/components/AIChat'; // Added

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState('emails');
    const [briefing, setBriefing] = useState(null);
    const [emails, setEmails] = useState([]);
    const [meetings, setMeetings] = useState([]);
    const [slackMessages, setSlackMessages] = useState([]);
    const [stats, setStats] = useState({ emails: 0, meetings: 0, slack: 0 }); // Added
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [showRetro, setShowRetro] = useState(false); // Added
    const [emailSource, setEmailSource] = useState('outlook');

    const fetchData = useCallback(async (sourceOverride) => {
        const currentSource = sourceOverride || emailSource;
        setError(null);
        const errors = [];
        // Sequential fetching to prevent Gemini API rate limits (429)
        // Free tier has limited concurrency, so parallel requests cause failures.

        try {
            // UX Optimization: Parallel Fetching - DISABLED due to Outlook Concurrency Issues
            // Going back to sequential for stability

            // 1. Fetch Emails
            try {
                let res;
                if (currentSource === 'outlook') {
                    res = await fetch('/api/outlook-local');
                } else {
                    res = await fetch('/api/emails');
                }

                if (res.status === 401 && currentSource === 'gmail') {
                    console.log('Gmail unauthenticated, switching to Outlook...');
                    setEmailSource('outlook');
                    return fetchData('outlook');
                }

                const data = await res.json();
                if (data.error) errors.push(`Emails: ${data.error}`);
                else setEmails(data.emails || []);
            } catch (e) {
                errors.push('Failed to connect to Email service');
            }

            setIsLoading(false); // Show UI partial load

            // 2. Fetch Calendar
            try {
                // Always fetch local Outlook calendar (ID 432)
                const res = await fetch('/api/calendar');
                const data = await res.json();
                if (data.error) errors.push(`Calendar: ${data.error}`);
                else setMeetings(data.meetings || []);
            } catch (e) {
                errors.push('Failed to connect to Calendar service');
            }

            // 3. Process Slack & Analysis (can remain parallel-ish or just after)
            const [slackRes, analysisRes] = await Promise.allSettled([
                fetch('/api/slack'),
                fetch(`/api/analyze?source=${currentSource}`)
            ]);

            // 3. Process Slack
            if (slackRes.status === 'fulfilled') {
                try {
                    const data = await slackRes.value.json();
                    setSlackMessages(data.messages || []);
                } catch (e) { }
            }

            // 4. Process Analysis
            if (analysisRes.status === 'fulfilled') {
                try {
                    const data = await analysisRes.value.json();
                    if (!data.error) setBriefing(data);
                } catch (e) { }
            }

            // 3. Fetch Slack (Mock/Optional)
            try {
                const res = await fetch('/api/slack');
                const data = await res.json();
                if (data.error) errors.push(`Slack: ${data.error}`);
                else setSlackMessages(data.messages || []);
            } catch (e) {
                // Ignore Slack connection errors usually
            }

            // 4. Generate Briefing (Heavier AI task)
            try {
                const res = await fetch(`/api/analyze?source=${currentSource}`);
                const data = await res.json();
                if (data.error) {
                    console.warn(`Analysis error: ${data.error}`);
                    if (errors.length === 0) errors.push(data.error);
                } else {
                    setBriefing(data);
                }
            } catch (e) {
                console.error('Analysis fetch failed', e);
            }

            if (errors.length > 0) {
                setError(errors.join(' | '));
            }

        } catch (error) {
            console.error('Failed to fetch data:', error);
            setError('System error: Failed to fetch data');
        }
    }, [emailSource]);

    useEffect(() => {
        let mounted = true;
        async function load() {
            setIsLoading(true);
            await fetchData();
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
        if (emailSource === 'gmail') {
            await fetchData();
        } else {
            await handleSourceChange('outlook');
        }
        setIsRefreshing(false);
    };

    // Filter Logic to handle "FYI" fallback for unknown AI categories
    const urgentEmails = emails.filter(e => e.aiCategory === 'respond_now');

    // Improved sort: Don't drop emails with unknown categories
    const sortedEmails = [...emails].sort((a, b) => {
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
        { id: 'emails', label: 'Email Triage', icon: Mail, count: emails.length },
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

            {/* Source Toggle */}
            <div className="source-toggle-container" style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 24px 16px' }}>
                <div className="toggle-switch">
                    <button
                        className={`toggle-option ${emailSource === 'gmail' ? 'active' : ''}`}
                        onClick={() => handleSourceChange('gmail')}
                    >
                        Gmail
                    </button>
                    <button
                        className={`toggle-option ${emailSource === 'outlook' ? 'active' : ''}`}
                        onClick={() => handleSourceChange('outlook')}
                    >
                        Outlook (Local)
                    </button>
                </div>
            </div>

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

            {/* AI Briefing */}
            {briefing && (
                <div className="ai-briefing animate-in">
                    <div className="ai-briefing-header">
                        <div className="ai-badge">
                            <Sparkles size={12} className="sparkle" />
                            AI Daily Briefing
                        </div>
                    </div>
                    <p className="ai-briefing-text">{briefing.greeting}</p>

                    {briefing.topPriorities && briefing.topPriorities.length > 0 && (
                        <div className="priorities-list">
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
                        sortedEmails.map((email) => (
                            <EmailCard key={email.id} email={email} />
                        ))
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
        </div>
    );
}
