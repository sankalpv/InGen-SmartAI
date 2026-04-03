'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StickyNote, Plus, Trash2, Save, Sparkles, Loader2, Copy, Check, Clock, AlertTriangle, User, Calendar, ChevronRight } from 'lucide-react';
import AIChat from '@/components/AIChat';

const PRIORITY_COLORS = {
    High: { bg: 'rgba(244,63,94,0.12)', color: '#fb7185', border: 'rgba(244,63,94,0.25)' },
    Medium: { bg: 'rgba(234,179,8,0.12)', color: '#facc15', border: 'rgba(234,179,8,0.25)' },
    Low: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.25)' },
};

function formatDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '—'; }
}

function formatTime(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

function isOverdue(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
}

export default function NotesPage() {
    const [notes, setNotes] = useState([]);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [currentNote, setCurrentNote] = useState(null);
    const [title, setTitle] = useState('');
    const [rawText, setRawText] = useState('');
    const [actionItems, setActionItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const textareaRef = useRef(null);

    // ─── Load notes list ───
    const loadNotes = useCallback(async () => {
        try {
            const res = await fetch('/api/notes');
            const data = await res.json();
            setNotes(data.notes || []);
        } catch (e) { console.error('Failed to load notes:', e); }
        setIsLoading(false);
    }, []);

    useEffect(() => { loadNotes(); }, [loadNotes]);

    // ─── Load a specific note ───
    const loadNote = async (id) => {
        try {
            const res = await fetch(`/api/notes?id=${id}`);
            const data = await res.json();
            if (data.note) {
                setCurrentNote(data.note);
                setTitle(data.note.title);
                setRawText(data.note.rawText);
                setActionItems(data.note.actionItems || []);
                setSelectedNoteId(id);
            }
        } catch (e) { console.error('Failed to load note:', e); }
    };

    // ─── Create new note ───
    const createNote = async () => {
        const now = new Date();
        const defaultTitle = `Note — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', title: defaultTitle }),
            });
            const data = await res.json();
            if (data.note) {
                await loadNotes();
                await loadNote(data.note.id);
                setTimeout(() => textareaRef.current?.focus(), 100);
            }
        } catch (e) { console.error('Failed to create note:', e); }
    };

    // ─── Save current note ───
    const saveNote = async () => {
        if (!selectedNoteId) return;
        setIsSaving(true);
        setSaveStatus(null);
        try {
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update', id: selectedNoteId, title, rawText, actionItems }),
            });
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus(null), 2000);
            loadNotes();
        } catch (e) { setSaveStatus('error'); }
        setIsSaving(false);
    };

    // ─── Delete note ───
    const deleteNote = async (id) => {
        if (!confirm('Delete this note?')) return;
        try {
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id }),
            });
            if (selectedNoteId === id) {
                setSelectedNoteId(null);
                setCurrentNote(null);
                setTitle('');
                setRawText('');
                setActionItems([]);
            }
            loadNotes();
        } catch (e) { console.error('Failed to delete note:', e); }
    };

    // ─── Extract action items via LLM ───
    const extractActionItems = async () => {
        if (!rawText.trim()) return;
        setIsExtracting(true);
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'extract', rawText, title }),
            });
            const data = await res.json();
            if (data.actionItems && data.actionItems.length > 0) {
                setActionItems(data.actionItems);
                // Auto-save with extracted items
                if (selectedNoteId) {
                    await fetch('/api/notes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update', id: selectedNoteId, title, rawText, actionItems: data.actionItems }),
                    });
                    loadNotes();
                }
            }
        } catch (e) { console.error('Failed to extract:', e); }
        setIsExtracting(false);
    };

    // ─── Copy action items as markdown ───
    const copyAsMarkdown = () => {
        const md = actionItems.map(a =>
            `- [ ] **${a.owner || '?'}**: ${a.action}${a.dueDate ? ` (due ${formatDate(a.dueDate)})` : ''} [${a.priority || 'Medium'}]`
        ).join('\n');
        navigator.clipboard.writeText(md);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // ─── Toggle action item complete ───
    const toggleComplete = (index) => {
        const updated = [...actionItems];
        updated[index] = { ...updated[index], completed: !updated[index].completed };
        setActionItems(updated);
    };

    // ─── Auto-save on Ctrl+S ───
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                saveNote();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [selectedNoteId, title, rawText, actionItems]);

    return (
        <div className="dark-inline-page" style={{ display: 'flex', gap: '0', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
            {/* ─── Left Panel: Notes History ─── */}
            <div style={{
                width: '280px', flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column', background: 'rgba(12,12,20,0.5)',
            }}>
                {/* Header */}
                <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StickyNote size={18} color="#a78bfa" /> Notes
                        </h2>
                        <button onClick={createNote} style={{
                            background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', border: 'none',
                            borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                            <Plus size={14} /> New
                        </button>
                    </div>
                </div>

                {/* Notes List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : notes.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'rgba(255,255,255,0.25)' }}>
                            <StickyNote size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>No notes yet</div>
                            <div style={{ fontSize: '11px', marginTop: '4px' }}>Click "+ New" to start</div>
                        </div>
                    ) : (
                        notes.map(note => {
                            const isActive = selectedNoteId === note.id;
                            return (
                                <div key={note.id}
                                    onClick={() => loadNote(note.id)}
                                    style={{
                                        padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                                        marginBottom: '4px', transition: 'all 0.15s',
                                        background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                                        border: isActive ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
                                    }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {note.title}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Clock size={10} />
                                                {formatDate(note.createdAt)} {formatTime(note.createdAt)}
                                            </div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.15)', flexShrink: 0 }}
                                            onMouseEnter={e => e.currentTarget.style.color = '#fb7185'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ─── Right Panel: Editor + Action Items ─── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {!selectedNoteId ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'rgba(255,255,255,0.2)' }}>
                        <StickyNote size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                        <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Select a note or create a new one</div>
                        <div style={{ fontSize: '13px' }}>Type raw meeting notes and let AI extract action items</div>
                    </div>
                ) : (
                    <>
                        {/* Title + Save bar */}
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Note title..."
                                style={{
                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                    color: '#fff', fontSize: '18px', fontWeight: 700, fontFamily: 'inherit',
                                }}
                            />
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {saveStatus === 'saved' && <span style={{ fontSize: '11px', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Saved</span>}
                                <button onClick={saveNote} disabled={isSaving} style={{
                                    background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
                                }}>
                                    {isSaving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                                    Save
                                </button>
                            </div>
                        </div>

                        {/* Editor area */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                            {/* Raw text editor */}
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', display: 'block' }}>
                                    Raw Notes
                                </label>
                                <textarea
                                    ref={textareaRef}
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder="Type or paste your meeting notes here... &#10;&#10;Example: Abhijit mentioned the semantic executor design is done, needs CR by Friday. Deqian will pick up the drift detection backlog item next week. Need to follow up with Ruchika on the Insights dashboard by end of month."
                                    style={{
                                        width: '100%', minHeight: '200px', padding: '16px', borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
                                        color: '#fff', fontSize: '14px', fontFamily: 'inherit', lineHeight: 1.6,
                                        resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                                    }}
                                />
                                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                                    <button onClick={extractActionItems} disabled={isExtracting || !rawText.trim()} style={{
                                        background: isExtracting ? 'rgba(139,92,246,0.1)' : 'linear-gradient(135deg, #6366f1, #a855f7)',
                                        color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 20px',
                                        fontSize: '13px', fontWeight: 700, cursor: isExtracting ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit',
                                        boxShadow: isExtracting ? 'none' : '0 4px 12px rgba(99,102,241,0.3)',
                                        opacity: !rawText.trim() ? 0.4 : 1,
                                    }}>
                                        {isExtracting ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
                                        {isExtracting ? 'Extracting...' : 'Extract Action Items'}
                                    </button>
                                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', alignSelf: 'center' }}>
                                        ⌘S to save · AI resolves names, dates, and priorities
                                    </span>
                                </div>
                            </div>

                            {/* Action Items Table */}
                            {actionItems.length > 0 && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                                            Action Items ({actionItems.length})
                                        </label>
                                        <button onClick={copyAsMarkdown} style={{
                                            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit',
                                        }}>
                                            {copied ? <Check size={11} /> : <Copy size={11} />}
                                            {copied ? 'Copied!' : 'Copy as Markdown'}
                                        </button>
                                    </div>

                                    <div style={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                        {/* Table header */}
                                        <div style={{
                                            display: 'grid', gridTemplateColumns: '32px 1fr 2.5fr 100px 80px',
                                            padding: '10px 16px', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.3)',
                                            textTransform: 'uppercase', letterSpacing: '0.8px', background: 'rgba(255,255,255,0.02)',
                                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                                        }}>
                                            <div></div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={10} /> Owner</div>
                                            <div>Action</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={10} /> Due</div>
                                            <div>Priority</div>
                                        </div>

                                        {/* Rows */}
                                        {actionItems.map((item, i) => {
                                            const overdue = isOverdue(item.dueDate) && !item.completed;
                                            const pStyle = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.Medium;
                                            return (
                                                <div key={i} style={{
                                                    display: 'grid', gridTemplateColumns: '32px 1fr 2.5fr 100px 80px',
                                                    padding: '12px 16px', fontSize: '13px', alignItems: 'center',
                                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                    background: item.completed ? 'rgba(34,197,94,0.03)' : overdue ? 'rgba(244,63,94,0.03)' : 'transparent',
                                                    opacity: item.completed ? 0.5 : 1,
                                                    transition: 'background 0.15s',
                                                }}>
                                                    <div>
                                                        <input type="checkbox" checked={item.completed || false}
                                                            onChange={() => toggleComplete(i)}
                                                            style={{ width: '16px', height: '16px', accentColor: '#6366f1', cursor: 'pointer' }} />
                                                    </div>
                                                    <div style={{ fontWeight: 600, color: item.completed ? 'rgba(255,255,255,0.3)' : '#a5b4fc' }}>
                                                        {(item.owner || '?').replace('@', '')}
                                                    </div>
                                                    <div style={{
                                                        color: item.completed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.8)',
                                                        textDecoration: item.completed ? 'line-through' : 'none',
                                                    }}>
                                                        {item.action}
                                                        {item.context && (
                                                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px', fontStyle: 'italic' }}>
                                                                {item.context}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: overdue ? 700 : 400,
                                                        color: overdue ? '#fb7185' : 'rgba(255,255,255,0.45)',
                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                    }}>
                                                        {overdue && <AlertTriangle size={11} />}
                                                        {item.dueDate ? formatDate(item.dueDate) : '—'}
                                                    </div>
                                                    <div>
                                                        <span style={{
                                                            fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                                                            background: pStyle.bg, color: pStyle.color, border: `1px solid ${pStyle.border}`,
                                                        }}>
                                                            {item.priority || 'Medium'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Footer info */}
                            {currentNote && (
                                <div style={{ marginTop: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.15)', textAlign: 'right' }}>
                                    Created: {formatDate(currentNote.createdAt)} {formatTime(currentNote.createdAt)} · Updated: {formatDate(currentNote.updatedAt)} {formatTime(currentNote.updatedAt)}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <AIChat pageContext="notes" />

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
