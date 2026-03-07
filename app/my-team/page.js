'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Sparkles, AlertTriangle, CheckCircle, Clock, Target, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

const STATUS_COLORS = { Green: '#30d158', Yellow: '#ff9f0a', Red: '#ff453a', Missing: '#6b7280' };
const STATUS_ICONS = { Blocked: '🚫', 'In Planning': '📋', Started: '🚀', Paused: '⏸️', 'Not Started': '⏳', DNM: '❌', 'Completed Late': '⏰', Completed: '✅', Cancelled: '🗑️', Cut: '✂️' };

function isEcdPast(ecdStr) {
    if (!ecdStr || ecdStr === 'Missing') return false;
    try {
        // ECD format: mm-dd-yyyy
        const [mm, dd, yyyy] = ecdStr.split('-').map(Number);
        const ecdDate = new Date(yyyy, mm - 1, dd);
        return ecdDate < new Date(new Date().toDateString());
    } catch (e) { return false; }
}

function EcdBadge({ ecd }) {
    if (!ecd || ecd === 'Missing') return null;
    const past = isEcdPast(ecd);
    return (
        <span style={{
            fontSize: '10px', fontWeight: 600, flexShrink: 0,
            padding: '1px 6px', borderRadius: '4px',
            color: past ? '#ff453a' : 'rgba(255,255,255,0.3)',
            background: past ? 'rgba(255,69,58,0.12)' : 'transparent',
            border: past ? '1px solid rgba(255,69,58,0.25)' : 'none',
        }}>
            {past ? '⚠️ ' : ''}ECD: {ecd}
        </span>
    );
}

function ChildIssueRow({ issue, depth = 0 }) {
    const [expanded, setExpanded] = useState(false);
    const [childTasks, setChildTasks] = useState(null);
    const [loading, setLoading] = useState(false);
    const [fetchedEcd, setFetchedEcd] = useState(null);

    const handleExpand = async () => {
        if (!expanded && childTasks === null) {
            setLoading(true);
            try {
                const res = await fetch(`/api/team?view=subtasks&alias=${issue.id}`);
                const data = await res.json();
                setChildTasks(data.data?.subtasks || []);
                // Capture the ECD from the fetched task details
                if (data.data?.ecd && data.data.ecd !== 'Missing') {
                    setFetchedEcd(data.data.ecd);
                }
            } catch (e) {
                setChildTasks([]);
            }
            setLoading(false);
        }
        setExpanded(!expanded);
    };

    const statusIcon = issue.status === 'Closed' ? '✅' : issue.status === 'Open' ? '🔵' : '📌';
    const displayEcd = (issue.ecd && issue.ecd !== 'Missing') ? issue.ecd : fetchedEcd;

    return (
        <div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', padding: '4px 0', paddingLeft: `${depth * 16}px`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button onClick={handleExpand} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '1px', display: 'flex', flexShrink: 0, fontSize: '10px' }}>
                    {loading ? '⏳' : expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                <span style={{ fontSize: '11px' }}>{statusIcon}</span>
                <a href={`https://issues.amazon.com/issues/${issue.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none', fontSize: '11px', flexShrink: 0 }}>{issue.id}</a>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', flexShrink: 0 }}>{issue.assignee}</span>
                <EcdBadge ecd={displayEcd} />
            </div>
            {expanded && childTasks && childTasks.length > 0 && (
                <div style={{ borderLeft: '1px solid rgba(255,255,255,0.04)', marginLeft: `${12 + depth * 16}px` }}>
                    {childTasks.map((ct, i) => (
                        <ChildIssueRow key={i} issue={ct} depth={depth + 1} />
                    ))}
                </div>
            )}
            {expanded && childTasks && childTasks.length === 0 && !loading && (
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', paddingLeft: `${20 + depth * 16}px`, padding: '2px 0' }}>No child tasks</div>
            )}
        </div>
    );
}

function GoalCard({ goal }) {
    const [expanded, setExpanded] = useState(false);
    const color = STATUS_COLORS[goal.statusColor] || STATUS_COLORS.Missing;

    return (
        <div style={{ background: 'rgba(22,22,30,0.6)', border: `1px solid ${color}25`, borderLeft: `3px solid ${color}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <a href={`https://issues.amazon.com/issues/${goal.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
                            {goal.id}
                        </a>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.9)', flex: 1 }}>{goal.title}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
                        <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            background: isEcdPast(goal.ecd) ? 'rgba(255,69,58,0.15)' : `${color}15`,
                            color: isEcdPast(goal.ecd) ? '#ff453a' : color,
                            border: isEcdPast(goal.ecd) ? '1px solid rgba(255,69,58,0.3)' : 'none',
                        }}>
                            {isEcdPast(goal.ecd) ? '⚠️ ' : ''}ECD: {goal.ecd}
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', background: `${color}15`, color, fontWeight: 700, fontSize: '11px' }}>
                            Status: {goal.statusColor}
                        </span>
                        {goal.goalType !== 'Missing' && (
                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(139,92,246,0.1)', color: '#a78bfa', fontWeight: 600, fontSize: '11px' }}>
                                {goal.goalType}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Quad</strong> — PM: {goal.quad.pm}, PMT: {goal.quad.pmt}, Tech: {goal.quad.tech}, SDM: {goal.quad.sdm}
            </div>

            {goal.description && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.5', maxHeight: expanded ? 'none' : '48px', overflow: 'hidden' }}>
                    <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Description:</strong> {goal.description.substring(0, expanded ? 5000 : 200)}{!expanded && goal.description.length > 200 ? '...' : ''}
                </div>
            )}

            {goal.theme && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                    <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Theme:</strong> {goal.theme}
                </div>
            )}

            {goal.announcement && (
                <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.1)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.5' }}>
                    <strong>Announcement:</strong> <span style={{ color: 'rgba(255,255,255,0.4)' }}>(Last updated on {goal.announcement.date} by {goal.announcement.author}@)</span>{' '}
                    {goal.announcement.text.substring(0, 500)}{goal.announcement.text.length > 500 ? '...' : ''}
                </div>
            )}

            {goal.statusColor === 'Red' && goal.pathToGreen && (
                <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.1)', fontSize: '12px', color: '#ff453a' }}>
                    <strong>Path to Green:</strong> {goal.pathToGreen}
                </div>
            )}

            {goal.subtasks.length > 0 && (
                <button onClick={() => setExpanded(!expanded)} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#818cf8', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}>
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {goal.subtasks.length} child issues
                </button>
            )}

            {expanded && goal.subtasks.length > 0 && (
                <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid rgba(255,255,255,0.06)' }}>
                    {goal.subtasks.slice(0, 30).map((s, i) => (
                        <ChildIssueRow key={i} issue={s} />
                    ))}
                    {goal.subtasks.length > 30 && (
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', padding: '4px 0', paddingLeft: '20px' }}>+ {goal.subtasks.length - 30} more</div>
                    )}
                </div>
            )}
        </div>
    );
}

function StatusSection({ section }) {
    const [collapsed, setCollapsed] = useState(section.count === 0);
    const icon = STATUS_ICONS[section.name] || '📌';

    return (
        <div style={{ marginBottom: '24px' }}>
            <div onClick={() => setCollapsed(!collapsed)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '12px' }}>
                <span style={{ fontSize: '20px' }}>{icon}</span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', flex: 1 }}>{section.name}</h3>
                <span style={{ fontSize: '14px', fontWeight: 600, color: section.count > 0 ? '#a78bfa' : 'rgba(255,255,255,0.3)', background: section.count > 0 ? 'rgba(139,92,246,0.1)' : 'transparent', padding: '2px 10px', borderRadius: '99px' }}>
                    {section.count}
                </span>
                {collapsed ? <ChevronRight size={16} color="rgba(255,255,255,0.3)" /> : <ChevronDown size={16} color="rgba(255,255,255,0.3)" />}
            </div>
            {!collapsed && (
                section.count === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px', fontStyle: 'italic', paddingLeft: '16px' }}>
                        No {section.name.toLowerCase()} goals this week.
                    </div>
                ) : (
                    section.goals.map(goal => <GoalCard key={goal.id} goal={goal} />)
                )
            )}
        </div>
    );
}

function GoalChildScanner({ goalId, goalTitle, alertType, color, maxDepth = 3 }) {
    const [children, setChildren] = useState(null);
    const [loading, setLoading] = useState(false);
    const [scannedCount, setScannedCount] = useState(0);

    const scan = async () => {
        setLoading(true);
        setScannedCount(0);
        try {
            const results = [];
            const today = new Date(new Date().toDateString());
            const soon = new Date(today);
            soon.setDate(today.getDate() + 3);

            const checkEcd = (ecdStr) => {
                if (!ecdStr || ecdStr === 'Missing') return false;
                try {
                    const [mm, dd, yyyy] = ecdStr.split('-').map(Number);
                    const ecdDate = new Date(yyyy, mm - 1, dd);
                    return alertType === 'missed' ? ecdDate < today : ecdDate <= soon;
                } catch (e) { return false; }
            };

            // Recursive scan — fetch each task individually to get its real ECD
            const scanTask = async (taskId, depth, parentPath) => {
                if (depth > maxDepth) return;
                const res = await fetch(`/api/team?view=subtasks&alias=${taskId}`);
                const data = await res.json();
                const taskData = data.data || {};
                const subtasks = taskData.subtasks || [];
                setScannedCount(prev => prev + 1);

                // Check the fetched task's OWN ECD (not from parent listing)
                // Skip the root goal itself (depth 0)
                if (depth > 0 && taskData.ecd && checkEcd(taskData.ecd) && taskData.status !== 'Closed') {
                    results.push({
                        id: taskData.id || taskId,
                        title: taskData.name || taskId,
                        ecd: taskData.ecd,
                        assignee: 'see SIM',
                        status: taskData.status || 'Open',
                        parentPath: parentPath || goalId
                    });
                }

                // Recurse into subtasks
                for (const s of subtasks) {
                    if (s.status !== 'Closed' && depth < maxDepth) {
                        await scanTask(s.id, depth + 1, parentPath ? `${parentPath} → ${taskId}` : taskId);
                    }
                }
            };
            await scanTask(goalId, 0, '');
            setChildren(results);
        } catch (e) { setChildren([]); }
        setLoading(false);
    };

    return (
        <div style={{ marginTop: '6px', paddingLeft: '16px' }}>
            {children === null && (
                <button onClick={scan} disabled={loading} style={{
                    background: 'none', border: 'none', color: '#818cf8', fontSize: '11px',
                    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, padding: 0,
                    display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                    {loading ? `⏳ Scanning... (${scannedCount} tasks checked)` : `🔍 Deep scan for ${alertType === 'missed' ? 'missed' : 'upcoming'} ECDs`}
                </button>
            )}
            {children && children.length === 0 && (
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>No tasks with {alertType === 'missed' ? 'missed' : 'upcoming'} ECD ({scannedCount} scanned)</span>
            )}
            {children && children.length > 0 && (
                <div>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginBottom: '4px' }}>{children.length} found ({scannedCount} scanned)</div>
                    {children.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                            <span style={{ color, fontWeight: 600, fontSize: '10px' }}>⚠️ {c.ecd}</span>
                            <a href={`https://issues.amazon.com/issues/${c.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none', fontSize: '11px' }}>{c.id}</a>
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                            <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{c.assignee}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function EcdAlertPanel({ title, items, goals, alertType, color, onClose }) {
    if (!items || items.length === 0) return null;

    // Group items by parent goal
    const goalItems = items.filter(i => i.type === 'goal');
    const childItems = items.filter(i => i.type === 'child');
    const goalIds = new Set(goalItems.map(g => g.id));

    // Find goals that have children but aren't themselves in the list
    const goalsWithChildren = goals?.filter(g =>
        g.subtasks?.length > 0 && !goalIds.has(g.id)
    ) || [];

    return (
        <div style={{
            position: 'fixed', top: 0, right: 0, width: '520px', height: '100vh',
            background: 'rgba(15,15,22,0.97)', backdropFilter: 'blur(20px)',
            borderLeft: `2px solid ${color}40`, zIndex: 1000, overflowY: 'auto',
            boxShadow: '-10px 0 40px rgba(0,0,0,0.5)', padding: '24px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color }}>{title} ({items.length})</h3>
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>✕ Close</button>
            </div>

            {/* Known missed items (goals + any child tasks with ECDs) */}
            {items.map((item, i) => (
                <div key={i} style={{
                    padding: '12px 14px', borderRadius: '10px', marginBottom: '8px',
                    background: `${color}08`, border: `1px solid ${color}20`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <a href={`https://issues.amazon.com/issues/${item.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 600, fontSize: '12px', textDecoration: 'none' }}>{item.id}</a>
                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: `${color}15`, color }}>{item.type === 'goal' ? 'Goal' : 'Task'}</span>
                        {item.parentGoal && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>under {item.parentGoal}</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '6px' }}>{item.title}</div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                        <span style={{ color, fontWeight: 600 }}>ECD: {item.ecd}</span>
                        <span>Assignee: {item.assignee}</span>
                    </div>
                    {/* For goals, allow scanning child tasks */}
                    {item.type === 'goal' && (
                        <GoalChildScanner goalId={item.id} goalTitle={item.title} alertType={alertType} color={color} />
                    )}
                </div>
            ))}

            {/* Goals that aren't themselves overdue but may have overdue children */}
            {goalsWithChildren.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Other Goals — Scan for {alertType === 'missed' ? 'missed' : 'upcoming'} child ECDs
                    </div>
                    {goalsWithChildren.map((g, i) => (
                        <div key={i} style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                <a href={`https://issues.amazon.com/issues/${g.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}>{g.id}</a>
                                <span style={{ color: 'rgba(255,255,255,0.7)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px' }}>{g.subtasks.length} tasks</span>
                            </div>
                            <GoalChildScanner goalId={g.id} goalTitle={g.title} alertType={alertType} color={color} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function MyTeamPage() {
    const [report, setReport] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState('');
    const [alertPanel, setAlertPanel] = useState(null); // 'missed' | 'soon' | 'drift' | null
    const [aiSummary, setAiSummary] = useState(null);
    const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
    const [aiSummaryError, setAiSummaryError] = useState(null);

    const fetchReport = useCallback(async (refresh = false) => {
        setIsLoading(true);
        setError(null);
        setProgress(refresh ? 'Fetching goals from SIM (this may take 1-2 minutes)...' : 'Loading WBR report...');
        try {
            const res = await fetch(`/api/team?view=wbr${refresh ? '&refresh=true' : ''}`);
            const data = await res.json();
            if (data.error) {
                setError(data.error);
            } else {
                setReport(data.data);
            }
        } catch (e) {
            setError(e.message);
        }
        setIsLoading(false);
        setProgress('');
    }, []);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    // Fetch AI Summary after report loads
    const fetchAiSummary = async () => {
        setAiSummaryLoading(true);
        setAiSummaryError(null);
        try {
            const res = await fetch('/api/team?view=wbr-ai-summary');
            const data = await res.json();
            if (data.error) {
                setAiSummaryError(data.error);
            } else {
                setAiSummary(data.data);
            }
        } catch (e) {
            setAiSummaryError(e.message);
        }
        setAiSummaryLoading(false);
    };

    useEffect(() => {
        if (report && !aiSummary && !aiSummaryLoading) {
            fetchAiSummary();
        }
    }, [report]);

    return (
        <div className="dark-inline-page" style={{ zoom: 1.15 }}>
            {/* Dynamic WBR Title */}
            {report && (
                <div style={{ marginBottom: '20px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px', letterSpacing: '-0.3px' }}>
                        {report.title}
                    </h1>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {report.subtitle}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        {report && <span>{report.totalGoals} goals</span>}
                        <button onClick={() => fetchReport(true)} disabled={isLoading} style={{
                            background: isLoading ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.15)',
                            color: isLoading ? 'rgba(255,255,255,0.3)' : '#a78bfa', border: 'none',
                            padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                            cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit'
                        }}>
                            <RefreshCw size={14} /> {isLoading ? 'Loading...' : 'Refresh from SIM'}
                        </button>
                    </div>
                </div>
            </div>

            {isLoading && (
                <div style={{ padding: '60px', textAlign: 'center' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                    <div style={{ color: 'rgba(255,255,255,0.5)' }}>{progress}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', marginTop: '8px' }}>Fetching {report ? '' : '42'} goals from SIM via builder-mcp...</div>
                </div>
            )}

            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
                    <div style={{ color: '#ff453a', fontWeight: 600, marginBottom: '8px' }}>Failed to generate WBR report</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{error}</div>
                </div>
            )}

            {!isLoading && !error && report && (
                <>
                    {/* AI Executive Summary */}
                    <div style={{
                        background: 'linear-gradient(145deg, rgba(139,92,246,0.08), rgba(59,130,246,0.05))',
                        border: '1px solid rgba(139,92,246,0.2)',
                        borderRadius: '16px', padding: '20px 24px', marginBottom: '20px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            <span style={{ fontSize: '18px' }}>🤖</span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#a78bfa' }}>AI Goal Health Summary</span>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                                Powered by GenAI
                            </span>
                            {aiSummary?.tasksScanned && (
                                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
                                    {aiSummary.tasksScanned} tasks analyzed · depth-3
                                </span>
                            )}
                            {!aiSummaryLoading && (
                                <button onClick={fetchAiSummary} style={{
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                                    cursor: 'pointer', fontSize: '12px', padding: '2px 6px',
                                }}>
                                    🔄
                                </button>
                            )}
                        </div>

                        {aiSummaryLoading && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#a78bfa', animation: 'pulse 1.2s ease-in-out infinite' }} />
                                    <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                        Scanning goals and subtasks (depth-3)... This may take 30-60 seconds.
                                    </span>
                                </div>
                                {[100, 80, 65, 50].map((w, i) => (
                                    <div key={i} style={{
                                        height: '12px', width: `${w}%`, borderRadius: '6px',
                                        background: 'rgba(139,92,246,0.08)', marginTop: i === 0 ? 0 : '6px',
                                        animation: `shimmer 1.6s ease-in-out ${i * 0.15}s infinite`,
                                        backgroundSize: '200% 100%',
                                        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.06) 50%, transparent 100%)',
                                    }} />
                                ))}
                            </div>
                        )}

                        {aiSummaryError && !aiSummaryLoading && (
                            <div style={{ fontSize: '13px', color: '#ff453a' }}>
                                ⚠️ {aiSummaryError}
                            </div>
                        )}

                        {aiSummary?.summary && !aiSummaryLoading && (
                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: '1.7' }}>
                                {aiSummary.summary.split('\n').map((line, i) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <div key={i} style={{ height: '8px' }} />;
                                    
                                    // Section headers: **Executive Summary**, 1. Executive Summary, ## Executive Summary, etc.
                                    const headerMatch = trimmed.match(/^\d+\.\s*\*\*(.+?)\*\*/);
                                    const boldHeaderMatch = trimmed.match(/^\*\*(.+?)\*\*$/);
                                    const numberedHeader = trimmed.match(/^\d+\.\s+([A-Z][\w\s\-()]+)$/);
                                    const mdHeader = trimmed.match(/^#{1,3}\s+(.+)/);
                                    if (headerMatch || boldHeaderMatch || numberedHeader || mdHeader) {
                                        const title = headerMatch ? headerMatch[1] : boldHeaderMatch ? boldHeaderMatch[1] : numberedHeader ? numberedHeader[1] : mdHeader[1];
                                        const isRisk = /risk/i.test(title);
                                        const isPositive = /positive|signal|highlight/i.test(title);
                                        const isAction = /action|recommend/i.test(title);
                                        const color = isRisk ? '#ff453a' : isPositive ? '#30d158' : isAction ? '#0a84ff' : '#a78bfa';
                                        const icon = isRisk ? '⚠️' : isPositive ? '✅' : isAction ? '🎯' : '📊';
                                        return (
                                            <div key={i} style={{
                                                fontSize: '12px', fontWeight: 700, color, textTransform: 'uppercase',
                                                letterSpacing: '0.5px', marginTop: i > 0 ? '16px' : '4px', marginBottom: '8px',
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                paddingBottom: '6px', borderBottom: `1px solid ${color}20`,
                                            }}>
                                                {icon} {title}
                                            </div>
                                        );
                                    }
                                    
                                    // Bullet points
                                    const bulletMatch = trimmed.match(/^[-•*]\s+(.+)/);
                                    if (bulletMatch) {
                                        // Bold inline: **text**
                                        const content = bulletMatch[1].replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
                                        return (
                                            <div key={i} style={{
                                                padding: '4px 0 4px 16px', position: 'relative',
                                                fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6',
                                            }}>
                                                <span style={{ position: 'absolute', left: '0', color: 'rgba(255,255,255,0.3)' }}>•</span>
                                                <span dangerouslySetInnerHTML={{ __html: content }} />
                                            </div>
                                        );
                                    }
                                    
                                    // Regular text with inline bold
                                    const formatted = trimmed.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
                                    return (
                                        <div key={i} style={{ marginBottom: '4px' }}
                                            dangerouslySetInnerHTML={{ __html: formatted }} />
                                    );
                                })}
                            </div>
                        )}

                        {aiSummary && !aiSummary.summary && !aiSummaryLoading && !aiSummaryError && (
                            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                AI summary could not be generated. Data payload is available for manual review.
                            </div>
                        )}
                    </div>

                    {/* Report Header */}
                    <div style={{ background: 'rgba(22,22,30,0.6)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
                        {/* Summary Stats */}
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ background: 'rgba(48,209,88,0.08)', border: '1px solid rgba(48,209,88,0.15)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center', minWidth: '90px' }}>
                                <div style={{ fontSize: '28px', fontWeight: 700, color: '#30d158' }}>{report.summary.byColor.Green || 0}</div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Green</div>
                            </div>
                            <div style={{ background: 'rgba(255,159,10,0.08)', border: '1px solid rgba(255,159,10,0.15)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center', minWidth: '90px' }}>
                                <div style={{ fontSize: '28px', fontWeight: 700, color: '#ff9f0a' }}>{report.summary.byColor.Yellow || 0}</div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Yellow</div>
                            </div>
                            <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.15)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center', minWidth: '90px' }}>
                                <div style={{ fontSize: '28px', fontWeight: 700, color: '#ff453a' }}>{report.summary.byColor.Red || 0}</div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Red</div>
                            </div>
                            <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '12px', padding: '12px 20px', textAlign: 'center', minWidth: '90px' }}>
                                <div style={{ fontSize: '28px', fontWeight: 700, color: '#a78bfa' }}>{report.totalGoals}</div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Total</div>
                            </div>
                            {Object.entries(report.summary.byGoalType).sort((a, b) => a[0].localeCompare(b[0])).map(([type, count]) => (
                                <div key={type} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '12px 16px', textAlign: 'center', minWidth: '70px' }}>
                                    <div style={{ fontSize: '20px', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{count}</div>
                                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{type}</div>
                                </div>
                            ))}
                        </div>

                            {/* ECD Alerts */}
                            {(report.summary.missedEcd?.length > 0 || report.summary.ecdSoon?.length > 0) && (
                                <div style={{ display: 'flex', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    {report.summary.missedEcd?.length > 0 && (
                                        <button onClick={() => setAlertPanel('missed')} style={{
                                            background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.25)',
                                            borderRadius: '12px', padding: '12px 20px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'inherit', flex: 1
                                        }}>
                                            <span style={{ fontSize: '24px' }}>⚠️</span>
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontSize: '22px', fontWeight: 700, color: '#ff453a' }}>{report.summary.missedEcd.length}</div>
                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Missed ECD</div>
                                            </div>
                                        </button>
                                    )}
                                    {report.summary.ecdSoon?.length > 0 && (
                                        <button onClick={() => setAlertPanel('soon')} style={{
                                            background: 'rgba(255,159,10,0.1)', border: '1px solid rgba(255,159,10,0.25)',
                                            borderRadius: '12px', padding: '12px 20px', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'inherit', flex: 1
                                        }}>
                                            <span style={{ fontSize: '24px' }}>🔔</span>
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontSize: '22px', fontWeight: 700, color: '#ff9f0a' }}>{report.summary.ecdSoon.length}</div>
                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>ECD in 3 Days</div>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* ECD Changed stat */}
                            {report.summary.ecdChanges?.totalChanged > 0 && (
                                <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                                    <button onClick={() => setAlertPanel('drift')} style={{
                                        background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
                                        borderRadius: '12px', padding: '12px 20px', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'inherit', flex: 1, position: 'relative'
                                    }}>
                                        <span style={{ fontSize: '24px' }}>📅</span>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '22px', fontWeight: 700, color: '#818cf8' }}>{report.summary.ecdChanges.totalChanged}</div>
                                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>ECD Changed</div>
                                        </div>
                                        <span style={{ position: 'absolute', top: -6, right: -6, background: '#818cf8', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '99px' }}>vs {report.summary.ecdChanges.previousDate}</span>
                                    </button>
                                </div>
                            )}

                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '12px' }}>
                            Generated: {new Date(report.generatedAt).toLocaleString()}
                        </div>
                    </div>

                    {/* Goal Update Sections */}
                    <div style={{ marginBottom: '32px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Target size={18} /> Goal Update
                        </h2>
                        {report.sections.map(section => (
                            <StatusSection key={section.name} section={section} />
                        ))}
                    </div>

                    {/* Project Tasks Section */}
                    {report.projectTasks && report.projectTasks.length > 0 && (
                        <div>
                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.8)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={18} /> Project Tasks
                            </h2>
                            {report.projectTasks.map(goal => (
                                <div key={goal.id} style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <a href={`https://issues.amazon.com/issues/${goal.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>{goal.id}</a>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{goal.title.substring(0, 80)}{goal.title.length > 80 ? '...' : ''}</span>
                                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: `${STATUS_COLORS[goal.statusColor]}15`, color: STATUS_COLORS[goal.statusColor] }}>
                                            {goal.statusColor}
                                        </span>
                                    </div>
                                    {goal.subtasks.length > 0 && (
                                        <div style={{ paddingLeft: '16px' }}>
                                            {goal.subtasks.slice(0, 20).map((s, i) => (
                                                <ChildIssueRow key={i} issue={s} />
                                            ))}
                                            {goal.subtasks.length > 20 && (
                                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', padding: '4px 0', paddingLeft: '20px' }}>+ {goal.subtasks.length - 20} more</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ECD Alert Slide Panel */}
            {alertPanel === 'missed' && report?.summary?.missedEcd && (
                <EcdAlertPanel
                    title="⚠️ Missed ECD"
                    items={report.summary.missedEcd}
                    goals={report.sections?.find(s => s.name === 'Started')?.goals || []}
                    alertType="missed"
                    color="#ff453a"
                    onClose={() => setAlertPanel(null)}
                />
            )}
            {alertPanel === 'drift' && report?.summary?.ecdChanges && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, width: '540px', height: '100vh',
                    background: 'rgba(15,15,22,0.97)', backdropFilter: 'blur(20px)',
                    borderLeft: '2px solid rgba(99,102,241,0.3)', zIndex: 1000, overflowY: 'auto',
                    boxShadow: '-10px 0 40px rgba(0,0,0,0.5)', padding: '24px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#818cf8' }}>📅 ECD Changes ({report.summary.ecdChanges.totalChanged})</h3>
                        <button onClick={() => setAlertPanel(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>✕ Close</button>
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '16px' }}>
                        Compared to snapshot from {report.summary.ecdChanges.previousDate}
                    </div>

                    {report.summary.ecdChanges.slipped.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#ff453a', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                                📈 Slipped ({report.summary.ecdChanges.slipped.length})
                            </div>
                            {report.summary.ecdChanges.slipped.map((item, i) => (
                                <div key={i} style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <a href={`https://issues.amazon.com/issues/${item.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 600, fontSize: '12px', textDecoration: 'none' }}>{item.id}</a>
                                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: item.type === 'goal' ? 'rgba(139,92,246,0.1)' : 'rgba(10,132,255,0.1)', color: item.type === 'goal' ? '#a78bfa' : '#0a84ff' }}>{item.type === 'goal' ? 'Goal' : 'Task'}</span>
                                        {item.parentGoal && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>under {item.parentGoal}</span>}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>{item.title}</div>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', alignItems: 'center' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>{item.previousEcd}</span>
                                        <span>→</span>
                                        <span style={{ color: '#ff453a', fontWeight: 600 }}>{item.currentEcd} (+{item.daysDiff} days)</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>Assignee: {item.assignee}</div>
                                </div>
                            ))}
                        </>
                    )}

                    {report.summary.ecdChanges.pulledIn.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#30d158', textTransform: 'uppercase', letterSpacing: '1px', margin: '20px 0 10px' }}>
                                📉 Pulled In ({report.summary.ecdChanges.pulledIn.length})
                            </div>
                            {report.summary.ecdChanges.pulledIn.map((item, i) => (
                                <div key={i} style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px', padding: '14px 16px', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <a href={`https://issues.amazon.com/issues/${item.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 600, fontSize: '12px', textDecoration: 'none' }}>{item.id}</a>
                                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, background: item.type === 'goal' ? 'rgba(139,92,246,0.1)' : 'rgba(10,132,255,0.1)', color: item.type === 'goal' ? '#a78bfa' : '#0a84ff' }}>{item.type === 'goal' ? 'Goal' : 'Task'}</span>
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', marginBottom: '8px' }}>{item.title}</div>
                                    <div style={{ display: 'flex', gap: '12px', fontSize: '11px', alignItems: 'center' }}>
                                        <span style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>{item.previousEcd}</span>
                                        <span>→</span>
                                        <span style={{ color: '#30d158', fontWeight: 600 }}>{item.currentEcd} ({item.daysDiff} days)</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>Assignee: {item.assignee}</div>
                                </div>
                            ))}
                        </>
                    )}

                    <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
                        {report.summary.ecdChanges.unchanged} items unchanged · Snapshot: {new Date(report.generatedAt).toLocaleDateString()}
                    </div>
                </div>
            )}
            {alertPanel === 'soon' && report?.summary?.ecdSoon && (
                <EcdAlertPanel
                    title="🔔 ECD Due in 3 Days"
                    items={report.summary.ecdSoon}
                    goals={report.sections?.find(s => s.name === 'Started')?.goals || []}
                    alertType="soon"
                    color="#ff9f0a"
                    onClose={() => setAlertPanel(null)}
                />
            )}
        </div>
    );
}
