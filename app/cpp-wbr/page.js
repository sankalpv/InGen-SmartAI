'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { FileBarChart, RefreshCw, Play, RotateCcw, Copy, Check, ChevronDown, ChevronUp, Loader2, AlertTriangle, ExternalLink } from 'lucide-react';

// Section definitions matching the spec
const SECTIONS = [
    { key: 'status_missing', name: 'Status Missing', emoji: '⚠️' },
    { key: 'blocked', name: 'Blocked', emoji: '🚫' },
    { key: 'in_planning', name: 'In Planning', emoji: '📋' },
    { key: 'started', name: 'Started', emoji: '🟢' },
    { key: 'paused', name: 'Paused', emoji: '⏸️' },
    { key: 'not_started', name: 'Not Started', emoji: '⬜' },
    { key: 'dnm', name: 'DNM', emoji: '❌' },
    { key: 'completed_late', name: 'Completed Late', emoji: '🕐' },
    { key: 'completed', name: 'Completed', emoji: '✅' },
    { key: 'cancelled', name: 'Cancelled', emoji: '🚫' },
    { key: 'cut', name: 'Cut', emoji: '✂️' },
];

const STATUS_COLORS = {
    Green: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
    Yellow: { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.3)', text: '#eab308' },
    Red: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' },
    Missing: { bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', text: '#94a3b8' },
};

function GoalCard({ goal }) {
    const [expanded, setExpanded] = useState(false);
    const colors = STATUS_COLORS[goal.color] || STATUS_COLORS.Missing;
    const goalUrl = `https://issues.amazon.com/issues/${goal.goalId}`;

    return (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${colors.border}`, borderRadius: 14, padding: '18px 22px', marginBottom: 12 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <a href={goalUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                            {goal.goalId} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        </a>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{goal.title}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: colors.bg, color: colors.text, fontWeight: 600 }}>
                            {goal.color || 'Missing'}
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>ECD: {goal.ecd || 'Missing'}</span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>Type: {goal.goalType || 'Missing'}</span>
                    </div>
                </div>
                <button onClick={() => setExpanded(!expanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14 }}>
                    {/* Quad */}
                    <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quad</span>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                            PM: {goal.pm || 'Missing'} · PMT: {goal.pmt || 'Missing'} · Tech: {goal.tech || 'Missing'} · SDM: {goal.sdm || 'Missing'}
                        </div>
                    </div>

                    {/* Description */}
                    <div style={{ marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                            {goal.description || 'Missing'}
                        </div>
                    </div>

                    {/* Announcement */}
                    <div style={{ marginBottom: goal.pathToGreen ? 10 : 0 }}>
                        <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Announcement</span>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }}>
                            {goal.announcement?.text || 'Missing'}
                        </div>
                    </div>

                    {/* Path to Green (Red status only) */}
                    {goal.pathToGreen && (
                        <div>
                            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Path to Green</span>
                            <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4, lineHeight: 1.6 }}>
                                {goal.pathToGreen}
                            </div>
                        </div>
                    )}

                    {/* Status Missing action */}
                    {goal.color === 'Missing' && goal.section === 'status_missing' && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, fontSize: 12, color: '#eab308' }}>
                            ⚠️ ACTION REQUIRED: Add status label (status-green, status-yellow, or status-red) in SIM.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SectionBlock({ section, goals }) {
    const [collapsed, setCollapsed] = useState(goals.length === 0);
    const sectionDef = SECTIONS.find(s => s.key === section.key) || { emoji: '❓', name: section.name };

    return (
        <div style={{ marginBottom: 24 }} id={`section-${section.key}`}>
            <div onClick={() => setCollapsed(!collapsed)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 0', borderBottom: '1px solid rgba(139,92,246,0.15)', marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{sectionDef.emoji}</span>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>{section.name}</h2>
                <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 600, marginLeft: 4 }}>({goals.length})</span>
                <span style={{ marginLeft: 'auto', color: '#64748b' }}>
                    {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </span>
            </div>
            {!collapsed && (
                goals.length === 0
                    ? <div style={{ fontSize: 13, color: '#64748b', fontStyle: 'italic', padding: '8px 0' }}>No goals in this section.</div>
                    : goals.map(g => <GoalCard key={g.goalId} goal={g} />)
            )}
        </div>
    );
}

function ExecSummary({ markdown }) {
    if (!markdown) return null;
    return (
        <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 16, padding: '24px 28px', marginBottom: 28 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#c4b5fd', marginBottom: 16 }}>📌 Executive Summary</h2>
            <div style={{ fontSize: 13, lineHeight: 1.8, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
                {markdown}
            </div>
        </div>
    );
}

export default function CppWbrPage() {
    const [isRunning, setIsRunning] = useState(false);
    const [phase, setPhase] = useState('idle');
    const [progress, setProgress] = useState({ loaded: 0, total: 0, message: '' });
    const [report, setReport] = useState(null);
    const [state, setState] = useState(null);
    const [goals, setGoals] = useState([]);
    const [execSummary, setExecSummary] = useState(null);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [warnings, setWarnings] = useState([]);
    const [activeFilter, setActiveFilter] = useState('all');
    const [timer, setTimer] = useState('');
    const timerRef = useRef(null);
    const startRef = useRef(null);

    // Load cached report on mount
    useEffect(() => {
        fetch('/api/cpp-wbr').then(r => r.json()).then(data => {
            if (data.report) {
                setReport(data.report);
                setState(data.state);
                setExecSummary(data.report.executiveSummary);
                // Flatten goals from sections
                const allGoals = [];
                for (const sec of (data.report.sections || [])) {
                    for (const g of (sec.goals || [])) {
                        allGoals.push({ ...g, section: sec.key });
                    }
                }
                setGoals(allGoals);
                setPhase('cached');
            }
        }).catch(() => {});
    }, []);

    const runAction = useCallback(async (action) => {
        setIsRunning(true); setPhase('starting'); setError(null); setWarnings([]);
        if (action === 'generate') { setGoals([]); setReport(null); setExecSummary(null); }
        startRef.current = Date.now();
        timerRef.current = setInterval(() => setTimer(`${((Date.now() - startRef.current) / 1000).toFixed(0)}s`), 1000);

        try {
            const res = await fetch('/api/cpp-wbr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, mode: 'standard' }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '))) {
                    try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'init') {
                            setProgress({ loaded: 0, total: evt.totalGoals, message: `Week ${evt.weekNumber}` });
                        }
                        if (evt.type === 'phase') setPhase(evt.phase);
                        if (evt.type === 'progress') setProgress(p => ({ ...p, loaded: evt.loaded, total: evt.total, message: evt.message }));
                        if (evt.type === 'goal') {
                            setGoals(prev => [...prev, { ...evt.goal, section: evt.goal.section }]);
                            setProgress(p => ({ ...p, loaded: evt.index, total: evt.total }));
                        }
                        if (evt.type === 'section-done') {
                            // Section completed
                        }
                        if (evt.type === 'exec-summary') setExecSummary(evt.summary);
                        if (evt.type === 'warning') setWarnings(prev => [...prev, evt.message]);
                        if (evt.type === 'done') {
                            setPhase('done');
                            // Reload full report
                            const fresh = await fetch('/api/cpp-wbr').then(r => r.json());
                            if (fresh.report) { setReport(fresh.report); setState(fresh.state); }
                        }
                        if (evt.type === 'error') { setError(evt.message); setPhase('error'); }
                    } catch (e) { /* skip */ }
                }
            }
        } catch (err) { setError(err.message); setPhase('error'); }
        clearInterval(timerRef.current); setIsRunning(false);
    }, []);

    const copyReport = () => {
        if (!report) return;
        // Build markdown from report data
        let md = `# ${report.title}\nReport generated on ${report.reportDate}\n\n`;
        if (execSummary) md += `## 📌 Executive Summary\n\n${execSummary}\n\n---\n\n`;
        for (const sec of (report.sections || [])) {
            const secDef = SECTIONS.find(s => s.key === sec.key);
            md += `## ${secDef?.emoji || ''} ${sec.name}\n\n---\n\n`;
            if (!sec.goals || sec.goals.length === 0) {
                md += `*No goals in this section.*\n\n`;
            } else {
                for (const g of sec.goals) {
                    md += `**[${g.goalId}](https://issues.amazon.com/issues/${g.goalId}): ${g.title}** - [ ECD: ${g.ecd} - Status: ${g.color || 'Missing'} ]\n\n`;
                    md += `Goal Type - ${g.goalType || 'Missing'}\n`;
                    md += `**Quad** - PM: ${g.pm || 'Missing'}, PMT: ${g.pmt || 'Missing'}, Tech: ${g.tech || 'Missing'}, SDM: ${g.sdm || 'Missing'}\n\n`;
                    md += `**Description:** ${g.description || 'Missing'}\n\n`;
                    md += `**Announcement:** ${g.announcement?.text || 'Missing'}\n\n`;
                    if (g.pathToGreen) md += `**Path to Green:** ${g.pathToGreen}\n\n`;
                    if (g.color === 'Missing' && sec.key === 'status_missing') {
                        md += `⚠️ **ACTION REQUIRED:** Add status label in SIM.\n\n`;
                    }
                }
            }
        }
        navigator.clipboard.writeText(md).catch(() => {});
        setCopied(true); setTimeout(() => setCopied(false), 2000);
    };

    // Group goals by section for display
    const goalsBySection = {};
    for (const g of goals) {
        const secKey = g.section || 'status_missing';
        if (!goalsBySection[secKey]) goalsBySection[secKey] = [];
        goalsBySection[secKey].push(g);
    }

    // Count stats
    const colorCounts = { Green: 0, Yellow: 0, Red: 0, Missing: 0 };
    goals.forEach(g => { colorCounts[g.color || 'Missing'] = (colorCounts[g.color || 'Missing'] || 0) + 1; });

    const progressPct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
    const hasReport = goals.length > 0 || report;

    return (
        <div className="dark-inline-page" style={{ zoom: 1.1 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <FileBarChart size={22} /> CPP Weekly Business Review
                    </h1>
                    <div style={{ color: '#818cf8', fontSize: 12 }}>
                        {state ? `Week ${state.reportWeek} • ${state.reportDate} • ${state.state}` : 'Classification and Policy Platform — 2026 Goals'}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => runAction('generate')} disabled={isRunning} style={btnStyle('blue', isRunning)}>
                        {isRunning && phase !== 'done' ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Generate
                    </button>
                    <button onClick={() => runAction('regenerate')} disabled={isRunning} style={btnStyle('purple', isRunning)}>
                        <RotateCcw size={14} /> Regenerate
                    </button>
                    <button onClick={() => runAction('resume')} disabled={isRunning} style={btnStyle('gray', isRunning)}>
                        <RefreshCw size={14} /> Resume
                    </button>
                    {hasReport && (
                        <button onClick={copyReport} style={btnStyle('green', false)}>
                            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy MD</>}
                        </button>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            {isRunning && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 600 }}>
                            {phase === 'phase0' ? '🔍 Discovering goals...' :
                             phase === 'phase1' ? '📄 Fetching goal details...' :
                             phase === 'phase35' ? '🧠 Generating Executive Summary...' :
                             phase === 'resume' ? '♻️ Resuming...' :
                             `⚡ ${progress.message || 'Processing...'}`}
                        </span>
                        <span style={{ fontSize: 12, color: '#34d399', fontWeight: 600 }}>{timer} • {progress.loaded}/{progress.total} ({progressPct}%)</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius: 3, transition: 'width 0.5s', width: `${progressPct}%` }} />
                    </div>
                </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
                <div style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                    {warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#eab308', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <AlertTriangle size={12} /> {w}
                        </div>
                    ))}
                </div>
            )}

            {/* Stats Bar */}
            {goals.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <StatPill label="Total" value={goals.length} color="#818cf8" />
                    <StatPill label="Green" value={colorCounts.Green} color="#22c55e" />
                    <StatPill label="Yellow" value={colorCounts.Yellow} color="#eab308" />
                    <StatPill label="Red" value={colorCounts.Red} color="#ef4444" />
                    <StatPill label="Missing" value={colorCounts.Missing} color="#64748b" />
                </div>
            )}

            {/* Section Filter Tabs */}
            {goals.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
                    <FilterTab label="All" active={activeFilter === 'all'} onClick={() => setActiveFilter('all')} count={goals.length} />
                    {SECTIONS.map(sec => {
                        const count = (goalsBySection[sec.key] || []).length;
                        return <FilterTab key={sec.key} label={`${sec.emoji} ${sec.name}`} active={activeFilter === sec.key} onClick={() => setActiveFilter(sec.key)} count={count} />;
                    })}
                </div>
            )}

            {/* Executive Summary */}
            {execSummary && <ExecSummary markdown={execSummary} />}

            {/* Sections + Goals */}
            {goals.length > 0 && (
                activeFilter === 'all'
                    ? SECTIONS.map(sec => (
                        <SectionBlock key={sec.key} section={{ key: sec.key, name: sec.name }} goals={goalsBySection[sec.key] || []} />
                    ))
                    : <SectionBlock section={{ key: activeFilter, name: SECTIONS.find(s => s.key === activeFilter)?.name || activeFilter }} goals={goalsBySection[activeFilter] || []} />
            )}

            {/* Error */}
            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 14, padding: 20, textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ color: '#ff453a', fontWeight: 700, marginBottom: 6 }}>⚠️ Error</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{error}</div>
                </div>
            )}

            {/* Empty State */}
            {!hasReport && !isRunning && !error && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '80px 40px', textAlign: 'center' }}>
                    <div style={{ fontSize: 56, marginBottom: 20 }}>📊</div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'rgba(255,255,255,0.85)' }}>CPP Weekly Business Review</h2>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.6 }}>
                        Click &quot;Generate&quot; to fetch all CPP 2026 goals from SIM, organize them into 11 status sections,
                        and produce a structured WBR report with Executive Summary.
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                        SIM Folder: ab02443f-f7a8-4fec-a815-afc0a27906fa · ~44 goals · Takes 2-5 minutes
                    </p>
                </div>
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
}

function StatPill({ label, value, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
        </div>
    );
}

function FilterTab({ label, active, onClick, count }) {
    return (
        <button onClick={onClick} style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap', border: '1px solid', transition: 'all 0.15s',
            ...(active
                ? { background: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.4)', color: '#c4b5fd' }
                : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)', color: '#64748b' })
        }}>
            {label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
        </button>
    );
}

function btnStyle(color, disabled) {
    const colors = {
        blue: { bg: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'rgba(59,130,246,0.3)' },
        purple: { bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'rgba(139,92,246,0.3)' },
        gray: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)' },
        green: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
    };
    const c = colors[color] || colors.gray;
    return {
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
        fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        background: c.bg, border: `1px solid ${c.border}`, color: color === 'gray' ? '#94a3b8' : '#fff',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.2s',
    };
}
