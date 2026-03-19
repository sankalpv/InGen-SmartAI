'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, X, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';

/**
 * VoiceAssistant — Talk to InGen with your voice.
 * Uses Web Speech API (SpeechRecognition) for voice→text,
 * sends to /api/chat, and speaks the response with SpeechSynthesis.
 * 
 * Works on Chrome, Edge, Safari. Falls back gracefully on Firefox.
 */

// Pick the best available TTS voice (prefer Siri voices first, then Enhanced)
function getBestVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length === 0) return null;

    // Debug: log all available voices so we can see exact naming
    if (!getBestVoice._logged) {
        console.log('[VoiceAssistant] Available voices:', voices.map(v => `"${v.name}" (${v.lang}) ${v.localService ? 'local' : 'remote'}`));
        getBestVoice._logged = true;
    }

    const pick = (label, v) => { console.log(`[VoiceAssistant] ✅ Using ${label}:`, v.name); return v; };

    // #1 TOP PRIORITY: "Zoe (Premium)" — user's preferred voice
    const zoePremium = voices.find(v => v.name === 'Zoe (Premium)');
    if (zoePremium) return pick('Zoe Premium', zoePremium);

    // #2: Any Siri voice (if browser exposes them)
    const siriAny = voices.find(v => v.name.toLowerCase().includes('siri') && v.lang.startsWith('en'));
    if (siriAny) return pick('Siri', siriAny);

    // #3: "Samantha (Enhanced)" — high quality macOS voice
    const samanthaEnhanced = voices.find(v => v.name === 'Samantha (Enhanced)');
    if (samanthaEnhanced) return pick('Samantha Enhanced', samanthaEnhanced);

    // #3: Other Enhanced voices available in Chrome on macOS
    const enhancedNames = ['Flo', 'Shelley', 'Sandy', 'Reed', 'Karen', 'Daniel'];
    for (const name of enhancedNames) {
        const enhanced = voices.find(v => v.name.startsWith(name) && v.name.includes('Enhanced'));
        if (enhanced) return pick('Enhanced', enhanced);
    }

    // #4: Newer macOS character voices (Flo, Shelley, Sandy — sound better than classic)
    const modernVoices = ['Flo', 'Shelley', 'Sandy', 'Reed', 'Eddy', 'Grandma', 'Rocko'];
    for (const name of modernVoices) {
        const match = voices.find(v => v.name.startsWith(name) && v.lang.startsWith('en-US'));
        if (match) return pick('modern', match);
    }

    // #5: Google cloud voices (Chrome — localService: false means cloud-processed)
    const googleVoice = voices.find(v => v.name === 'Google US English');
    if (googleVoice) return pick('Google US English', googleVoice);

    // #6: Classic voices
    const classicNames = ['Samantha', 'Karen', 'Daniel', 'Kathy', 'Tessa'];
    for (const name of classicNames) {
        const match = voices.find(v => v.name === name);
        if (match) return pick('classic', match);
    }

    // Fallback: first English voice
    const englishVoice = voices.find(v => v.lang.startsWith('en'));
    const chosen = englishVoice || voices[0];
    console.log('[VoiceAssistant] Fallback voice:', chosen?.name);
    return chosen;
}

// Detect page context from pathname
function getPageContext(pathname) {
    if (pathname?.includes('/eng-metrics')) return 'eng-metrics';
    if (pathname?.includes('/my-team')) return 'my-team';
    if (pathname?.includes('/ticket-health')) return 'ticket-health';
    if (pathname?.includes('/team-pulse')) return 'team-pulse';
    return null;
}

export default function VoiceAssistant() {
    const pathname = usePathname();
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [response, setResponse] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(true);
    const [voiceReady, setVoiceReady] = useState(false);
    const [muteResponse, setMuteResponse] = useState(false);
    const recognitionRef = useRef(null);
    const synthRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const micStreamRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const conversationHistory = useRef([]);
    const [micLevel, setMicLevel] = useState(0); // 0-1 real mic volume

    // ─── Sound Effects (Web Audio API oscillator — no external files) ───
    const playSound = useCallback((type) => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.15;

            if (type === 'start') {
                // Rising tone — "bloop"
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                osc.start(); osc.stop(ctx.currentTime + 0.15);
            } else if (type === 'stop') {
                // Falling tone — "thunk"
                osc.frequency.setValueAtTime(600, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
                osc.start(); osc.stop(ctx.currentTime + 0.12);
            } else if (type === 'error') {
                // Double low beep
                osc.frequency.value = 200;
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                osc.start(); osc.stop(ctx.currentTime + 0.2);
            } else if (type === 'wake') {
                // Ascending chime — "ding-ding"
                osc.frequency.setValueAtTime(523, ctx.currentTime);
                osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
                osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start(); osc.stop(ctx.currentTime + 0.3);
            }
            setTimeout(() => ctx.close(), 500);
        } catch (e) { /* audio context not available */ }
    }, []);

    // ─── Real Mic Volume Monitor (AnalyserNode) ───
    const startMicMonitor = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let lastSpeechTime = Date.now();

            const monitor = () => {
                if (!analyserRef.current) return;
                analyser.getByteFrequencyData(dataArray);
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                const level = Math.min(1, avg / 80); // Normalize to 0-1
                setMicLevel(level);

                // Auto-stop: detect 2s of silence while listening
                if (level > 0.05) {
                    lastSpeechTime = Date.now();
                }
                // Note: actual auto-stop is handled by SpeechRecognition's built-in silence detection

                requestAnimationFrame(monitor);
            };
            monitor();
        } catch (e) {
            console.warn('[VoiceAssistant] Mic monitor failed:', e.message);
        }
    }, []);

    const stopMicMonitor = useCallback(() => {
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }
        analyserRef.current = null;
        setMicLevel(0);
    }, []);

    // Check browser support
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsSupported(false);
            return;
        }

        // ─── Main recognition (for actual questions) ───
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            // Auto-stop speaking the moment user starts talking — InGen yields to you
            if (window.speechSynthesis?.speaking) {
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
            }

            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }
            setTranscript(finalTranscript || interimTranscript);
            if (finalTranscript) {
                // Strip wake word from the query if user said "Hey InGen what are my goals"
                const cleaned = finalTranscript.replace(/^hey\s+(ingen|engine|in\s*gen)\s*/i, '').trim();
                handleVoiceInput(cleaned || finalTranscript);
            }
        };

        recognition.onerror = (event) => {
            // "aborted" is expected when switching between wake word and main recognition
            if (event.error === 'aborted') return;
            if (event.error === 'not-allowed') {
                console.error('Speech recognition error:', event.error);
                setError('Microphone access denied. Please allow microphone access.');
            } else if (event.error !== 'no-speech') {
                console.warn('[VoiceAssistant] Recognition error:', event.error);
                setError(`Voice error: ${event.error}`);
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            // Only restart wake word if panel is NOT open (user closed it)
            // If panel is open, user is in conversation mode — don't steal the mic
        };

        recognitionRef.current = recognition;

        // Load TTS voices (they load asynchronously)
        const loadVoices = () => {
            const voices = window.speechSynthesis?.getVoices();
            if (voices && voices.length > 0) setVoiceReady(true);
        };
        loadVoices();
        window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);

        return () => {
            recognition.abort();
            window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
            window.speechSynthesis?.cancel();
        };
    }, []);

    // Send voice transcript to AI chat endpoint
    // Detect if a question needs the agent (goals, tickets, CRs, engineers) vs simple chat (emails, calendar)
    const needsAgent = useCallback((text) => {
        const lower = text.toLowerCase();
        const agentKeywords = ['goal', 'goals', 'objective', 'ecd', 'wbr', 'ticket', 'tickets', 'sev-', 'resolver',
            'code review', 'cr ', 'crs', 'stale cr', 'engineer', 'who is working', 'who works', 'who\'s working',
            'assignee', 'assigned to', 'red goal', 'green goal', 'yellow goal', 'blocked', 'org pulse',
            'team health', 'code metric', 'how many cr', 'how many ticket'];
        return agentKeywords.some(kw => lower.includes(kw));
    }, []);

    const handleVoiceInput = useCallback(async (text) => {
        if (!text.trim()) return;
        setIsListening(false);
        setIsProcessing(true);
        setResponse('');
        setError(null);

        const pageContext = getPageContext(pathname);
        conversationHistory.current.push({ role: 'user', content: text });

        // Smart routing: goal/ticket/CR questions → Agent, email/calendar → Chat
        const useAgent = needsAgent(text);

        try {
            let res;
            if (useAgent) {
                // Route to Agent for tool-powered answers (goals, tickets, CRs)
                res = await fetch('/api/agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task: text, preferences: { skipClarify: true } }),
                });
            } else {
                // Route to Chat for email/calendar RAG
                res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        history: conversationHistory.current.slice(-6),
                        stream: true,
                        pageContext,
                    }),
                });
            }

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
                        if (data.type === 'chunk') {
                            fullText += data.text;
                            setResponse(fullText);
                        }
                    } catch (e) { /* skip */ }
                }
            }

            // Add to history
            conversationHistory.current.push({ role: 'assistant', content: fullText });

            // Speak the response
            setIsProcessing(false);
            if (!muteResponse && fullText) {
                speakText(fullText);
            }
        } catch (e) {
            setError(`Failed: ${e.message}`);
            setIsProcessing(false);
        }
    }, [pathname, muteResponse]);

    // Text-to-Speech — rewrite via Bedrock for natural speech, then speak
    const speakText = useCallback(async (text) => {
        if (!window.speechSynthesis) return;

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        // Send to Bedrock to rewrite into natural spoken format
        let spokenText = text;
        try {
            const rewriteRes = await fetch('/api/voice-rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            if (rewriteRes.ok) {
                const data = await rewriteRes.json();
                if (data.spoken) {
                    spokenText = data.spoken;
                    console.log('[VoiceAssistant] 🔊 Bedrock rewrite:', spokenText.substring(0, 100) + '...');
                }
            }
        } catch (e) {
            console.warn('[VoiceAssistant] Voice rewrite failed, using original:', e.message);
        }

        // Final cleanup
        const cleanText = spokenText
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/#{1,3}\s*/g, '')
            .replace(/[-•]\s+/g, '. ')
            .replace(/`[^`]+`/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .substring(0, 1500);

        const utterance = new SpeechSynthesisUtterance(cleanText);
        const voice = getBestVoice();
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
    }, []);

    // Stop speaking
    const stopSpeaking = useCallback(() => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
    }, []);

    // Toggle listening — with sound effects + mic monitor
    const toggleListening = useCallback(() => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            stopMicMonitor();
            playSound('stop');
        } else {
            stopSpeaking();
            setTranscript('');
            setError(null);
            try {
                recognitionRef.current?.start();
                setIsListening(true);
                if (!isOpen) setIsOpen(true);
                playSound('start');
                startMicMonitor();
            } catch (e) {
                setError('Could not start microphone');
                playSound('error');
            }
        }
    }, [isListening, isOpen, stopSpeaking, playSound, startMicMonitor, stopMicMonitor]);

    // Close and reset
    const handleClose = useCallback(() => {
        recognitionRef.current?.stop();
        stopSpeaking();
        stopMicMonitor();
        setIsOpen(false);
        setIsListening(false);
        setTranscript('');
        setResponse('');
        setError(null);
    }, [stopSpeaking, stopMicMonitor]);

    // Keyboard shortcut: V to toggle voice (when not typing in input)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'v' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                toggleListening();
            }
            if (e.key === 'Escape' && isOpen) {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleListening, handleClose, isOpen]);

    if (!isSupported) return null;

    // Floating mic button (when panel is closed)
    if (!isOpen) {
        return (
            <button
                onClick={toggleListening}
                title="Voice Assistant (press V)"
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '210px', // Left of the Dive Deep chat button
                    width: '48px',
                    height: '48px',
                    borderRadius: '16px',
                    background: isListening
                        ? 'linear-gradient(135deg, #ef4444, #f97316)'
                        : 'linear-gradient(135deg, #10b981, #06b6d4)',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    zIndex: 49,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isListening
                        ? '0 8px 32px rgba(239, 68, 68, 0.5), 0 0 0 4px rgba(239, 68, 68, 0.2)'
                        : '0 8px 32px rgba(16, 185, 129, 0.4), 0 2px 8px rgba(0,0,0,0.3)',
                    transition: 'all 0.3s ease',
                    animation: isListening ? 'voicePulse 1.5s ease-in-out infinite' : 'none',
                }}
            >
                {isListening ? <MicOff size={22} /> : <Mic size={22} />}

                <style jsx>{`
                    @keyframes voicePulse {
                        0%, 100% { box-shadow: 0 8px 32px rgba(239, 68, 68, 0.5), 0 0 0 4px rgba(239, 68, 68, 0.2); }
                        50% { box-shadow: 0 8px 32px rgba(239, 68, 68, 0.7), 0 0 0 8px rgba(239, 68, 68, 0.1); }
                    }
                `}</style>
            </button>
        );
    }

    // Full voice panel
    return (
        <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '380px',
            background: 'rgba(15, 15, 20, 0.95)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05)',
            zIndex: 51,
            overflow: 'hidden',
            fontFamily: 'inherit',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, transparent 100%)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                    }}>
                        <Mic size={18} color="white" />
                    </div>
                    <div>
                        <h3 style={{ fontWeight: 600, color: 'white', fontSize: '14px', margin: 0 }}>Voice Assistant</h3>
                        <p style={{ fontSize: '11px', color: '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: isListening ? 'pulse 1s ease-in-out infinite' : 'none' }} />
                            {isListening ? 'Listening...' : isProcessing ? 'Thinking...' : isSpeaking ? 'Speaking...' : 'Press mic or V'}
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={() => setMuteResponse(!muteResponse)}
                        title={muteResponse ? 'Unmute voice response' : 'Mute voice response'}
                        style={{
                            padding: '8px', background: 'transparent', border: 'none',
                            borderRadius: '8px', cursor: 'pointer',
                            color: muteResponse ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        {muteResponse ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <button
                        onClick={handleClose}
                        style={{
                            padding: '8px', background: 'transparent', border: 'none',
                            borderRadius: '8px', cursor: 'pointer',
                            color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Waveform / Status Area */}
            <div style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
            }}>
                {/* Animated Orb */}
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: isListening
                        ? 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, rgba(239,68,68,0.05) 70%)'
                        : isProcessing
                            ? 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(139,92,246,0.05) 70%)'
                            : isSpeaking
                                ? 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(16,185,129,0.05) 70%)'
                                : 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.5s ease',
                    animation: (isListening || isProcessing || isSpeaking) ? 'orbPulse 2s ease-in-out infinite' : 'none',
                    position: 'relative',
                }}>
                    {/* Waveform bars — driven by REAL mic volume when listening */}
                    {(isListening || isSpeaking) && (
                        <div style={{ display: 'flex', gap: '3px', alignItems: 'center', height: '30px' }}>
                            {[0.6, 1.0, 0.8, 1.0, 0.6].map((scale, i) => {
                                // Real mic level when listening, animated when speaking
                                const realHeight = isListening
                                    ? Math.max(6, micLevel * scale * 28)
                                    : undefined;
                                return (
                                    <div key={i} style={{
                                        width: '4px',
                                        borderRadius: '2px',
                                        background: isListening ? '#ef4444' : '#10b981',
                                        height: isListening ? `${realHeight}px` : '8px',
                                        transition: isListening ? 'height 0.05s ease' : 'none',
                                        animationName: !isListening ? 'waveBar' : 'none',
                                        animationDuration: !isListening ? `${0.4 + i * 0.1}s` : '0s',
                                        animationTimingFunction: !isListening ? 'ease-in-out' : undefined,
                                        animationIterationCount: !isListening ? 'infinite' : undefined,
                                        animationDirection: !isListening ? 'alternate' : undefined,
                                        animationDelay: !isListening ? `${i * 0.08}s` : '0s',
                                    }} />
                                );
                            })}
                        </div>
                    )}
                    {isProcessing && (
                        <Sparkles size={28} color="#a78bfa" style={{ animation: 'spin 2s linear infinite' }} />
                    )}
                    {!isListening && !isProcessing && !isSpeaking && (
                        <Mic size={28} color="rgba(255,255,255,0.2)" />
                    )}
                </div>

                {/* Mic Button */}
                <button
                    onClick={toggleListening}
                    disabled={isProcessing}
                    style={{
                        width: '64px', height: '64px', borderRadius: '50%',
                        background: isListening
                            ? 'linear-gradient(135deg, #ef4444, #f97316)'
                            : isProcessing
                                ? 'rgba(139,92,246,0.2)'
                                : 'linear-gradient(135deg, #10b981, #06b6d4)',
                        border: isListening ? '3px solid rgba(239,68,68,0.4)' : '3px solid rgba(255,255,255,0.1)',
                        color: 'white',
                        cursor: isProcessing ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.3s ease',
                        boxShadow: isListening
                            ? '0 0 40px rgba(239, 68, 68, 0.4)'
                            : '0 4px 20px rgba(0,0,0,0.3)',
                    }}
                >
                    {isListening ? <MicOff size={26} /> : <Mic size={26} />}
                </button>

                {/* Live Transcript */}
                {transcript && (
                    <div style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '14px',
                        color: 'rgba(255,255,255,0.8)',
                        textAlign: 'center',
                        lineHeight: '1.5',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {isListening ? '🎤 Hearing...' : 'You said:'}
                        </span>
                        "{transcript}"
                    </div>
                )}

                {/* AI Response */}
                {response && (
                    <div style={{
                        width: '100%',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'linear-gradient(145deg, rgba(16,185,129,0.06), rgba(6,182,212,0.04))',
                        border: '1px solid rgba(16,185,129,0.15)',
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.75)',
                        lineHeight: '1.6',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <span style={{ fontSize: '10px', color: '#34d399', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                            🤖 InGen
                            {isSpeaking && <span style={{ marginLeft: '6px', animation: 'pulse 1s ease-in-out infinite' }}>🔊</span>}
                        </span>
                        {response.split('\n').map((line, i) => {
                            const trimmed = line.trim();
                            if (!trimmed) return <div key={i} style={{ height: '6px' }} />;
                            // Simple bold rendering
                            const formatted = trimmed.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
                            return <div key={i} style={{ marginBottom: '2px' }} dangerouslySetInnerHTML={{ __html: formatted }} />;
                        })}
                    </div>
                )}

                {/* Speaking controls */}
                {isSpeaking && (
                    <button
                        onClick={stopSpeaking}
                        style={{
                            padding: '8px 16px', borderRadius: '8px',
                            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)',
                            color: '#f87171', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                    >
                        <VolumeX size={14} /> Stop Speaking
                    </button>
                )}

                {/* Error — friendly with retry */}
                {error && (
                    <div style={{
                        width: '100%', padding: '12px 16px', borderRadius: '12px',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '13px', color: '#fca5a5', marginBottom: '8px' }}>
                            😅 {error.includes('denied') ? 'Mic access needed' : "Sorry, I didn't catch that"}
                        </div>
                        <button
                            onClick={() => { setError(null); toggleListening(); }}
                            style={{
                                padding: '6px 16px', borderRadius: '8px',
                                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)',
                                color: '#34d399', fontSize: '12px', fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'inherit',
                            }}
                        >
                            🎤 Try again
                        </button>
                    </div>
                )}

                {/* Hint */}
                {!transcript && !response && !isListening && !isProcessing && (
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: '1.6' }}>
                        Click the mic or press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>V</kbd> to ask a question<br />
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>
                            Try: "What are my red goals?" · "How many tickets are open?"
                        </span>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes orbPulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
                @keyframes waveBar {
                    from { height: 6px; }
                    to { height: 28px; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}
