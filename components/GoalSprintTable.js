'use client';
import { useState, useCallback } from 'react';

// A single expandable row — fetches its children lazily on click
function SprintRow({ task, index, onInsertChildren, expandedIds, loadingIds }) {
    const isExpanded = expandedIds.has(task.id);
    const isLoading = loadingIds.has(task.id);
    const canExpand = !task.isParent && task.id && task.id !== 'Unknown';

    const tdStyle = {
        padding: '12px 16px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.85)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        verticalAlign: 'middle'
    };

    const renderPriority = (p) => {
        const priority = (p || '').toUpperCase();
        if (priority.includes('P1') || priority.includes('SEV2') || priority.includes('URGENT')) {
            return <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,69,58,0.15)', color: '#ff453a', fontWeight: 700, fontSize: '11px' }}>{priority}</span>;
        }
        if (priority.includes('P2') || priority.includes('SEV3') || priority.includes('HIGH')) {
            return <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,159,10,0.15)', color: '#ff9f0a', fontWeight: 700, fontSize: '11px' }}>{priority}</span>;
        }
        if (priority.includes('P3') || priority.includes('MEDIUM')) {
            return <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(10,132,255,0.15)', color: '#0a84ff', fontWeight: 600, fontSize: '11px' }}>{priority}</span>;
        }
        return <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '11px' }}>{priority || '—'}</span>;
    };

    const renderStatus = (statusLabel, workflowStatus) => {
        const s = (workflowStatus || statusLabel || 'Open').toLowerCase();
        let color = '#a78bfa';
        let bg = 'rgba(139,92,246,0.15)';
        if (s.includes('closed') || s.includes('resolved') || s.includes('done')) { color = '#30d158'; bg = 'rgba(48,209,88,0.15)'; }
        else if (s.includes('progress') || s.includes('building') || s.includes('active')) { color = '#0a84ff'; bg = 'rgba(10,132,255,0.15)'; }
        else if (s.includes('blocked') || s.includes('pending')) { color = '#ff9f0a'; bg = 'rgba(255,159,10,0.15)'; }
        return (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: bg, padding: '4px 10px', borderRadius: '6px', border: `1px solid ${color}30` }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                <span style={{ color, fontSize: '12px', fontWeight: 600, letterSpacing: '0.3px' }}>{workflowStatus || statusLabel}</span>
            </div>
        );
    };

    const isPastDue = (ecdStr) => {
        if (!ecdStr || ecdStr === 'Missing') return false;
        try {
            const [mm, dd, yyyy] = ecdStr.split('-').map(Number);
            return new Date(yyyy, mm - 1, dd) < new Date(new Date().toDateString());
        } catch(e) { return false; }
    };

    const depth = task.depth || 0;
    const typeBadge = task.isParent ? 'GOAL' : depth === 1 ? 'MILESTONE' : 'TASK';
    const typeColor = task.isParent ? '#a78bfa' : depth === 1 ? '#818cf8' : 'rgba(255,255,255,0.4)';
    const typeBg = task.isParent ? 'rgba(167,139,250,0.2)' : depth === 1 ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.05)';

    return (
        <tr
            style={{
                background: task.isParent ? 'rgba(139,92,246,0.1)' : (index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'),
                borderLeft: task.isParent ? '3px solid #a78bfa' : '3px solid transparent',
                transition: 'background 0.2s',
            }}
            onMouseOver={(e) => e.currentTarget.style.background = task.isParent ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)'}
            onMouseOut={(e) => e.currentTarget.style.background = task.isParent ? 'rgba(139,92,246,0.1)' : (index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
        >
            {/* Name / Title */}
            <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', marginLeft: depth ? `${depth * 28}px` : '0px', position: 'relative' }}>
                    {/* Tree lines */}
                    {depth > 0 && Array.from({ length: depth }).map((_, idx) => (
                        <div key={idx} style={{
                            position: 'absolute',
                            left: `-${(depth - idx) * 28 - 14}px`,
                            top: idx === depth - 1 ? '0' : '-16px',
                            bottom: idx === depth - 1 ? '50%' : '-16px',
                            width: idx === depth - 1 ? '16px' : '1px',
                            borderLeft: '1.5px solid rgba(255,255,255,0.15)',
                            borderBottom: idx === depth - 1 ? '1.5px solid rgba(255,255,255,0.15)' : 'none',
                            borderRadius: '0 0 0 4px',
                            pointerEvents: 'none'
                        }} />
                    ))}

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', width: '100%', zIndex: 1 }}>
                        {/* Expand toggle */}
                        {canExpand ? (
                            <button
                                onClick={() => onInsertChildren(task)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                                    color: isExpanded ? '#a78bfa' : 'rgba(255,255,255,0.3)',
                                    fontSize: '10px', lineHeight: 1, marginTop: '3px', flexShrink: 0,
                                    transition: 'color 0.15s',
                                }}
                                title={isExpanded ? 'Collapse' : 'Expand children'}
                            >
                                {isLoading ? '⟳' : isExpanded ? '▼' : '▶'}
                            </button>
                        ) : (
                            <div style={{ width: '14px', flexShrink: 0 }} />
                        )}

                        <div style={{ marginTop: '2px', color: task.status === 'Closed' ? '#30d158' : '#0a84ff', opacity: 0.8, flexShrink: 0 }}>
                            {task.status === 'Closed' ? '☑' : '☐'}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {task.id && task.id !== 'Unknown' ? (
                                    <a href={`https://taskei.amazon.dev/tasks/${task.id}`} target="_blank" rel="noopener noreferrer"
                                       style={{ color: typeColor, textDecoration: 'none', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {task.id} <span style={{ fontSize: '10px', opacity: 0.5 }}>↗</span>
                                    </a>
                                ) : (
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.2)' }}>{task.id || 'N/A'}</span>
                                )}
                                <span style={{
                                    fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', letterSpacing: '0.4px',
                                    background: typeBg, color: typeColor, border: `1px solid ${typeColor}30`
                                }}>
                                    {typeBadge}
                                </span>
                            </div>
                            <span style={{
                                lineHeight: '1.4',
                                fontWeight: task.isParent ? 700 : depth === 1 ? 600 : 400,
                                color: task.isParent ? '#fff' : depth === 1 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
                                fontSize: task.isParent ? '14px' : '13px'
                            }}>
                                {task.title}
                            </span>
                        </div>
                    </div>
                </div>
            </td>

            {/* Assignee */}
            <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #4f8cff, #3b6fd4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700, color: '#fff', flexShrink: 0
                    }}>
                        {(task.assignee || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>{task.assigneeName || task.assignee}</span>
                        {task.assigneeName && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{task.assignee}</span>}
                    </div>
                </div>
            </td>

            {/* Priority */}
            <td style={tdStyle}>{renderPriority(task.priority)}</td>

            {/* Blocked */}
            <td style={tdStyle}>
                {task.blocked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff453a', fontWeight: 600, fontSize: '12px' }}>
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#ff453a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>!</div>
                        Blocked
                    </div>
                ) : (
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px' }}>—</span>
                )}
            </td>

            {/* Status */}
            <td style={tdStyle}>{renderStatus(task.status, task.workflowAction)}</td>

            {/* ECD */}
            <td style={tdStyle}>
                {(!task.ecd || task.ecd === 'Missing') ? (
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                ) : (
                    <span style={{
                        color: isPastDue(task.ecd) ? '#ff453a' : 'rgba(255,255,255,0.7)',
                        fontWeight: isPastDue(task.ecd) ? 600 : 400,
                        background: isPastDue(task.ecd) ? 'rgba(255,69,58,0.1)' : 'transparent',
                        padding: '2px 6px', borderRadius: '4px'
                    }}>
                        {isPastDue(task.ecd) ? '⚠️ ' : ''}{task.ecd}
                    </span>
                )}
            </td>
        </tr>
    );
}

export default function GoalSprintTable({ subtasks: initialSubtasks, isLoading }) {
    // Flat ordered list of rows (includes lazily-loaded children inserted inline)
    const [rows, setRows] = useState(initialSubtasks || []);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [loadingIds, setLoadingIds] = useState(new Set());

    // Keep rows in sync when parent passes new subtasks (new goal selected)
    const [prevInitial, setPrevInitial] = useState(initialSubtasks);
    if (initialSubtasks !== prevInitial) {
        setPrevInitial(initialSubtasks);
        setRows(initialSubtasks || []);
        setExpandedIds(new Set());
        setLoadingIds(new Set());
    }

    const handleExpand = useCallback(async (task) => {
        const id = task.id;

        // Collapse: remove all rows whose id starts under this task (depth > task.depth inserted right after it)
        if (expandedIds.has(id)) {
            setExpandedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            setRows(prev => {
                const idx = prev.findIndex(r => r.id === id);
                if (idx === -1) return prev;
                // Remove consecutive rows at greater depth that were inserted after this one
                let end = idx + 1;
                while (end < prev.length && (prev[end].depth || 0) > (task.depth || 0) && prev[end]._parentId === id) {
                    end++;
                }
                return [...prev.slice(0, idx + 1), ...prev.slice(end)];
            });
            return;
        }

        // Expand: fetch children
        setLoadingIds(prev => { const n = new Set(prev); n.add(id); return n; });
        try {
            const res = await fetch(`/api/team?view=subtasks&alias=${encodeURIComponent(id)}`);
            const json = await res.json();
            const fetched = json?.data?.subtasks || [];

            // The first item is the parent itself (isParent=true) — skip it
            const children = fetched
                .filter(s => !s.isParent)
                .map(s => ({
                    ...s,
                    depth: (task.depth || 0) + 1,
                    _parentId: id,
                }));

            if (children.length > 0) {
                setRows(prev => {
                    const idx = prev.findIndex(r => r.id === id);
                    if (idx === -1) return prev;
                    return [...prev.slice(0, idx + 1), ...children, ...prev.slice(idx + 1)];
                });
                setExpandedIds(prev => { const n = new Set(prev); n.add(id); return n; });
            }
        } catch (e) {
            console.error('[GoalSprintTable] expand failed for', id, e);
        } finally {
            setLoadingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        }
    }, [expandedIds]);

    if (isLoading) {
        return (
            <div style={{ padding: '60px', textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Loading Taskei Sprint data...</div>
            </div>
        );
    }

    if (!rows || rows.length === 0) {
        return (
            <div style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px', padding: '60px 40px', textAlign: 'center'
            }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: '8px' }}>No Tasks Found</h3>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>This goal currently has no child tasks in Taskei.</p>
            </div>
        );
    }

    const thStyle = {
        padding: '12px 16px',
        textAlign: 'left',
        fontSize: '12px',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(0,0,0,0.4)',
        position: 'sticky',
        top: 0,
        zIndex: 10
    };

    return (
        <div style={{
            background: 'rgba(22,22,30,0.6)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
        }}>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                    <thead>
                        <tr>
                            <th style={{...thStyle, width: '45%'}}>Name</th>
                            <th style={thStyle}>Assignee</th>
                            <th style={thStyle}>Priority</th>
                            <th style={thStyle}>Blocked</th>
                            <th style={thStyle}>Status</th>
                            <th style={thStyle}>ECD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((task, i) => (
                            <SprintRow
                                key={`${task.id}-${task.depth || 0}-${i}`}
                                task={task}
                                index={i}
                                onInsertChildren={handleExpand}
                                expandedIds={expandedIds}
                                loadingIds={loadingIds}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: 'rgba(255,255,255,0.3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{rows.length} rows (click ▶ to expand)</span>
                <span>Taskei Sprint View</span>
            </div>
        </div>
    );
}
