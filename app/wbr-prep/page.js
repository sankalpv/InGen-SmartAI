'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, Copy, Check, ChevronDown, ChevronUp, Settings, Sparkles, Loader2, Shield, Send, Hash, AtSign } from 'lucide-react';

const DEFAULT_TASK = 'Generate weekly executive report with wins, misses, and insights';

// Reuse the renderMarkdown from agent page pattern
function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let i = 0, listItems = [];
    const flushList = () => { if (listItems.length > 0) { elements.push(<ul key={`ul-${elements.length}`} style={{ listStyle: 'none', padding: 0, margin: '8px 0 16px' }}>{listItems}</ul>); listItems = []; } };
    const inlineFmt = (str, k) => {
        const parts = []; let rem = str, pi = 0;
        const rx = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
        let li = 0, m;
        while ((m = rx.exec(rem)) !== null) {
            if (m.index > li) parts.push(<span key={`${k}-${pi++}`}>{rem.slice(li, m.index)}</span>);
            if (m[2]) parts.push(<strong key={`${k}-${pi++}`} style={{ color: '#f1f5f9', fontWeight: 700 }}>{m[2]}</strong>);
            else if (m[3]) parts.push(<em key={`${k}-${pi++}`} style={{ color: '#a5b4fc', fontStyle: 'italic' }}>{m[3]}</em>);
            else if (m[4]) parts.push(<code key={`${k}-${pi++}`} style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>{m[4]}</code>);
            li = m.index + m[0].length;
        }
        if (li < rem.length) parts.push(<span key={`${k}-${pi++}`}>{rem.slice(li)}</span>);
        return parts.length > 0 ? parts : rem;
    };
    while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') { flushList(); i++; continue; }
        if (t.startsWith('|') && t.endsWith('|')) {
            flushList();
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
                const row = lines[i].trim();
                if (/^[\s|:\-]+$/.test(row) && row.includes('-')) { i++; continue; }
                rows.push(row.split('|').slice(1, -1).map(c => c.trim()));
                i++;
            }
            if (rows.length > 0) {
                elements.push(<div key={`tbl-${elements.length}`} style={{ margin: '16px 0', overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(139,92,246,0.15)', background: 'rgba(0,0,0,0.2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead><tr>{rows[0].map((h, hi) => <th key={hi} style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#c4b5fd', textTransform: 'uppercase', background: 'rgba(139,92,246,0.08)', borderBottom: '1px solid rgba(139,92,246,0.2)' }}>{inlineFmt(h, `th${hi}`)}</th>)}</tr></thead>
                        <tbody>{rows.slice(1).map((row, ri) => <tr key={ri}>{row.map((c, ci) => <td key={ci} style={{ padding: '10px 16px', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{inlineFmt(c, `td${ri}${ci}`)}</td>)}</tr>)}</tbody>
                    </table>
                </div>);
            }
            continue;
        }
        if (/^---+$/.test(t)) { flushList(); elements.push(<hr key={`hr-${i}`} style={{ border: 'none', height: 1, margin: '20px 0', background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.3), transparent)' }} />); i++; continue; }
        const hM = t.match(/^(#{1,4})\s+(.+)$/);
        if (hM) {
            flushList();
            const lvl = hM[1].length;
            const styles = { 1: { fontSize: 22, fontWeight: 800, background: 'linear-gradient(135deg,#fff,#a5b4fc)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', paddingBottom: 12, borderBottom: '1px solid rgba(139,92,246,0.2)', margin: '0 0 16px' },
                2: { fontSize: 17, fontWeight: 700, color: '#e2e8f0', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', margin: '24px 0 10px' },
                3: { fontSize: 15, fontWeight: 700, color: '#c4b5fd', margin: '20px 0 8px' },
                4: { fontSize: 14, fontWeight: 600, color: '#a78bfa', margin: '16px 0 6px' } };
            const Tag = `h${lvl}`;
            elements.push(<Tag key={`h-${i}`} style={styles[lvl]}>{inlineFmt(hM[2], `h${i}`)}</Tag>);
            i++; continue;
        }
        if (t.startsWith('>')) {
            flushList(); const ql = [];
            while (i < lines.length && lines[i].trim().startsWith('>')) { ql.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
            elements.push(<blockquote key={`bq-${elements.length}`} style={{ margin: '14px 0', padding: '14px 18px', borderLeft: '3px solid rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.04)', borderRadius: '0 12px 12px 0', color: '#94a3b8', fontStyle: 'italic' }}>{ql.map((q, qi) => <p key={qi} style={{ margin: '0 0 4px' }}>{inlineFmt(q, `bq${qi}`)}</p>)}</blockquote>);
            continue;
        }
        const liM = t.match(/^[-*•]\s+(.+)$/) || t.match(/^\d+[.)]\s+(.+)$/);
        if (liM) { listItems.push(<li key={`li-${i}`} style={{ position: 'relative', paddingLeft: 22, marginBottom: 8, color: '#94a3b8', lineHeight: 1.7 }}><span style={{ position: 'absolute', left: 6, top: 10, width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#6366f1)', boxShadow: '0 0 6px rgba(129,140,248,0.4)' }} />{inlineFmt(liM[1], `li${i}`)}</li>); i++; continue; }
        flushList();
        elements.push(<p key={`p-${i}`} style={{ margin: '0 0 12px', color: '#94a3b8', lineHeight: 1.8 }}>{inlineFmt(t, `p${i}`)}</p>);
        i++;
    }
    flushList();
    return elements;
}

export default function WbrPrepPage() {
    const [isRunning, setIsRunning] = useState(false);
    const [resultText, setResultText] = useState('');
    const [steps, setSteps] = useState([]);
    const [phase, setPhase] = useState('idle');
    const [timer, setTimer] = useState('0.0s');
    const [subAgent, setSubAgent] = useState(null);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');    const timerRef = useRef(null);
    const startRef = useRef(null);

    // Load custom prompt from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('ingen-wbr-prompt');
        if (saved) setCustomPrompt(saved);
    }, []);

    const savePrompt = () => {
        localStorage.setItem('ingen-wbr-prompt', customPrompt);
    };

    const resetPrompt = () => {
        localStorage.removeItem('ingen-wbr-prompt');
        setCustomPrompt('');
    };

    const generateReport = useCallback(async () => {
        setIsRunning(true); setPhase('planning'); setResultText(''); setSteps([]); setError(null); setSubAgent(null);
        startRef.current = Date.now();
        timerRef.current = setInterval(() => setTimer(`${((Date.now() - startRef.current) / 1000).toFixed(1)}s`), 100);

        try {
            const taskText = customPrompt
                ? `Generate weekly executive report. CUSTOM INSTRUCTIONS: ${customPrompt}`
                : DEFAULT_TASK;
            const res = await fetch('/api/agent', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ task: taskText }),
            });
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                for (const line of decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '))) {
                    try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === 'phase') setPhase(evt.phase);
                        if (evt.type === 'subagent') setSubAgent(evt);
                        if (evt.type === 'plan') setSteps(evt.plan.map((s, i) => ({ ...s, index: i, status: 'pending', icon: s.tool === 'synthesize' ? '📋' : '🔧', label: (s.tool || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) })));
                        if (evt.type === 'step') setSteps(prev => prev.map((s, i) => i === evt.index ? { ...s, ...evt } : s));
                        if (evt.type === 'chunk') setResultText(prev => prev + evt.text);
                        if (evt.type === 'done') { setPhase('done'); setTimer(`${evt.totalElapsed}s · ${evt.toolCount} tools`); }
                        if (evt.type === 'error') { setError(evt.message); setPhase('error'); }
                    } catch (e) { /* skip */ }
                }
            }
        } catch (err) { setError(err.message); }
        clearInterval(timerRef.current); setIsRunning(false);
    }, [customPrompt]);

    const copyReport = () => { navigator.clipboard.writeText(resultText).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    const progress = steps.length > 0 ? Math.round((steps.filter(s => s.status === 'done').length / steps.length) * 100) : 0;

    return (
        <div className="dark-inline-page" style={{ zoom: 1.15 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <FileText size={24} /> Weekly Executive Report
                    </h1>
                    <div style={{ color: '#818cf8', fontSize: 13 }}>AI-generated Wins, Misses &amp; Insights from all data sources</div>
                </div>
                <button onClick={generateReport} disabled={isRunning} style={{
                    background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', border: 'none',
                    borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 600,
                    cursor: isRunning ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isRunning ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                }}>
                    {isRunning ? <><Loader2 size={18} className="spin" /> Generating...</> : <><Sparkles size={18} /> Generate Report</>}
                </button>
            </div>

            {/* Prompt Editor */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
                <button onClick={() => setShowPrompt(!showPrompt)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
                    <Settings size={14} /> Customize Report Prompt
                    {showPrompt ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
                </button>
                {showPrompt && (
                    <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                            Add custom instructions to guide the report (e.g., focus areas, team name, specific metrics to highlight).
                            Leave empty to use the default executive report format.
                        </div>
                        <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)}
                            placeholder="e.g., Focus on Embedding Excellence and Artemis milestones. Team name is CPP. Highlight cost savings and latency improvements."
                            style={{ width: '100%', minHeight: 100, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '12px 14px', color: '#cbd5e1', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button onClick={savePrompt} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                                💾 Save Prompt
                            </button>
                            <button onClick={resetPrompt} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                                ↩ Reset to Default
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sub-Agent Badge */}
            {subAgent && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
                    <span style={{ fontSize: 18 }}>{subAgent.icon}</span>
                    <span>Weekly Executive Report Agent</span>
                    <span style={{ fontSize: 10, color: '#818cf8', fontWeight: 400, marginLeft: 4 }}>activated</span>
                </div>
            )}

            {/* Pipeline */}
            {steps.length > 0 && phase !== 'idle' && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 14, color: '#818cf8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Data Collection Pipeline</span>
                        <span style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>{timer}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, padding: '10px 0', overflowX: 'auto' }}>
                        {steps.map((s, i) => (
                            <div key={i} style={{ display: 'contents' }}>
                                <div style={{ width: 80, textAlign: 'center' }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, margin: '0 auto 4px', border: '2px solid transparent',
                                        ...(s.status === 'done' ? { background: 'rgba(34,197,94,0.15)', borderColor: '#22c55e' } : s.status === 'running' ? { background: 'rgba(59,130,246,0.15)', borderColor: '#3b82f6', animation: 'pulse 1.2s infinite' } : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' })
                                    }}>{s.icon}</div>
                                    <div style={{ fontSize: 9, color: '#64748b', fontWeight: 500 }}>{s.label}</div>
                                    {s.count != null && <div style={{ fontSize: 8, color: '#22c55e', fontWeight: 600 }}>{s.count} results</div>}
                                </div>
                                {i < steps.length - 1 && <div style={{ width: 30, height: 2, background: s.status === 'done' ? '#22c55e' : 'rgba(255,255,255,0.06)', flexShrink: 0 }} />}
                            </div>
                        ))}
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 12, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)', borderRadius: 2, transition: 'width 0.5s', width: `${progress}%` }} />
                    </div>
                </div>
            )}

            {/* Report Result */}
            {resultText && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '24px 28px', marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 14, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📋 Report</h3>
                        <button onClick={copyReport} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {copied ? <><Check size={14} color="#22c55e" /> Copied!</> : <><Copy size={14} /> Copy Report</>}
                        </button>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: '#cbd5e1' }}>
                        {renderMarkdown(resultText)}
                        {phase === 'synthesizing' && <span style={{ display: 'inline-block', width: 6, height: 16, background: 'linear-gradient(180deg,#818cf8,#6366f1)', marginLeft: 2, borderRadius: 1, animation: 'blink 0.8s ease-in-out infinite', verticalAlign: 'text-bottom' }} />}
                    </div>
                </div>
            )}

            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: 14, padding: 20, textAlign: 'center' }}>
                    <div style={{ color: '#ff453a', fontWeight: 700, marginBottom: 6 }}>⚠️ Error</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{error}</div>
                </div>
            )}

            {/* Empty state */}
            {!resultText && !isRunning && !error && (
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '80px 40px', textAlign: 'center' }}>
                    <div style={{ fontSize: 56, marginBottom: 20 }}>📊</div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: 'rgba(255,255,255,0.85)' }}>Weekly Executive Report</h2>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, maxWidth: 480, margin: '0 auto 28px', lineHeight: 1.6 }}>
                        Click &quot;Generate Report&quot; to pull data from emails, calendar, tickets, and goals
                        to create an executive-quality report with Wins, Misses, and Insights.
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
                        💡 Customize the prompt to focus on specific areas or adjust the report format.
                    </p>
                </div>
            )}

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.05)} }
                @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
}
