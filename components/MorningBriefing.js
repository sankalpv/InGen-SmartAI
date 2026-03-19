'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Volume2, VolumeX, RefreshCw, Mic } from 'lucide-react';

/**
 * MorningBriefing — Cinematic "Command Center Boot Sequence"
 * Full-screen overlay with glowing orb, flying data cards, 
 * word-by-word text sync, and TTS speech.
 */

// ─── Best TTS Voice Selection (shared with VoiceAssistant) ───
function getBestVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length === 0) return null;

    // Debug: log all available voices (once)
    if (!getBestVoice._logged) {
        console.log('[MorningBriefing] Available voices:', voices.map(v => `"${v.name}" (${v.lang}) ${v.localService ? 'local' : 'remote'}`));
        getBestVoice._logged = true;
    }

    const pick = (v) => { console.log('[MorningBriefing] ✅ Using voice:', v.name); return v; };

    const tryFind = (names, enhanced) => {
        for (const name of names) {
            const v = voices.find(v => enhanced
                ? v.name.startsWith(name) && v.name.includes('Enhanced')
                : v.name === name);
            if (v) return v;
        }
        return null;
    };

    // #1 TOP PRIORITY: "Zoe (Premium)" — user's preferred voice
    const zoePremium = voices.find(v => v.name === 'Zoe (Premium)');
    if (zoePremium) return pick(zoePremium);

    // #2: Any Siri voice (if browser exposes them)
    const siriAny = voices.find(v => v.name.toLowerCase().includes('siri') && v.lang.startsWith('en'));
    if (siriAny) return pick(siriAny);

    // #3: "Samantha (Enhanced)" — high quality macOS voice
    const samE = tryFind(['Samantha'], true);
    if (samE) return pick(samE);

    // #3: Other Enhanced voices
    const enhV = tryFind(['Flo', 'Shelley', 'Sandy', 'Reed', 'Karen', 'Daniel'], true);
    if (enhV) return pick(enhV);

    // #4: Modern macOS character voices
    const modV = tryFind(['Flo', 'Shelley', 'Sandy', 'Reed', 'Eddy']);
    if (modV) return pick(modV);

    // #5: Google cloud voice (Chrome)
    const googleV = voices.find(v => v.name === 'Google US English');
    if (googleV) return pick(googleV);

    // #6: Classic voices
    const classicV = tryFind(['Samantha', 'Karen', 'Daniel', 'Kathy', 'Tessa']);
    if (classicV) return pick(classicV);

    // #7: Any English voice fallback
    const englishV = voices.find(v => v.lang.startsWith('en'));
    const chosen = englishV || voices[0];
    if (chosen) return pick(chosen);
    return null;
}

// ─── Sound Effects ───
function playChime(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.12;
        if (type === 'start') {
            osc.frequency.setValueAtTime(392, ctx.currentTime);      // G4
            osc.frequency.setValueAtTime(523, ctx.currentTime + 0.15); // C5
            osc.frequency.setValueAtTime(659, ctx.currentTime + 0.3);  // E5
            osc.frequency.setValueAtTime(784, ctx.currentTime + 0.45); // G5
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
            osc.start(); osc.stop(ctx.currentTime + 0.6);
        } else if (type === 'end') {
            osc.frequency.setValueAtTime(784, ctx.currentTime);
            osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
            osc.frequency.setValueAtTime(523, ctx.currentTime + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
            osc.start(); osc.stop(ctx.currentTime + 0.4);
        } else if (type === 'card') {
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.06);
            gain.gain.value = 0.06;
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.start(); osc.stop(ctx.currentTime + 0.08);
        }
        setTimeout(() => ctx.close(), 1000);
    } catch (e) { /* audio not available */ }
}

// ─── Source Card Config ───
const SOURCE_CARDS = [
    { key: 'emails', icon: '📧', label: 'Emails', color: '#3b82f6', direction: 'left' },
    { key: 'calendar', icon: '📅', label: 'Calendar', color: '#8b5cf6', direction: 'right' },
    { key: 'goals', icon: '🎯', label: 'Goals', color: '#10b981', direction: 'left' },
    { key: 'codeMetrics', icon: '📊', label: 'Code Metrics', color: '#f59e0b', direction: 'right' },
    { key: 'tickets', icon: '🎫', label: 'Tickets', color: '#06b6d4', direction: 'left' },
];

function formatSourceSummary(key, data) {
    if (!data) return 'No data available';
    switch (key) {
        case 'emails': return `${data.total} emails · ${data.urgent} urgent`;
        case 'calendar': return `${data.totalMeetings} meetings${data.firstMeeting ? ` · First: ${data.firstMeeting.time}` : ''}`;
        case 'goals': return `${data.green}🟢 ${data.yellow}🟡 ${data.red}🔴 · ${data.missedEcds || 0} ECDs missed`;
        case 'codeMetrics': return `${data.crsCreated} CRs · ${data.crsReviewed} reviewed · ${data.staleCrs} stale`;
        case 'tickets': return `${data.totalOpen} open · ${data.aging14d} aging · ${data.assignedToMe} yours`;
        default: return '';
    }
}

export default function MorningBriefing({ isOpen, onClose }) {
    const [phase, setPhase] = useState('boot'); // boot → loading → speaking → done
    const [status, setStatus] = useState('Initializing...');
    const [sources, setSources] = useState(null);
    const [visibleCards, setVisibleCards] = useState([]);
    const [briefingText, setBriefingText] = useState('');
    const [displayedWords, setDisplayedWords] = useState([]);
    const [currentWordIdx, setCurrentWordIdx] = useState(-1);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [activeCardKey, setActiveCardKey] = useState(null);
    const [orbIntensity, setOrbIntensity] = useState(0.3);
    const utteranceRef = useRef(null);
    const wordTimerRef = useRef(null);
    const containerRef = useRef(null);

    // ─── Boot sequence ───
    useEffect(() => {
        if (!isOpen) return;
        setPhase('boot');
        setSources(null);
        setVisibleCards([]);
        setBriefingText('');
        setDisplayedWords([]);
        setCurrentWordIdx(-1);
        setIsSpeaking(false);
        setActiveCardKey(null);
        setOrbIntensity(0.3);

        // Ascending chime
        playChime('start');

        // Transition to loading after boot animation
        const timer = setTimeout(() => {
            setPhase('loading');
            fetchBriefing();
        }, 1500);

        return () => clearTimeout(timer);
    }, [isOpen]);

    // ─── Fetch the briefing ───
    const fetchBriefing = useCallback(async () => {
        try {
            setStatus('Gathering your data...');
            const res = await fetch('/api/morning-briefing');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'status') {
                            setStatus(data.message);
                        } else if (data.type === 'sources') {
                            setSources(data.data);
                            // Animate cards flying in with staggered delay
                            animateCardsIn(data.data);
                        } else if (data.type === 'chunk') {
                            fullText += data.text;
                            setBriefingText(fullText);
                        } else if (data.type === 'done') {
                            setPhase('speaking');
                            setOrbIntensity(0.8);
                            // Start speaking and word-by-word display
                            startSpeakingAndDisplay(fullText);
                        } else if (data.type === 'error') {
                            setStatus(`Error: ${data.message}`);
                            setPhase('done');
                        }
                    } catch (e) { /* skip parse errors */ }
                }
            }
        } catch (error) {
            setStatus(`Failed: ${error.message}`);
            setPhase('done');
        }
    }, []);

    // ─── Animate cards flying in ───
    const animateCardsIn = useCallback((sourceData) => {
        SOURCE_CARDS.forEach((card, i) => {
            setTimeout(() => {
                setVisibleCards(prev => [...prev, card.key]);
                playChime('card');
            }, i * 400);
        });
    }, []);

    // ─── Speaking + word-by-word display ───
    const startSpeakingAndDisplay = useCallback((text) => {
        const words = text.split(/(\s+)/).filter(w => w.trim().length > 0);
        setDisplayedWords(words);
        setCurrentWordIdx(0);

        // Card highlighting based on keywords
        const cardKeywords = {
            emails: ['email', 'emails', 'urgent', 'inbox', 'sender', 'respond'],
            calendar: ['meeting', 'meetings', 'calendar', 'sync', 'schedule', 'o\'clock', 'AM', 'PM'],
            goals: ['goal', 'goals', 'green', 'yellow', 'red', 'ecd', 'blocked', 'wbr'],
            codeMetrics: ['code', 'review', 'cr', 'crs', 'stale', 'engineer', 'decline', 'commit'],
            tickets: ['ticket', 'tickets', 'sev', 'aging', 'open', 'resolved', 'resolver'],
        };

        // Word-by-word reveal timer
        const avgWordDuration = Math.max(80, Math.min(200, (text.length / words.length) * 15));
        let wordIdx = 0;
        wordTimerRef.current = setInterval(() => {
            if (wordIdx >= words.length) {
                clearInterval(wordTimerRef.current);
                return;
            }
            setCurrentWordIdx(wordIdx);

            // Check if this word should highlight a card
            const word = words[wordIdx].toLowerCase().replace(/[^a-z]/g, '');
            for (const [cardKey, keywords] of Object.entries(cardKeywords)) {
                if (keywords.includes(word)) {
                    setActiveCardKey(cardKey);
                    setTimeout(() => setActiveCardKey(null), 1200);
                    break;
                }
            }

            wordIdx++;
        }, avgWordDuration);

        // TTS
        if (!isMuted && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            const voice = getBestVoice();
            if (voice) utterance.voice = voice;
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => {
                setIsSpeaking(false);
                setPhase('done');
                playChime('end');
                setOrbIntensity(0.2);
            };
            utterance.onerror = () => {
                setIsSpeaking(false);
                setPhase('done');
            };

            utteranceRef.current = utterance;
            window.speechSynthesis.speak(utterance);
        } else {
            // If muted, just let the word timer run then finish
            setTimeout(() => {
                setPhase('done');
                playChime('end');
                setOrbIntensity(0.2);
            }, words.length * avgWordDuration + 500);
        }
    }, [isMuted]);

    // ─── Auto-scroll teleprompter to keep current word centered ───
    useEffect(() => {
        if (containerRef.current && currentWordIdx >= 0 && (phase === 'speaking')) {
            const container = containerRef.current;
            const words = container.querySelectorAll('span[data-word]');
            const activeWord = words[currentWordIdx];
            if (activeWord) {
                const containerRect = container.getBoundingClientRect();
                const wordRect = activeWord.getBoundingClientRect();
                const offset = wordRect.top - containerRect.top - containerRect.height / 2 + wordRect.height / 2;
                container.scrollTop += offset * 0.3; // Smooth easing
            }
        }
    }, [currentWordIdx, phase]);

    // ─── Cleanup ───
    useEffect(() => {
        return () => {
            if (wordTimerRef.current) clearInterval(wordTimerRef.current);
            window.speechSynthesis?.cancel();
        };
    }, []);

    // ─── Close handler ───
    const handleClose = useCallback(() => {
        if (wordTimerRef.current) clearInterval(wordTimerRef.current);
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
        onClose();
    }, [onClose]);

    // ─── Replay ───
    const handleReplay = useCallback(() => {
        if (wordTimerRef.current) clearInterval(wordTimerRef.current);
        window.speechSynthesis?.cancel();
        if (briefingText) {
            setPhase('speaking');
            setOrbIntensity(0.8);
            startSpeakingAndDisplay(briefingText);
        }
    }, [briefingText, startSpeakingAndDisplay]);

    // ─── Toggle mute ───
    const toggleMute = useCallback(() => {
        if (isSpeaking) {
            window.speechSynthesis?.cancel();
            setIsSpeaking(false);
        }
        setIsMuted(m => !m);
    }, [isSpeaking]);

    // Ensure TTS voices are loaded
    useEffect(() => {
        window.speechSynthesis?.getVoices();
        const handler = () => window.speechSynthesis?.getVoices();
        window.speechSynthesis?.addEventListener('voiceschanged', handler);
        return () => window.speechSynthesis?.removeEventListener('voiceschanged', handler);
    }, []);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
            paddingTop: '80px',
            animation: 'mbFadeIn 0.6s ease forwards',
            fontFamily: 'var(--font-sans)',
            overflow: 'hidden',
        }}>
            {/* Close button */}
            <button onClick={handleClose} style={{
                position: 'absolute', top: '24px', right: '24px', zIndex: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px', padding: '10px', cursor: 'pointer', color: 'rgba(255,255,255,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
            }}>
                <X size={20} />
            </button>

            {/* Controls (top-left) */}
            <div style={{
                position: 'absolute', top: '24px', left: '24px', zIndex: 10,
                display: 'flex', gap: '8px',
            }}>
                <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'} style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '10px', cursor: 'pointer',
                    color: isMuted ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)',
                    display: 'flex', alignItems: 'center',
                }}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                {phase === 'done' && (
                    <button onClick={handleReplay} title="Replay" style={{
                        background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                        borderRadius: '12px', padding: '10px', cursor: 'pointer',
                        color: '#a78bfa', display: 'flex', alignItems: 'center',
                    }}>
                        <RefreshCw size={18} />
                    </button>
                )}
            </div>

            {/* Title */}
            <div style={{
                position: 'absolute', top: '28px', left: '50%', transform: 'translateX(-50%)',
                fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.3)',
                textTransform: 'uppercase', letterSpacing: '2px',
                display: 'flex', alignItems: 'center', gap: '8px',
            }}>
                <Mic size={14} />
                InGen Morning Briefing
            </div>

            {/* ─── The Orb ─── */}
            <div style={{
                width: '100px', height: '100px', borderRadius: '50%',
                background: `radial-gradient(circle, 
                    rgba(139, 92, 246, ${orbIntensity}) 0%, 
                    rgba(59, 130, 246, ${orbIntensity * 0.5}) 40%, 
                    rgba(16, 185, 129, ${orbIntensity * 0.2}) 70%, 
                    transparent 100%)`,
                boxShadow: `
                    0 0 ${60 * orbIntensity}px rgba(139, 92, 246, ${orbIntensity * 0.6}),
                    0 0 ${120 * orbIntensity}px rgba(59, 130, 246, ${orbIntensity * 0.3}),
                    0 0 ${200 * orbIntensity}px rgba(139, 92, 246, ${orbIntensity * 0.15})`,
                animation: phase === 'boot' ? 'orbBoot 1.5s ease forwards'
                    : (phase === 'speaking' || isSpeaking) ? 'orbSpeak 1.5s ease-in-out infinite'
                    : 'orbBreathe 3s ease-in-out infinite',
                transition: 'box-shadow 0.5s ease, background 0.5s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '32px',
                position: 'relative',
            }}>
                {/* Waveform bars inside orb when speaking */}
                {(phase === 'speaking' || isSpeaking) && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', height: '40px' }}>
                        {[0.6, 1.0, 0.8, 1.0, 0.6].map((_, i) => (
                            <div key={i} style={{
                                width: '5px', borderRadius: '3px',
                                background: 'rgba(255,255,255,0.6)',
                                animation: `waveBar ${0.4 + i * 0.1}s ease-in-out infinite alternate`,
                                animationDelay: `${i * 0.08}s`,
                            }} />
                        ))}
                    </div>
                )}
                {phase === 'loading' && (
                    <div style={{
                        width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.15)',
                        borderTop: '2px solid rgba(255,255,255,0.6)',
                        borderRadius: '50%', animation: 'spin 1s linear infinite',
                    }} />
                )}
                {phase === 'boot' && (
                    <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)',
                        animation: 'orbPulseCore 0.8s ease-in-out infinite',
                    }} />
                )}
            </div>

            {/* Status text */}
            {(phase === 'boot' || phase === 'loading') && (
                <div style={{
                    fontSize: '15px', color: 'rgba(255,255,255,0.4)', fontWeight: '500',
                    marginBottom: '40px', animation: 'mbFadeIn 0.3s ease',
                    display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                    {phase === 'boot' ? 'Initializing InGen...' : status}
                </div>
            )}

            {/* ─── Data Source Cards ─── */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '16px',
                justifyContent: 'center', maxWidth: '900px',
                marginBottom: '36px', minHeight: '80px',
            }}>
                {SOURCE_CARDS.map((card, i) => {
                    const isVisible = visibleCards.includes(card.key);
                    const isActive = activeCardKey === card.key;
                    const data = sources?.[card.key];
                    const colorRgb = card.color === '#3b82f6' ? '59,130,246' : card.color === '#8b5cf6' ? '139,92,246' : card.color === '#10b981' ? '16,185,129' : card.color === '#f59e0b' ? '245,158,11' : '6,182,212';
                    return (
                        <div key={card.key} style={{
                            background: isActive
                                ? `rgba(${colorRgb}, 0.18)`
                                : 'rgba(255,255,255,0.04)',
                            backdropFilter: 'blur(20px)',
                            border: `1px solid ${isActive ? card.color + '60' : 'rgba(255,255,255,0.08)'}`,
                            borderRadius: '18px',
                            padding: '18px 26px',
                            opacity: isVisible ? 1 : 0,
                            transform: isVisible ? 'translateY(0) scale(1)' : `translateY(20px) scale(0.9)`,
                            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                            boxShadow: isActive ? `0 0 40px rgba(${colorRgb}, 0.25)` : '0 4px 20px rgba(0,0,0,0.2)',
                            minWidth: '150px',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '28px', marginBottom: '6px' }}>{card.icon}</div>
                            <div style={{
                                fontSize: '13px', fontWeight: '700', color: card.color,
                                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
                            }}>
                                {card.label}
                                {isVisible && data && <span style={{ marginLeft: '6px', color: 'rgba(255,255,255,0.3)' }}>✓</span>}
                            </div>
                            {isVisible && data && (
                                <div style={{
                                    fontSize: '14px', color: 'rgba(255,255,255,0.6)', fontWeight: '500',
                                    animation: 'mbFadeIn 0.3s ease',
                                    lineHeight: '1.4',
                                }}>
                                    {formatSourceSummary(card.key, data)}
                                </div>
                            )}
                            {isVisible && !data && (
                                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
                                    Not configured
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ─── Cinematic Teleprompter Text ─── */}
            {(phase === 'speaking' || phase === 'done') && displayedWords.length > 0 && (
                <div style={{
                    position: 'relative',
                    width: '100%', maxWidth: '860px',
                    flex: '1 1 auto',
                    minHeight: '180px',
                    animation: 'mbFadeIn 0.8s ease',
                }}>
                    {/* Top fade gradient */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: '40px',
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, transparent 100%)',
                        zIndex: 2, pointerEvents: 'none',
                    }} />
                    {/* Bottom fade gradient */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px',
                        background: 'linear-gradient(0deg, rgba(0,0,0,0.92) 0%, transparent 100%)',
                        zIndex: 2, pointerEvents: 'none',
                    }} />

                    <div ref={containerRef} style={{
                        maxHeight: '320px', overflowY: 'auto',
                        padding: '50px 48px 70px',
                        textAlign: 'center',
                        lineHeight: '2.2',
                        fontSize: '22px',
                        fontWeight: '300',
                        letterSpacing: '0.01em',
                        scrollBehavior: 'smooth',
                    }}>
                        {displayedWords.map((word, i) => {
                            const isActive = i === currentWordIdx;
                            const isPast = i < currentWordIdx;
                            const isFuture = i > currentWordIdx;
                            const isNear = Math.abs(i - currentWordIdx) <= 3;
                            return (
                                <span key={i} data-word={i} style={{
                                    display: 'inline',
                                    opacity: isActive ? 1 : isPast ? 0.5 : isFuture && isNear ? 0.2 : 0.08,
                                    color: isActive ? '#fff' : isPast ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                                    fontWeight: isActive ? '600' : '300',
                                    fontSize: isActive ? '24px' : '22px',
                                    textShadow: isActive ? '0 0 30px rgba(139,92,246,0.6), 0 0 60px rgba(139,92,246,0.3)' : 'none',
                                    transition: 'all 0.2s ease',
                                }}>
                                    {word}{' '}
                                </span>
                            );
                        })}
                        {phase === 'speaking' && (
                            <span style={{
                                display: 'inline-block', width: '3px', height: '1.1em',
                                background: 'linear-gradient(180deg, #a78bfa, #6366f1)',
                                borderRadius: '2px',
                                animation: 'blink 0.8s step-end infinite',
                                verticalAlign: 'text-bottom', marginLeft: '4px',
                                boxShadow: '0 0 12px rgba(139,92,246,0.6)',
                            }} />
                        )}
                    </div>
                </div>
            )}

            {/* ─── Done state ─── */}
            {phase === 'done' && (
                <div style={{
                    marginTop: '24px', display: 'flex', gap: '12px',
                    animation: 'mbFadeIn 0.5s ease',
                }}>
                    <button onClick={handleReplay} style={{
                        padding: '12px 24px', borderRadius: '14px',
                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(59,130,246,0.2))',
                        border: '1px solid rgba(139,92,246,0.3)',
                        color: '#a78bfa', fontSize: '14px', fontWeight: '600',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.2s',
                    }}>
                        <RefreshCw size={16} /> Replay
                    </button>
                    <button onClick={handleClose} style={{
                        padding: '12px 24px', borderRadius: '14px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: '600',
                        cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        transition: 'all 0.2s',
                    }}>
                        Got it 💪
                    </button>
                </div>
            )}

            {/* ─── Animations ─── */}
            <style jsx>{`
                @keyframes mbFadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes orbBoot {
                    0% { transform: scale(0.3); opacity: 0; }
                    50% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes orbBreathe {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                }
                @keyframes orbSpeak {
                    0%, 100% { transform: scale(1); }
                    25% { transform: scale(1.12); }
                    50% { transform: scale(0.95); }
                    75% { transform: scale(1.08); }
                }
                @keyframes orbPulseCore {
                    0%, 100% { transform: scale(1); opacity: 0.3; }
                    50% { transform: scale(1.5); opacity: 0.6; }
                }
                @keyframes waveBar {
                    from { height: 8px; }
                    to { height: 32px; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div>
    );
}
