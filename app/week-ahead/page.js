'use client';

import { useState, useEffect } from 'react';
import Header from '../../components/Header';
import Link from 'next/link';

export default function WeekAheadPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedDay, setExpandedDay] = useState(0); // Today expanded by default

    useEffect(() => {
        fetchWeekAhead();
    }, []);

    async function fetchWeekAhead() {
        setLoading(true);
        try {
            const res = await fetch('/api/week-ahead');
            const result = await res.json();
            if (result.success) {
                setData(result);
            }
        } catch (error) {
            console.error('Failed to fetch week ahead:', error);
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div>
                <Header />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                    <div className="loading-spinner" />
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div>
                <Header />
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Failed to load week ahead data
                </div>
            </div>
        );
    }

    return (
        <div>
            <Header />
            <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        📅 Week Ahead
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
                        {data.dateRange.start} — {data.dateRange.end}
                    </p>
                </div>

                {/* Weekly Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                    <SummaryCard icon="📊" label="Total Meetings" value={data.summary.totalMeetings} subtitle={`${data.summary.avgMeetingsPerDay}/day avg`} />
                    <SummaryCard icon="⏱️" label="Meeting Hours" value={`${data.summary.totalMeetingHours}h`} subtitle={`${data.summary.meetingPercentage}% of work time`} color={parseInt(data.summary.meetingPercentage) > 60 ? '#ef4444' : '#3b82f6'} />
                    <SummaryCard icon="🎯" label="Deep Work" value={`${data.summary.totalDeepWorkHours}h`} subtitle="available for focus" color="#22c55e" />
                    <SummaryCard icon="👤" label="1:1 Meetings" value={data.summary.total1x1s} subtitle="with team members" color="#8b5cf6" />
                    <SummaryCard icon="🔥" label="Heaviest Day" value={data.summary.heaviestDay?.name || '-'} subtitle={`${data.summary.heaviestDay?.hours || 0}h meetings`} color="#ef4444" />
                    <SummaryCard icon="🌿" label="Lightest Day" value={data.summary.lightestDay?.name || '-'} subtitle={`${data.summary.lightestDay?.hours || 0}h meetings`} color="#22c55e" />
                </div>

                {/* AI Weekly Coaching Brief */}
                {data.aiAnalysis && (
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

                {/* AI Loading State */}
                {!data.aiAnalysis && (
                    <div style={{
                        background: 'rgba(139, 92, 246, 0.05)',
                        border: '1px solid rgba(139, 92, 246, 0.15)',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '24px',
                        textAlign: 'center'
                    }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                            🤖 AI Weekly Coach analysis generating... (refresh to see results)
                        </span>
                    </div>
                )}

                {/* Day-by-Day Breakdown */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {data.days.map((day, index) => (
                        <DayCard 
                            key={day.date} 
                            day={day} 
                            isExpanded={expandedDay === index}
                            onToggle={() => setExpandedDay(expandedDay === index ? -1 : index)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

function SummaryCard({ icon, label, value, subtitle, color = '#3b82f6' }) {
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
            <div style={{ fontSize: '24px', fontWeight: '600', color: color }}>{value}</div>
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