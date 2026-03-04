'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';
import Link from 'next/link';

export default function WeekAheadPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedDay, setExpandedDay] = useState(0); // Today expanded by default

    const [aiLoading, setAiLoading] = useState(false);

    useEffect(() => {
        fetchWeekAhead();
    }, []);

    async function fetchWeekAhead() {
        setLoading(true);
        try {
            // PHASE 1: Fast calendar data only (no AI) - target <3s
            const res = await fetch('/api/week-ahead?skipAI=true');
            const result = await res.json();
            if (result.success) {
                setData(result);
                setLoading(false); // Show page immediately with calendar data

                // PHASE 2: Background AI analysis (non-blocking)
                setAiLoading(true);
                try {
                    const aiRes = await fetch('/api/week-ahead?aiOnly=true');
                    const aiResult = await aiRes.json();
                    if (aiResult.success && aiResult.aiAnalysis) {
                        setData(prev => ({ ...prev, aiAnalysis: aiResult.aiAnalysis }));
                    }
                } catch (aiErr) {
                    console.warn('AI analysis failed:', aiErr);
                } finally {
                    setAiLoading(false);
                }
            }
        } catch (error) {
            console.error('Failed to fetch week ahead:', error);
            setLoading(false);
        }
    }

    // Generate placeholder days for skeleton
    const skeletonDays = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return {
            dayName: d.toLocaleDateString('en-US', { weekday: 'long' }),
            dateFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            isToday: i === 0,
            isWeekend: d.getDay() === 0 || d.getDay() === 6
        };
    });

    return (
        <div>
            <Header />
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header — always visible */}
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        📅 Week Ahead
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
                        {data ? `${data.dateRange.start} — ${data.dateRange.end}` : 'Loading calendar...'}
                        {loading && (
                            <span style={{ marginLeft: '12px', fontSize: '12px', color: '#a78bfa', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#a78bfa', animation: 'pulse 1.2s ease-in-out infinite' }} />
                                Fetching from Outlook...
                            </span>
                        )}
                        {!loading && data && (
                            <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-tertiary)', cursor: 'help' }}
                                title="Data sourced from Outlook via AppleScript.">
                                ℹ️ Data from Outlook Calendar
                            </span>
                        )}
                    </p>
                </div>

                {/* Weekly Summary Cards — show skeleton or real data */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                    <SummaryCard icon="📊" label="Total Meetings" value={data ? data.summary.totalMeetings : '—'} subtitle={data ? `${data.summary.avgMeetingsPerDay}/day avg` : 'Loading...'} loading={loading} />
                    <SummaryCard icon="⏱️" label="Meeting Hours" value={data ? `${data.summary.totalMeetingHours}h` : '—'} subtitle={data ? `${data.summary.meetingPercentage}% of work time` : 'Loading...'} color={data && parseInt(data.summary.meetingPercentage) > 60 ? '#ef4444' : '#3b82f6'} loading={loading} />
                    <SummaryCard icon="🎯" label="Deep Work" value={data ? `${data.summary.totalDeepWorkHours}h` : '—'} subtitle={data ? 'available for focus' : 'Loading...'} color="#22c55e" loading={loading} />
                    <SummaryCard icon="👤" label="1:1 Meetings" value={data ? data.summary.total1x1s : '—'} subtitle={data ? 'with team members' : 'Loading...'} color="#8b5cf6" loading={loading} />
                    <SummaryCard icon="🔥" label="Heaviest Day" value={data ? (data.summary.heaviestDay?.name || '-') : '—'} subtitle={data ? `${data.summary.heaviestDay?.hours || 0}h meetings` : 'Loading...'} color="#ef4444" loading={loading} />
                    <SummaryCard icon="🌿" label="Lightest Day" value={data ? (data.summary.lightestDay?.name || '-') : '—'} subtitle={data ? `${data.summary.lightestDay?.hours || 0}h meetings` : 'Loading...'} color="#22c55e" loading={loading} />
                </div>

                {/* AI Weekly Coaching Brief */}
                {data?.aiAnalysis && (
                    <div style={{
                        background: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid rgba(139, 92, 246, 0.25)',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '24px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '20px' }}>🤖</span>
                            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#a78bfa', margin: 0 }}>AI Weekly Coach</h2>
                            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa' }}>Powered by GenAI</span>
                        </div>
                        
                        {/* Executive Summary */}
                        {data.aiAnalysis.weekSummary && (
                            <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
                                {data.aiAnalysis.weekSummary}
                            </p>
                        )}

                        {/* Top Prep Items */}
                        {data.aiAnalysis.topPrepItems && data.aiAnalysis.topPrepItems.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#a78bfa', marginBottom: '8px' }}>
                                    📋 Top Preparation Items
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {data.aiAnalysis.topPrepItems.map((item, i) => (
                                        <div key={i} style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            padding: '8px 12px',
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            borderRadius: '8px',
                                            borderLeft: `3px solid ${i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#3b82f6'}`
                                        }}>
                                            <span style={{ fontSize: '14px', fontWeight: '600', color: i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#3b82f6', minWidth: '20px' }}>
                                                {i + 1}.
                                            </span>
                                            <span style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: '1.4' }}>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            {/* Energy Management */}
                            {data.aiAnalysis.energyManagement && (
                                <div style={{ padding: '12px', background: 'rgba(34, 197, 94, 0.06)', borderRadius: '8px', borderLeft: '3px solid #22c55e' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: '#22c55e', marginBottom: '6px' }}>
                                        ⚡ Energy Management
                                    </div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                                        {data.aiAnalysis.energyManagement}
                                    </p>
                                </div>
                            )}

                            {/* Strategic Opportunity */}
                            {data.aiAnalysis.strategicOpportunity && (
                                <div style={{ padding: '12px', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: '#3b82f6', marginBottom: '6px' }}>
                                        🎯 Strategic Opportunity
                                    </div>
                                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                                        {data.aiAnalysis.strategicOpportunity}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Risk Alerts */}
                        {data.aiAnalysis.riskAlerts && data.aiAnalysis.riskAlerts.length > 0 && (
                            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: '#ef4444', marginBottom: '6px' }}>
                                    ⚠️ Risk Alerts
                                </div>
                                {data.aiAnalysis.riskAlerts.map((alert, i) => (
                                    <p key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: i > 0 ? '4px 0 0 0' : 0 }}>
                                        • {alert}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* AI Loading State - Shows skeleton while AI generates */}
                {data && !data.aiAnalysis && (
                    <div style={{
                        background: 'rgba(139, 92, 246, 0.05)',
                        border: '1px solid rgba(139, 92, 246, 0.15)',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '24px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <span style={{ fontSize: '20px' }}>🤖</span>
                            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#a78bfa', margin: 0 }}>AI Weekly Coach</h2>
                            <span style={{
                                display: 'inline-block',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#a78bfa',
                                animation: 'pulse 1.2s ease-in-out infinite',
                                marginLeft: '8px'
                            }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                {aiLoading ? 'Analyzing your week...' : 'Will generate on next load'}
                            </span>
                        </div>
                        {/* Skeleton lines */}
                        {[100, 85, 70].map((w, i) => (
                            <div key={i} style={{
                                height: '14px',
                                width: `${w}%`,
                                borderRadius: '6px',
                                background: 'rgba(139, 92, 246, 0.1)',
                                marginTop: i === 0 ? 0 : '8px',
                                animation: `shimmer 1.6s ease-in-out ${i * 0.15}s infinite`,
                                backgroundSize: '200% 100%',
                                backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.08) 50%, transparent 100%)',
                            }} />
                        ))}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                            {[45, 45].map((w, i) => (
                                <div key={i} style={{
                                    height: '60px',
                                    width: `${w}%`,
                                    borderRadius: '8px',
                                    background: 'rgba(139, 92, 246, 0.06)',
                                    animation: `shimmer 1.6s ease-in-out ${0.4 + i * 0.1}s infinite`,
                                    backgroundSize: '200% 100%',
                                    backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.05) 50%, transparent 100%)',
                                }} />
                            ))}
                        </div>
                    </div>
                )}

                {/* Day-by-Day Breakdown — show skeleton days while loading, real days when ready */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {data ? (
                        data.days.map((day, index) => (
                            <DayCard 
                                key={day.date} 
                                day={day} 
                                isExpanded={expandedDay === index}
                                onToggle={() => setExpandedDay(expandedDay === index ? -1 : index)}
                            />
                        ))
                    ) : (
                        skeletonDays.map((day, index) => (
                            <SkeletonDayCard key={index} day={day} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function SkeletonDayCard({ day }) {
    return (
        <div style={{
            background: day.isToday ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${day.isToday ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '12px',
            padding: '14px 16px',
            opacity: day.isWeekend ? 0.5 : 1
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ minWidth: '120px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {day.isToday ? '📌 Today' : day.dayName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{day.dateFormatted}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', gap: '12px' }}>
                    {[120, 90, 80].map((w, i) => (
                        <div key={i} style={{
                            height: '14px', width: `${w}px`, borderRadius: '6px',
                            background: 'rgba(255,255,255,0.06)',
                            animation: `shimmer 1.6s ease-in-out ${i * 0.15}s infinite`,
                            backgroundSize: '200% 100%',
                            backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
                        }} />
                    ))}
                </div>
                {day.isWeekend && <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Weekend</span>}
            </div>
        </div>
    );
}

function SummaryCard({ icon, label, value, subtitle, color = '#3b82f6', loading = false }) {
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '16px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '18px' }}>{icon}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: '500' }}>{label}</span>
            </div>
            {loading ? (
                <div style={{
                    height: '28px', width: '60px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.06)',
                    animation: 'shimmer 1.6s ease-in-out infinite',
                    backgroundSize: '200% 100%',
                    backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                }} />
            ) : (
                <div style={{ fontSize: '24px', fontWeight: '600', color: color }}>{value}</div>
            )}
            {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{subtitle}</div>}
        </div>
    );
}

function DayCard({ day, isExpanded, onToggle }) {
    if (day.isWeekend && day.totalMeetings === 0) {
        return (
            <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                padding: '12px 16px',
                opacity: 0.5
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-tertiary)', minWidth: '100px' }}>
                        {day.dayName}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{day.dateFormatted}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Weekend</span>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            background: day.isToday ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${day.isToday ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)'}`,
            borderRadius: '12px',
            overflow: 'hidden'
        }}>
            {/* Day Header */}
            <div 
                onClick={onToggle}
                style={{
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
                }}
            >
                {/* Load indicator dot */}
                <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: day.loadColor,
                    flexShrink: 0
                }} />
                
                <div style={{ minWidth: '120px' }}>
                    <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                        {day.isToday ? '📌 Today' : day.dayName}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{day.dateFormatted}</div>
                </div>

                {/* Quick stats */}
                <div style={{ display: 'flex', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        📅 {day.totalMeetings} meetings ({day.totalMeetingHours}h)
                    </span>
                    <span style={{ fontSize: '13px', color: '#22c55e' }}>
                        🎯 {day.deepWorkHours}h deep work
                    </span>
                    {day.oneOnOnes > 0 && (
                        <span style={{ fontSize: '13px', color: '#8b5cf6' }}>
                            👤 {day.oneOnOnes} 1:1{day.oneOnOnes > 1 ? 's' : ''}
                        </span>
                    )}
                    {day.bestDeepWorkSlot && (
                        <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                            Best slot: {day.bestDeepWorkSlot.start}–{day.bestDeepWorkSlot.end}
                        </span>
                    )}
                </div>

                {/* Load badge */}
                <span style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: `${day.loadColor}20`,
                    color: day.loadColor,
                    fontSize: '11px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }}>
                    {day.loadLevel}
                </span>

                <span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                    {isExpanded ? '▾' : '▸'}
                </span>
            </div>

            {/* Expanded: Meeting Timeline */}
            {isExpanded && (
                <div style={{ padding: '16px' }}>
                    {day.meetings.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                            No meetings scheduled — Full day for deep work! 🎯
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {day.meetings.map((meeting, idx) => (
                                <div key={meeting.id || idx} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px',
                                    padding: '10px 12px',
                                    background: meeting.is1x1 ? 'rgba(139, 92, 246, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                                    borderRadius: '8px',
                                    borderLeft: `3px solid ${meeting.is1x1 ? '#8b5cf6' : meeting.attendeeCount > 20 ? '#f97316' : '#3b82f6'}`
                                }}>
                                    <div style={{ minWidth: '70px', textAlign: 'right' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                            {meeting.timeFormatted}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                            {meeting.duration}m
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', marginBottom: '4px' }}>
                                            {meeting.title}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                👥 {meeting.attendeeCount} people
                                            </span>
                                            {meeting.is1x1 && (
                                                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
                                                    1:1
                                                </span>
                                            )}
                                            {meeting.attendeeCount > 20 && (
                                                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316' }}>
                                                    Large
                                                </span>
                                            )}
                                            {meeting.location && (
                                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                    📍 {meeting.location.substring(0, 40)}{meeting.location.length > 40 ? '...' : ''}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Deep Work Slots */}
                    {day.deepWorkSlots.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '10px 12px', background: 'rgba(34, 197, 94, 0.06)', borderRadius: '8px', borderLeft: '3px solid #22c55e' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e', marginBottom: '6px' }}>
                                🎯 Deep Work Opportunities
                            </div>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {day.deepWorkSlots.map((slot, i) => (
                                    <span key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                        {slot.start} – {slot.end} ({slot.duration}m)
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}