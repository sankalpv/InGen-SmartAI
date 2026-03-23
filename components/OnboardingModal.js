'use client';

import { useState, useEffect } from 'react';
import { Shield, Eye, HardDrive, Trash2, X } from 'lucide-react';

const ONBOARDING_KEY = 'ingen_onboarding_seen';

export default function OnboardingModal() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && !localStorage.getItem(ONBOARDING_KEY)) {
            setShow(true);
        }
    }, []);

    function dismiss() {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setShow(false);
    }

    if (!show) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.3s ease-out',
        }}>
            <div style={{
                background: 'var(--bg-primary, #0a0a14)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '20px', padding: '40px', maxWidth: '560px', width: '90%',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}>
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🛡️</div>
                    <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #fff)' }}>
                        Welcome to InGen
                    </h2>
                    <p style={{ color: 'var(--text-secondary, rgba(255,255,255,0.5))', fontSize: '14px', marginTop: '8px' }}>
                        Your AI-powered engineering manager assistant
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
                    {[
                        {
                            icon: <Eye size={20} />,
                            color: '#3b82f6',
                            title: 'Read-Only Access',
                            desc: 'InGen reads your Outlook emails and calendar to provide insights. It never modifies, deletes, or sends anything on your behalf.',
                        },
                        {
                            icon: <HardDrive size={20} />,
                            color: '#8b5cf6',
                            title: 'Local-Only Storage',
                            desc: 'All data stays on your laptop. Nothing is uploaded to any cloud service. No data is shared between users.',
                        },
                        {
                            icon: <Shield size={20} />,
                            color: '#22c55e',
                            title: 'No Cloud Sync',
                            desc: 'InGen runs entirely on localhost. AI queries go to Bedrock (AWS) for inference, but your raw email content is never sent — only context snippets.',
                        },
                        {
                            icon: <Trash2 size={20} />,
                            color: '#f59e0b',
                            title: 'Full Control',
                            desc: 'Clear all cached data anytime from Settings. If you uninstall InGen, all local data is deleted with it.',
                        },
                    ].map((item, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: '14px', alignItems: 'flex-start',
                            padding: '12px 16px', borderRadius: '12px',
                            background: `${item.color}08`, border: `1px solid ${item.color}20`,
                        }}>
                            <div style={{ color: item.color, flexShrink: 0, marginTop: '2px' }}>{item.icon}</div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px', color: 'var(--text-primary, #fff)' }}>{item.title}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-secondary, rgba(255,255,255,0.5))', lineHeight: 1.5 }}>{item.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={dismiss} style={{
                    width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff',
                    fontSize: '16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                    Got it — Let&apos;s go! 🚀
                </button>

                <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-tertiary, rgba(255,255,255,0.25))', marginTop: '12px' }}>
                    You can review privacy details anytime in Settings → Privacy &amp; Security
                </p>
            </div>

            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>
    );
}
