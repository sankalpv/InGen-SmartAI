'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

const TEMPLATES = [
    { icon: '📋', label: 'Meeting prep', prompt: 'Prepare me for my next meeting' },
    { icon: '📊', label: 'Weekly summary', prompt: 'Summarize my week so far' },
    { icon: '🔍', label: 'Investigate topic', prompt: 'What do I know about ' },
    { icon: '📧', label: 'Draft reply', prompt: 'Draft a reply to the latest email about ' },
    { icon: '🎯', label: 'Goal deep-dive', prompt: 'What is the status of our goals?' },
    { icon: '👥', label: 'Team check-in', prompt: 'Give me a team pulse check' },
    { icon: '💬', label: 'Slack search', prompt: 'Search Slack for ' },
];

// ─── Sub-components ───

function PipelineVisualizer({ steps, progress, timer }) {
    return (
        <div className="agent-pipeline-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', color: '#818cf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⚡ Execution Pipeline
                </h3>
                <span style={{ fontSize: '13px', color: '#34d399', fontWeight: 600 }}>{timer}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, justifyContent: 'center', padding: '10px 0', overflowX: 'auto' }}>
                {steps.map((s, i) => (
                    <div key={i} style={{ display: 'contents' }}>
                        <div className={`agent-node ${s.status}`} style={{ width: '90px', textAlign: 'center', position: 'relative' }}>
                            <div className={`agent-node-icon ${s.status}`}>
                                {s.icon}
                            </div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                            <div style={{ fontSize: '9px', color: '#475569', marginTop: '2px' }}>
                                {s.status !== 'pending' && s.elapsed ? `${s.elapsed}s` : ''}
                            </div>
                            {s.count !== undefined && s.count !== null && (
                                <div style={{ fontSize: '9px', color: '#22c55e', fontWeight: 600, marginTop: '1px' }}>
                                    {typeof s.count === 'number' ? `${s.count} result${s.count !== 1 ? 's' : ''}` : s.count}
                                </div>
                            )}
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`agent-connector ${s.status === 'done' ? 'done' : s.status === 'running' ? 'active' : ''}`} />
                        )}
                    </div>
                ))}
            </div>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '16px', overflow: 'hidden' }}>
                <div style={{
                    height: '100%', background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius: '2px',
                    transition: 'width 0.5s', width: `${progress}%`,
                }} />
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px', textAlign: 'center' }}>
                {progress}% complete · {steps.filter(s => s.status === 'done').length} of {steps.length} steps done
            </div>
        </div>
    );
}

function ClarifySection({ questions, onSubmit, onSkip }) {
    const [answers, setAnswers] = useState({});
    const selectOpt = (qIdx, opt) => {
        setAnswers(prev => ({ ...prev, [`q${qIdx}`]: opt }));
    };
    return (
        <div className="agent-clarify-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#c4b5fd', fontWeight: 500, marginBottom: '16px' }}>
                <span style={{ fontSize: '20px' }}>🤔</span>
                <span>Before I start, a few questions to tailor the output:</span>
            </div>
            {questions.map((q, qi) => (
                <div key={qi} style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px', fontWeight: 500 }}>
                        {qi + 1}. {q.question}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(q.options || []).map((opt, oi) => (
                            <button key={oi}
                                className={`agent-cq-btn ${answers[`q${qi}`] === opt ? 'selected' : ''}`}
                                onClick={() => selectOpt(qi, opt)}
                            >{opt}</button>
                        ))}
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(139,92,246,0.1)' }}>
                <button className="agent-cq-go" onClick={() => onSubmit(answers)}>▶ Execute with these preferences</button>
                <button className="agent-cq-skip" onClick={onSkip}>⏩ Skip &amp; use defaults</button>
            </div>
        </div>
    );
}

function EvidencePanel({ evidence }) {
    if (!evidence || evidence.length === 0) return null;
    return (
        <div className="agent-evidence-panel">
            <h3 style={{ fontSize: '13px', color: '#818cf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                🔎 Tool Evidence
            </h3>
            {evidence.map((ev, i) => (
                <div key={i} className="agent-evidence-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '16px' }}>{ev.icon}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#c4b5fd' }}>{ev.label}</span>
                        {ev.count !== undefined && (
                            <span style={{ fontSize: '10px', color: '#22c55e', marginLeft: 'auto', fontWeight: 600 }}>
                                {ev.count} result{ev.count !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.5', marginBottom: '4px' }}>
                        {ev.summary}
                    </div>
                    {ev.data && Array.isArray(ev.data) && ev.data.slice(0, 5).map((item, j) => (
                        <div key={j} className="agent-evidence-item">
                            {Object.entries(item).slice(0, 3).map(([k, v]) => (
                                <span key={k}>
                                    <span style={{ color: '#818cf8', fontWeight: 500, marginRight: '4px' }}>{k}:</span>
                                    {String(v).substring(0, 80)}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    let listItems = [];
    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(<ul key={`ul-${elements.length}`} className="agent-md-ul">{listItems}</ul>);
            listItems = [];
        }
    };
    const inlineFormat = (str, lineKey) => {
        const parts = [];
        let remaining = str;
        let partIdx = 0;
        // Process inline patterns: **bold**, *italic*, `code`
        const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(remaining)) !== null) {
            if (match.index > lastIndex) {
                parts.push(<span key={`${lineKey}-${partIdx++}`}>{remaining.slice(lastIndex, match.index)}</span>);
            }
            if (match[2]) {
                parts.push(<strong key={`${lineKey}-${partIdx++}`} className="agent-md-bold">{match[2]}</strong>);
            } else if (match[3]) {
                parts.push(<em key={`${lineKey}-${partIdx++}`} className="agent-md-italic">{match[3]}</em>);
            } else if (match[4]) {
                parts.push(<code key={`${lineKey}-${partIdx++}`} className="agent-md-code">{match[4]}</code>);
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < remaining.length) {
            parts.push(<span key={`${lineKey}-${partIdx++}`}>{remaining.slice(lastIndex)}</span>);
        }
        return parts.length > 0 ? parts : remaining;
    };
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        // Empty line
        if (trimmed === '') { flushList(); i++; continue; }
        // Table detection (| col1 | col2 |)
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            flushList();
            const tableRows = [];
            while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
                const row = lines[i].trim();
                // Skip separator rows like |---|---| or |:---:|:---|
                if (/^[\s|:\-]+$/.test(row) && row.includes('-')) {
                    i++; continue;
                }
                const cells = row.split('|').slice(1, -1).map(c => c.trim());
                tableRows.push(cells);
                i++;
            }
            if (tableRows.length > 0) {
                const headerRow = tableRows[0];
                const bodyRows = tableRows.slice(1);
                elements.push(
                    <div key={`tbl-${elements.length}`} className="agent-md-table-wrap">
                        <table className="agent-md-table">
                            <thead>
                                <tr>{headerRow.map((h, hi) => <th key={hi}>{inlineFormat(h, `th${hi}`)}</th>)}</tr>
                            </thead>
                            <tbody>
                                {bodyRows.map((row, ri) => (
                                    <tr key={ri}>{row.map((c, ci) => <td key={ci}>{inlineFormat(c, `td${ri}${ci}`)}</td>)}</tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
            continue;
        }
        // Horizontal rule
        if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
            flushList();
            elements.push(<hr key={`hr-${i}`} className="agent-md-hr" />);
            i++; continue;
        }
        // Headers
        const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
        if (hMatch) {
            flushList();
            const level = hMatch[1].length;
            const Tag = `h${level}`;
            elements.push(<Tag key={`h-${i}`} className={`agent-md-h${level}`}>{inlineFormat(hMatch[2], `h${i}`)}</Tag>);
            i++; continue;
        }
        // Blockquote
        if (trimmed.startsWith('>')) {
            flushList();
            const quoteLines = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
                i++;
            }
            elements.push(
                <blockquote key={`bq-${elements.length}`} className="agent-md-blockquote">
                    {quoteLines.map((ql, qi) => <p key={qi}>{inlineFormat(ql, `bq${qi}`)}</p>)}
                </blockquote>
            );
            continue;
        }
        // List item
        const liMatch = trimmed.match(/^[-*•]\s+(.+)$/);
        if (liMatch) {
            listItems.push(<li key={`li-${i}`} className="agent-md-li">{inlineFormat(liMatch[1], `li${i}`)}</li>);
            i++; continue;
        }
        // Numbered list
        const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
        if (olMatch) {
            listItems.push(<li key={`li-${i}`} className="agent-md-li">{inlineFormat(olMatch[1], `ol${i}`)}</li>);
            i++; continue;
        }
        // Regular paragraph
        flushList();
        elements.push(<p key={`p-${i}`} className="agent-md-p">{inlineFormat(trimmed, `p${i}`)}</p>);
        i++;
    }
    flushList();
    return elements;
}

function ResultPanel({ resultText, isStreaming }) {
    const copyToClipboard = () => {
        navigator.clipboard.writeText(resultText).catch(() => {});
    };
    if (!resultText && !isStreaming) return null;
    return (
        <div className="agent-results-panel">
            <h3 style={{ fontSize: '14px', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '14px' }}>
                📋 Result
            </h3>
            <div className="agent-md">
                {renderMarkdown(resultText)}
                {isStreaming && (
                    <span className="agent-md-cursor" />
                )}
            </div>
            {resultText && !isStreaming && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button className="agent-action-btn" onClick={copyToClipboard}>📋 Copy</button>
                    <button className="agent-action-btn">📄 Export</button>
                    <button className="agent-action-btn">✉️ Draft email</button>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ───

export default function AgentWorkspacePage() {
    const [task, setTask] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [phase, setPhase] = useState('idle');
    const [plan, setPlan] = useState([]);
    const [steps, setSteps] = useState([]);
    const [evidence, setEvidence] = useState([]);
    const [resultText, setResultText] = useState('');
    const [clarifyQuestions, setClarifyQuestions] = useState(null);
    const [preferences, setPreferences] = useState({});
    const [timer, setTimer] = useState('0.0s');
    const [error, setError] = useState(null);
    const [subAgent, setSubAgent] = useState(null);
    const [history, setHistory] = useState([]);
    const [followUp, setFollowUp] = useState(null);
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);
    const resultRef = useRef(null);

    const startTimer = useCallback(() => {
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
            const elapsed = ((Date.now() - startTimeRef.current) / 1000).toFixed(1);
            setTimer(`${elapsed}s`);
        }, 100);
    }, []);

    const stopTimer = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    const executeTask = useCallback(async (taskText, prefs = {}) => {
        setIsRunning(true);
        setPhase('planning');
        setPlan([]);
        setSteps([]);
        setEvidence([]);
        setResultText('');
        setClarifyQuestions(null);
        setError(null);
        setSubAgent(null);
        startTimer();

        try {
            const res = await fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task: taskText, preferences: prefs }),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                for (const line of chunk.split('\n').filter(l => l.startsWith('data: '))) {
                    try {
                        const evt = JSON.parse(line.slice(6));
                        handleEvent(evt);
                    } catch (e) { /* skip */ }
                }
            }
        } catch (err) {
            setError(err.message);
        }

        stopTimer();
        setIsRunning(false);
    }, [startTimer, stopTimer]);

    const handleEvent = useCallback((evt) => {
        switch (evt.type) {
            case 'phase':
                setPhase(evt.phase);
                break;
            case 'plan':
                setPlan(evt.plan || []);
                setSteps((evt.plan || []).map((s, i) => {
                    const toolName = s.tool || 'unknown';
                    return {
                        ...s, index: i, status: 'pending',
                        icon: toolName === 'synthesize' ? '📋' : (s.icon || '🔧'),
                        label: toolName === 'synthesize' ? 'Synthesize'
                            : toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    };
                }));
                break;
            case 'clarify':
                setClarifyQuestions(evt.questions);
                setPlan(evt.plan || []);
                setPhase('clarify');
                break;
            case 'step':
                setSteps(prev => prev.map((s, i) =>
                    i === evt.index ? { ...s, ...evt } : s
                ));
                if (evt.status === 'done' && evt.data) {
                    setEvidence(prev => [...prev, { tool: evt.tool, icon: evt.icon, label: evt.label, summary: evt.summary, count: evt.count, data: evt.data }]);
                }
                break;
            case 'chunk':
                setResultText(prev => prev + evt.text);
                break;
            case 'subagent':
                setSubAgent({ name: evt.name, icon: evt.icon, description: evt.description });
                break;
            case 'memory':
                if (evt.isFollowUp) setFollowUp({ previousTask: evt.previousTask });
                break;
            case 'done':
                setPhase('done');
                setTimer(`${evt.totalElapsed}s total · ${evt.toolCount} tools`);
                // Refresh history after task completes
                fetch('/api/agent?view=history').then(r => r.json()).then(d => setHistory(d.history || [])).catch(() => {});
                break;
            case 'error':
                setError(evt.message);
                setPhase('error');
                break;
        }
    }, []);

    // Load history on mount
    useEffect(() => {
        fetch('/api/agent?view=history').then(r => r.json()).then(d => setHistory(d.history || [])).catch(() => {});
    }, []);

    useEffect(() => {
        if (resultRef.current && phase === 'synthesizing') {
            resultRef.current.scrollTop = resultRef.current.scrollHeight;
        }
    }, [resultText, phase]);

    const progress = steps.length > 0
        ? Math.round((steps.filter(s => s.status === 'done').length / steps.length) * 100)
        : 0;

    return (
        <div className="dark-inline-page" style={{ zoom: 1.15 }}>
            <style>{AGENT_CSS}</style>
            <h1 style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                🧬 Agent Workspace
            </h1>
            <div style={{ color: '#818cf8', fontSize: '13px', marginBottom: '24px' }}>
                Multi-step AI task planner with tool orchestration
            </div>

            {/* Task Input */}
            <div className="agent-task-input-area">
                <label style={{ fontSize: '14px', color: '#94a3b8', marginBottom: '10px', display: 'block' }}>
                    What would you like me to do?
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        className="agent-task-input"
                        placeholder="e.g. Prepare me for tomorrow's BSV2 risk discussion"
                        value={task}
                        onChange={e => setTask(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && task.trim() && !isRunning) executeTask(task); }}
                        disabled={isRunning}
                    />
                    <button
                        className="agent-execute-btn"
                        onClick={() => executeTask(task)}
                        disabled={!task.trim() || isRunning}
                    >
                        {isRunning ? '⏳ Running...' : '▶ Execute'}
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    {TEMPLATES.map((t, i) => (
                        <button key={i} className="agent-template-btn" onClick={() => { setTask(t.prompt); }}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Clarifying Questions */}
            {phase === 'clarify' && clarifyQuestions && (
                <ClarifySection
                    questions={clarifyQuestions}
                    onSubmit={(prefs) => { setPreferences(prefs); executeTask(task, prefs); }}
                    onSkip={() => executeTask(task, {})}
                />
            )}

            {/* Follow-Up Context Banner */}
            {followUp && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
                    padding: '10px 16px', borderRadius: '10px', fontSize: '12px',
                    background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                    color: '#34d399', animation: 'agentFadeUp 0.3s ease-out',
                }}>
                    <span style={{ fontSize: '16px' }}>🧠</span>
                    <span style={{ fontWeight: 600 }}>Follow-up detected</span>
                    <span style={{ color: '#64748b' }}>· Building on:</span>
                    <span style={{ color: '#94a3b8', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                        &quot;{followUp.previousTask}&quot;
                    </span>
                </div>
            )}

            {/* Sub-Agent Badge */}
            {subAgent && (
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
                    padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))',
                    border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd',
                    animation: 'agentFadeUp 0.3s ease-out',
                }}>
                    <span style={{ fontSize: '18px' }}>{subAgent.icon}</span>
                    <span>{subAgent.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Agent</span>
                    <span style={{ fontSize: '10px', color: '#818cf8', fontWeight: 400, marginLeft: '4px' }}>activated</span>
                </div>
            )}

            {/* Pipeline Visualizer */}
            {steps.length > 0 && phase !== 'idle' && phase !== 'clarify' && (
                <PipelineVisualizer steps={steps} progress={progress} timer={timer} />
            )}

            {/* Results + Evidence */}
            {(resultText || evidence.length > 0) && (
                <div className="agent-results-grid">
                    <ResultPanel resultText={resultText} isStreaming={phase === 'synthesizing'} ref={resultRef} />
                    <EvidencePanel evidence={evidence} />
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '14px', padding: '20px', marginTop: '16px', textAlign: 'center' }}>
                    <div style={{ color: '#ff453a', fontWeight: 700, marginBottom: '6px' }}>⚠️ Agent Error</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px' }}>{error}</div>
                </div>
            )}

            {/* Task History */}
            {history.length > 0 && (
                <div style={{ marginTop: '24px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '16px' }}>
                    <h3 style={{ fontSize: '13px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                        📜 Task History
                    </h3>
                    {history.slice(0, 5).map((h) => (
                        <button key={h.id} onClick={() => { setTask(h.task); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', marginBottom: '4px', borderRadius: '8px', background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s', color: '#94a3b8' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.15)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'; }}
                        >
                            <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0, minWidth: '50px' }}>{h.timeAgo}</span>
                            <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.task}</span>
                            {h.subAgent && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.1)', color: '#818cf8', flexShrink: 0 }}>{h.subAgent}</span>}
                            <span style={{ fontSize: '10px', color: '#475569', flexShrink: 0 }}>{h.totalElapsed}s</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const AGENT_CSS = `
@keyframes agentPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.05)} }
@keyframes agentBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }
@keyframes agentFlowRight { 0%{background-position:-40px 0} 100%{background-position:40px 0} }
@keyframes agentFadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }

.agent-task-input-area {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px; padding: 20px; margin-bottom: 24px;
}
.agent-task-input {
    flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 14px 18px; color: #fff; font-size: 15px; outline: none;
    font-family: inherit; transition: all 0.2s;
}
.agent-task-input:focus {
    border-color: rgba(139,92,246,0.5); box-shadow: 0 0 0 3px rgba(139,92,246,0.15);
}
.agent-task-input:disabled { opacity: 0.5; }
.agent-execute-btn {
    background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: #fff; border: none;
    border-radius: 12px; padding: 14px 28px; font-size: 15px; font-weight: 600;
    cursor: pointer; font-family: inherit; transition: all 0.2s; white-space: nowrap;
}
.agent-execute-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 20px rgba(139,92,246,0.4); }
.agent-execute-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.agent-template-btn {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 8px 14px; color: #94a3b8; font-size: 12px;
    cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: inherit;
    transition: all 0.15s;
}
.agent-template-btn:hover {
    background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.3); color: #c4b5fd;
}

.agent-pipeline-section {
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; padding: 20px; margin-bottom: 24px;
    animation: agentFadeUp 0.3s ease-out;
}
.agent-node-icon {
    width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center;
    justify-content: center; font-size: 22px; margin: 0 auto 6px; transition: all 0.3s;
    border: 2px solid transparent;
}
.agent-node-icon.pending { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
.agent-node-icon.running { background: rgba(59,130,246,0.15); border-color: #3b82f6; animation: agentPulse 1.2s infinite; }
.agent-node-icon.done { background: rgba(34,197,94,0.15); border-color: #22c55e; }
.agent-node-icon.error { background: rgba(239,68,68,0.15); border-color: #ef4444; }

.agent-connector {
    width: 40px; height: 2px; background: rgba(255,255,255,0.06); flex-shrink: 0;
}
.agent-connector.active {
    background: linear-gradient(90deg,#3b82f6,#8b5cf6);
    background-size: 40px 2px; animation: agentFlowRight 1s infinite;
}
.agent-connector.done { background: #22c55e; }

.agent-clarify-section {
    background: rgba(139,92,246,0.04); border: 1px solid rgba(139,92,246,0.15);
    border-radius: 16px; padding: 20px; margin-bottom: 24px;
    animation: agentFadeUp 0.3s ease-out;
}
.agent-cq-btn {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 7px 14px; color: #94a3b8; font-size: 12px;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.agent-cq-btn:hover { background: rgba(139,92,246,0.1); border-color: rgba(139,92,246,0.3); color: #c4b5fd; }
.agent-cq-btn.selected { background: rgba(139,92,246,0.15); border-color: #8b5cf6; color: #c4b5fd; font-weight: 600; }
.agent-cq-go {
    background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: #fff; border: none;
    border-radius: 10px; padding: 10px 24px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit;
}
.agent-cq-skip {
    background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #64748b;
    border-radius: 10px; padding: 10px 20px; font-size: 13px; cursor: pointer; font-family: inherit;
}
.agent-cq-skip:hover { color: #94a3b8; border-color: rgba(255,255,255,0.2); }

.agent-results-grid {
    display: grid; grid-template-columns: 1fr 360px; gap: 16px; margin-top: 24px;
    animation: agentFadeUp 0.4s ease-out;
}
@media (max-width: 900px) { .agent-results-grid { grid-template-columns: 1fr; } }

.agent-results-panel {
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; padding: 20px; min-height: 200px;
}
.agent-result-content h4 { color: #e2e8f0; font-weight: 600; margin: 14px 0 6px; font-size: 15px; }
.agent-result-content ul { padding-left: 18px; margin: 6px 0; }
.agent-result-content li { margin-bottom: 4px; }

.agent-evidence-panel {
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; padding: 16px; max-height: 600px; overflow-y: auto;
}
.agent-evidence-card {
    background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: default;
    transition: all 0.15s;
}
.agent-evidence-card:hover { border-color: rgba(139,92,246,0.3); background: rgba(99,102,241,0.06); }
.agent-evidence-item {
    padding: 4px 8px; background: rgba(255,255,255,0.03); border-radius: 6px;
    margin-bottom: 3px; font-size: 11px; color: #94a3b8; display: flex; gap: 6px;
    flex-wrap: wrap;
}

.agent-action-btn {
    padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04); color: #94a3b8; font-size: 12px;
    cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: inherit;
    transition: all 0.15s;
}
.agent-action-btn:hover { background: rgba(139,92,246,0.1); color: #c4b5fd; }

/* ═══ Markdown Rendering — Liquid Glass Typography ═══ */

.agent-md {
    font-size: 14px; line-height: 1.8; color: #cbd5e1;
}

/* Headers — gradient text with glow underlines */
.agent-md-h1 {
    font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 16px 0;
    background: linear-gradient(135deg, #fff 0%, #a5b4fc 100%);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(139,92,246,0.2);
    box-shadow: 0 1px 0 rgba(139,92,246,0.1);
}
.agent-md-h2 {
    font-size: 17px; font-weight: 700; letter-spacing: -0.3px; margin: 24px 0 10px 0;
    color: #e2e8f0; display: flex; align-items: center; gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
.agent-md-h3 {
    font-size: 15px; font-weight: 700; margin: 20px 0 8px 0;
    color: #c4b5fd;
}
.agent-md-h4 {
    font-size: 14px; font-weight: 600; margin: 16px 0 6px 0;
    color: #a78bfa;
}

/* Paragraphs */
.agent-md-p {
    margin: 0 0 12px 0; color: #94a3b8; line-height: 1.8;
}

/* Bold — bright white pop */
.agent-md-bold {
    color: #f1f5f9; font-weight: 700; letter-spacing: 0.01em;
}

/* Italic */
.agent-md-italic {
    color: #a5b4fc; font-style: italic;
}

/* Inline code — glass pill */
.agent-md-code {
    background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.2);
    color: #c4b5fd; padding: 2px 8px; border-radius: 6px; font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace; font-weight: 500;
}

/* Unordered list — custom purple dot bullets */
.agent-md-ul {
    list-style: none; padding-left: 0; margin: 8px 0 16px 0;
}
.agent-md-li {
    position: relative; padding-left: 22px; margin-bottom: 8px;
    color: #94a3b8; line-height: 1.7;
}
.agent-md-li::before {
    content: ''; position: absolute; left: 6px; top: 10px;
    width: 6px; height: 6px; border-radius: 50%;
    background: linear-gradient(135deg, #818cf8, #6366f1);
    box-shadow: 0 0 6px rgba(129,140,248,0.4);
}

/* Blockquote — purple-bordered citation card */
.agent-md-blockquote {
    margin: 14px 0; padding: 14px 18px;
    border-left: 3px solid rgba(139,92,246,0.4);
    background: rgba(139,92,246,0.04);
    border-radius: 0 12px 12px 0;
    color: #94a3b8; font-style: italic;
}
.agent-md-blockquote p { margin: 0 0 4px 0; }

/* Table — glass-card style */
.agent-md-table-wrap {
    margin: 16px 0; overflow-x: auto; border-radius: 12px;
    border: 1px solid rgba(139,92,246,0.15);
    background: rgba(0,0,0,0.2);
}
.agent-md-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
}
.agent-md-table thead th {
    text-align: left; padding: 12px 16px; font-weight: 700; font-size: 12px;
    color: #c4b5fd; text-transform: uppercase; letter-spacing: 0.04em;
    background: rgba(139,92,246,0.08);
    border-bottom: 1px solid rgba(139,92,246,0.2);
}
.agent-md-table tbody td {
    padding: 10px 16px; color: #94a3b8; line-height: 1.6;
    border-bottom: 1px solid rgba(255,255,255,0.04);
}
.agent-md-table tbody tr:last-child td { border-bottom: none; }
.agent-md-table tbody tr:hover td {
    background: rgba(139,92,246,0.04); color: #cbd5e1;
}

/* Horizontal rule — gradient divider */
.agent-md-hr {
    border: none; height: 1px; margin: 20px 0;
    background: linear-gradient(90deg, transparent, rgba(139,92,246,0.3), rgba(59,130,246,0.3), transparent);
}

/* Streaming cursor */
.agent-md-cursor {
    display: inline-block; width: 6px; height: 16px;
    background: linear-gradient(180deg, #818cf8, #6366f1);
    margin-left: 2px; border-radius: 1px;
    animation: agentBlink 0.8s ease-in-out infinite;
    vertical-align: text-bottom;
    box-shadow: 0 0 8px rgba(129,140,248,0.5);
}
`;
