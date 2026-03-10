'use client';

import { useState, useMemo } from 'react';

const SC = { Green: '#30d158', Yellow: '#ff9f0a', Red: '#ff453a', Missing: '#6b7280' };
const TC = { 'IMR Optimization': '#0a84ff', 'ML Accuracy': '#bf5af2', Automation: '#ff9f0a', Latency: '#30d158', Migration: '#ff453a', Compliance: '#5ac8fa', Performance: '#34c759', Reliability: '#007aff', 'Self-Service': '#af52de', 'ML Platform': '#ff6482' };
const GRADS = ['linear-gradient(135deg,#4f8cff,#3b6fd4)', 'linear-gradient(135deg,#a855f7,#7c3aed)', 'linear-gradient(135deg,#34d399,#059669)', 'linear-gradient(135deg,#fb923c,#ea580c)', 'linear-gradient(135deg,#22d3ee,#0891b2)', 'linear-gradient(135deg,#f472b6,#db2777)', 'linear-gradient(135deg,#fbbf24,#d97706)', 'linear-gradient(135deg,#818cf8,#6366f1)'];

function isEcdPast(ecd) {
    if (!ecd || ecd === 'Missing') return false;
    try { const [mm, dd, yyyy] = ecd.split('-').map(Number); return new Date(yyyy, mm - 1, dd) < new Date(new Date().toDateString()); } catch (e) { return false; }
}

function ProgressBar({ done, total, color }) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '120px' }}>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', width: '100%' }}>
                <div style={{ height: '100%', borderRadius: '3px', width: `${pct}%`, background: color, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
            </div>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{done}/{total}</span>
        </div>
    );
}

function SubtaskRow({ task, index }) {
    const past = isEcdPast(task.ecd);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', fontSize: '12px', marginBottom: '4px', animation: `slideIn 0.3s ${index * 0.05}s both` }}>
            <span style={{ fontSize: '14px' }}>{task.status === 'Closed' ? '✅' : '🔵'}</span>
            <a href={`https://issues.amazon.com/issues/${task.id}`} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 600, flexShrink: 0, textDecoration: 'none' }}>{task.id}</a>
            <span style={{ flex: 1, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{task.assignee}</span>
            {task.ecd && task.ecd !== 'Missing' && (
                <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', color: past ? '#ff453a' : 'rgba(255,255,255,0.25)', background: past ? 'rgba(255,69,58,0.1)' : 'transparent' }}>
                    {past ? '⚠️ ' : ''}{task.ecd}
                </span>
            )}
        </div>
    );
}

function GoalCard({ goal, index, onFetchSubtasks }) {
    const [expanded, setExpanded] = useState(false);
    const [subtasks, setSubtasks] = useState(null);
    const [loading, setLoading] = useState(false);
    const c = SC[goal.statusColor] || '#6b7280';
    const tc = TC[goal.theme] || '#6b7280';
    const closed = (goal.subtasks || []).filter(s => s.status === 'Closed').length;
    const total = (goal.subtasks || []).length;

    const handleExpand = async (e) => {
        e.stopPropagation();
        setExpanded(!expanded);
        // If expanding and we have no subtasks yet, try fetching on-demand
        if (!expanded && !subtasks && onFetchSubtasks && goal.subtasks?.length === 0) {
            setLoading(true);
            try {
                const res = await fetch(`/api/team?view=subtasks&alias=${goal.id}`);
                const data = await res.json();
                setSubtasks(data.data?.subtasks || []);
            } catch (e) { setSubtasks([]); }
            setLoading(false);
        }
    };

    const displayTasks = subtasks || goal.subtasks || [];

    return (
        <div onClick={handleExpand} style={{ cursor: 'pointer', borderRadius: '14px', overflow: 'hidden', background: 'rgba(255,255,255,0.025)', border: `1px solid ${c}20`, borderLeft: `3px solid ${c}`, marginBottom: '8px', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', animation: `fadeUp 0.35s ${index * 0.06}s both` }}>
            {/* Compact header */}
            <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}60`, animation: 'pulse 2s ease-in-out infinite', flexShrink: 0 }} />
                    <a href={`https://issues.amazon.com/issues/${goal.id}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#818cf8', fontWeight: 700, fontSize: '12px', flexShrink: 0, textDecoration: 'none' }}>{goal.id}</a>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.85)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.title}</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px', flexShrink: 0, transition: 'transform 0.3s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: `${c}15`, color: c, border: `1px solid ${c}25` }}>{goal.statusColor}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: `${tc}12`, color: tc }}>{goal.theme}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 600, background: isEcdPast(goal.ecd) ? 'rgba(255,69,58,0.12)' : 'rgba(255,255,255,0.04)', color: isEcdPast(goal.ecd) ? '#ff453a' : 'rgba(255,255,255,0.35)' }}>
                        {isEcdPast(goal.ecd) ? '⚠️ ' : ''}ECD: {goal.ecd}
                    </span>
                    {goal.goalType && goal.goalType !== 'Missing' && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)' }}>{goal.goalType}</span>}
                    {total > 0 && <ProgressBar done={closed} total={total} color={c} />}
                </div>
            </div>

            {/* Expanded detail */}
            <div style={{ maxHeight: expanded ? '2000px' : '0', overflow: 'hidden', transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s', opacity: expanded ? 1 : 0 }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '0 18px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {goal.description && (
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: '1.6', margin: '12px 0', padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>{goal.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', margin: '12px 0', fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                        {['pm', 'pmt', 'tech', 'sdm'].map(r => (
                            <span key={r}><strong style={{ color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontSize: '10px' }}>{r}</strong>: {goal.quad?.[r] !== 'Missing' ? goal.quad?.[r] : '—'}</span>
                        ))}
                    </div>
                    {goal.pathToGreen && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(255,69,58,0.06)', border: '1px solid rgba(255,69,58,0.12)', fontSize: '12px', color: '#ff6b6b', margin: '8px 0', lineHeight: '1.5' }}>
                            <strong>⚠️ Path to Green:</strong> {goal.pathToGreen}
                        </div>
                    )}
                    {goal.announcement && (
                        <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(10,132,255,0.06)', border: '1px solid rgba(10,132,255,0.1)', fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: '8px 0', lineHeight: '1.5' }}>
                            <strong>📢 Announcement</strong> <span style={{ color: 'rgba(255,255,255,0.3)' }}>({goal.announcement.date})</span>: {goal.announcement.text}
                        </div>
                    )}
                    {loading && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', padding: '12px 0' }}>Loading child tasks...</div>}
                    {displayTasks.length > 0 && (
                        <div style={{ marginTop: '12px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Child Tasks ({displayTasks.length})</div>
                            {displayTasks.map((st, i) => <SubtaskRow key={st.id || i} task={st} index={i} />)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Bucket({ label, sublabel, goals, index, avatarContent, avatarBg, nameColor }) {
    const [expanded, setExpanded] = useState(false);
    const hasRisk = goals.some(g => g.statusColor === 'Red' || g.statusColor === 'Yellow');

    return (
        <div style={{ borderRadius: '18px', overflow: 'hidden', background: 'rgba(22,22,30,0.7)', backdropFilter: 'blur(12px)', border: hasRisk ? '1px solid rgba(255,159,10,0.15)' : '1px solid rgba(255,255,255,0.05)', marginBottom: '12px', animation: `springIn 0.5s ${index * 0.08}s both` }}>
            <div onClick={() => setExpanded(!expanded)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', transition: 'background 0.2s' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '13px', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: avatarContent?.length > 1 ? '20px' : '17px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', flexShrink: 0, transition: 'transform 0.3s' }}>{avatarContent}</div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: nameColor || 'rgba(255,255,255,0.95)' }}>{label}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>{sublabel}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginRight: '12px' }}>
                    {goals.map((g, i) => {
                        const c = SC[g.statusColor] || '#6b7280';
                        return <div key={i} style={{ width: '10px', height: '10px', borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}50`, animation: `dotPop 0.4s ${index * 0.08 + i * 0.05}s both` }} />;
                    })}
                </div>
                <span style={{ background: hasRisk ? 'rgba(255,159,10,0.15)' : 'rgba(139,92,246,0.1)', color: hasRisk ? '#ff9f0a' : '#a78bfa', padding: '3px 12px', borderRadius: '99px', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>{goals.length}</span>
                <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '16px', flexShrink: 0, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
            </div>
            <div style={{ maxHeight: expanded ? '3000px' : '0', overflow: 'hidden', transition: 'max-height 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s', opacity: expanded ? 1 : 0 }}>
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    {goals.map((g, i) => <GoalCard key={g.id} goal={g} index={i} onFetchSubtasks={true} />)}
                </div>
            </div>
        </div>
    );
}

export default function GoalBoard({ goals, names }) {
    const [view, setView] = useState('pmt');
    const allGoals = goals || [];
    const nameMap = names || {};

    const green = allGoals.filter(g => g.statusColor === 'Green').length;
    const yellow = allGoals.filter(g => g.statusColor === 'Yellow').length;
    const red = allGoals.filter(g => g.statusColor === 'Red').length;
    const missed = allGoals.filter(g => isEcdPast(g.ecd)).length;

    const pmtGroups = useMemo(() => {
        const m = {};
        allGoals.forEach(g => { const k = g.quad?.pmt || 'Missing'; if (!m[k]) m[k] = []; m[k].push(g); });
        return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
    }, [allGoals]);

    const themeGroups = useMemo(() => {
        const m = {};
        allGoals.forEach(g => { const k = g.theme || 'Other'; if (!m[k]) m[k] = []; m[k].push(g); });
        return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
    }, [allGoals]);

    const statusGroups = useMemo(() => {
        return ['Red', 'Yellow', 'Green', 'Missing'].map(s => ({ status: s, goals: allGoals.filter(g => g.statusColor === s) })).filter(g => g.goals.length > 0);
    }, [allGoals]);

    const stats = [
        { l: 'Total', v: allGoals.length, c: '#a78bfa', bg: 'rgba(139,92,246,0.08)', b: 'rgba(139,92,246,0.15)' },
        { l: 'Green', v: green, c: '#30d158', bg: 'rgba(48,209,88,0.08)', b: 'rgba(48,209,88,0.15)' },
        { l: 'Yellow', v: yellow, c: '#ff9f0a', bg: 'rgba(255,159,10,0.08)', b: 'rgba(255,159,10,0.15)' },
        { l: 'Red', v: red, c: '#ff453a', bg: 'rgba(255,69,58,0.08)', b: 'rgba(255,69,58,0.15)' },
        { l: 'Missed ECD', v: missed, c: '#ff453a', bg: 'rgba(255,69,58,0.08)', b: 'rgba(255,69,58,0.15)' },
    ];

    const views = [{ id: 'pmt', l: '👤 By PMT' }, { id: 'theme', l: '🎨 By Theme' }, { id: 'status', l: '📋 By Status' }];

    return (
        <div>
            <style>{`
                @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
                @keyframes springIn{0%{opacity:0;transform:translateY(20px) scale(0.97)}70%{transform:translateY(-3px) scale(1.005)}100%{opacity:1;transform:translateY(0) scale(1)}}
                @keyframes dotPop{from{transform:scale(0)}to{transform:scale(1)}}
                @keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
                @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
            `}</style>

            {/* Stats */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {stats.map((s, i) => (
                    <div key={s.l} style={{ borderRadius: '14px', padding: '14px 24px', textAlign: 'center', minWidth: '90px', background: s.bg, border: `1px solid ${s.b}`, cursor: 'default', transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', animation: `fadeUp 0.4s ${i * 0.06}s both` }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                        <div style={{ fontSize: '28px', fontWeight: 800, color: s.c, lineHeight: 1 }}>{s.v}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginTop: '6px', fontWeight: 600 }}>{s.l}</div>
                    </div>
                ))}
            </div>

            {/* View Switcher */}
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '4px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px' }}>
                {views.map(v => (
                    <button key={v.id} onClick={() => setView(v.id)} style={{ flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '14px', fontWeight: 600, background: view === v.id ? 'rgba(139,92,246,0.2)' : 'transparent', color: view === v.id ? '#c4b5fd' : 'rgba(255,255,255,0.35)', transition: 'all 0.25s' }}>
                        {v.l}
                    </button>
                ))}
            </div>

            {/* Buckets */}
            {view === 'pmt' && pmtGroups.map(([pmt, goals], i) => {
                const name = nameMap[pmt] || pmt;
                const init = pmt === 'Missing' ? '?' : pmt[0].toUpperCase();
                return <Bucket key={pmt} label={name} sublabel={`${pmt !== 'Missing' ? pmt + ' · ' : ''}${goals.length} goal${goals.length !== 1 ? 's' : ''}`} goals={goals} index={i} avatarContent={init} avatarBg={GRADS[pmt.charCodeAt(0) % GRADS.length]} />;
            })}
            {view === 'theme' && themeGroups.map(([theme, goals], i) => {
                const tc = TC[theme] || '#6b7280';
                return <Bucket key={theme} label={theme} sublabel={`${goals.length} goal${goals.length !== 1 ? 's' : ''}`} goals={goals} index={i} avatarContent="🎯" avatarBg={`${tc}20`} nameColor={tc} />;
            })}
            {view === 'status' && statusGroups.map((g, i) => {
                const c = SC[g.status] || '#6b7280';
                const emoji = g.status === 'Green' ? '🟢' : g.status === 'Yellow' ? '🟡' : g.status === 'Red' ? '🔴' : '⚪';
                return <Bucket key={g.status} label={g.status} sublabel={`${g.goals.length} goal${g.goals.length !== 1 ? 's' : ''}`} goals={g.goals} index={i} avatarContent={emoji} avatarBg={`${c}20`} nameColor={c} />;
            })}
        </div>
    );
}