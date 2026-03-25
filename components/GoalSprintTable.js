export default function GoalSprintTable({ subtasks, isLoading }) {
    if (isLoading) {
        return (
            <div style={{ padding: '60px', textAlign: 'center' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>Loading Taskei Sprint data...</div>
            </div>
        );
    }

    if (!subtasks || subtasks.length === 0) {
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

    // Taskei-style badge renderers
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
        return <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '11px' }}>{priority || 'P3'}</span>;
    };

    const renderStatus = (statusLabel, workflowStatus) => {
        const s = (workflowStatus || statusLabel || 'Open').toLowerCase();
        let color = '#a78bfa'; // default
        let bg = 'rgba(139,92,246,0.15)';
        
        if (s.includes('closed') || s.includes('resolved') || s.includes('done')) {
            color = '#30d158'; bg = 'rgba(48,209,88,0.15)';
        } else if (s.includes('progress') || s.includes('building') || s.includes('active')) {
            color = '#0a84ff'; bg = 'rgba(10,132,255,0.15)';
        } else if (s.includes('blocked') || s.includes('pending')) {
            color = '#ff9f0a'; bg = 'rgba(255,159,10,0.15)';
        }

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

    const tdStyle = {
        padding: '12px 16px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.85)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        verticalAlign: 'middle'
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
                        {subtasks.map((task, i) => (
                            <tr key={`${task.id}-${i}`} style={{
                                background: task.isParent ? 'rgba(139,92,246,0.1)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'),
                                borderLeft: task.isParent ? '3px solid #a78bfa' : '3px solid transparent',
                                transition: 'background 0.2s',
                                cursor: 'default'
                            }} onMouseOver={(e) => e.currentTarget.style.background = task.isParent ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)'}
                               onMouseOut={(e) => e.currentTarget.style.background = task.isParent ? 'rgba(139,92,246,0.1)' : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}>
                                
                                {/* Name / Title */}
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px', marginLeft: task.depth ? `${task.depth * 28}px` : '0px', position: 'relative' }}>
                                        {/* Tree Lines */}
                                        {task.depth > 0 && Array.from({ length: task.depth }).map((_, idx) => (
                                            <div key={idx} style={{
                                                position: 'absolute',
                                                left: `-${(task.depth - idx) * 28 - 14}px`,
                                                top: idx === task.depth - 1 ? '0' : '-16px',
                                                bottom: idx === task.depth - 1 ? '50%' : '-16px',
                                                width: idx === task.depth - 1 ? '16px' : '1px',
                                                borderLeft: '1.5px solid rgba(255,255,255,0.15)',
                                                borderBottom: idx === task.depth - 1 ? '1.5px solid rgba(255,255,255,0.15)' : 'none',
                                                borderRadius: '0 0 0 4px',
                                                pointerEvents: 'none'
                                            }} />
                                        ))}

                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%', zIndex: 1 }}>
                                            <div style={{ marginTop: '2px', color: task.status === 'Closed' ? '#30d158' : '#0a84ff', opacity: 0.8 }}>
                                                {task.status === 'Closed' ? '☑' : '☐'}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <a href={`https://taskei.amazon.dev/tasks/${task.id}`} target="_blank" rel="noopener noreferrer" 
                                                       style={{ 
                                                           color: task.isParent ? '#a78bfa' : task.depth === 1 ? '#818cf8' : 'rgba(255,255,255,0.4)', 
                                                           textDecoration: 'none', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' 
                                                       }}>
                                                        {task.id} <span style={{ fontSize: '10px', opacity: 0.5 }}>↗</span>
                                                    </a>
                                                    
                                                    {/* Category Badge */}
                                                    <span style={{ 
                                                        fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', letterSpacing: '0.4px',
                                                        background: task.isParent ? 'rgba(167,139,250,0.2)' : task.depth === 1 ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.05)',
                                                        color: task.isParent ? '#a78bfa' : task.depth === 1 ? '#818cf8' : 'rgba(255,255,255,0.4)',
                                                        border: `1px solid ${task.isParent ? '#a78bfa30' : task.depth === 1 ? '#818cf820' : 'rgba(255,255,255,0.05)'}`
                                                    }}>
                                                        {task.isParent ? 'GOAL' : task.depth === 1 ? 'MILESTONE' : 'TASK'}
                                                    </span>
                                                </div>
                                                <span style={{ 
                                                    lineHeight: '1.4', 
                                                    fontWeight: task.isParent ? 700 : task.depth === 1 ? 600 : 400, 
                                                    color: task.isParent ? '#fff' : task.depth === 1 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
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
                                            fontSize: '10px', fontWeight: 700, color: '#fff'
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
                                <td style={tdStyle}>
                                    {renderPriority(task.priority)}
                                </td>

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
                                <td style={tdStyle}>
                                    {renderStatus(task.status, task.workflowAction)}
                                </td>

                                {/* ECD */}
                                <td style={tdStyle}>
                                    {(!task.ecd || task.ecd === 'Missing') ? (
                                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                                    ) : (
                                        <span style={{ 
                                            color: isPastDue(task.ecd) ? '#ff453a' : 'rgba(255,255,255,0.7)',
                                            fontWeight: isPastDue(task.ecd) ? 600 : 400,
                                            background: isPastDue(task.ecd) ? 'rgba(255,69,58,0.1)' : 'transparent',
                                            padding: '2px 6px',
                                            borderRadius: '4px'
                                        }}>
                                            {isPastDue(task.ecd) ? '⚠️ ' : ''}{task.ecd}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: 'rgba(255,255,255,0.3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{subtasks.length} subtasks</span>
                <span>Taskei Sprint View</span>
            </div>
        </div>
    );
}
