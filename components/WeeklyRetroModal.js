'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, Mail, Clock, Zap, Sparkles, AlertTriangle } from 'lucide-react';

export default function WeeklyRetroModal({ isOpen, onClose }) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen && !data) {
            fetchRetro();
        }
    }, [isOpen]);

    const fetchRetro = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/weekly-retro');
            if (!res.ok) throw new Error('Failed to fetch retro');
            const result = await res.json();
            setData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#1e1e24] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                            <Zap className="text-white" size={24} />
                        </div>
                        <h2 className="text-xl font-bold text-white">Weekly Retrospective</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 space-y-4">
                            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                            <p className="text-gray-400 font-medium animate-pulse">Analyzing your week...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center text-red-400 p-8 bg-red-500/10 rounded-xl border border-red-500/20">
                            <AlertTriangle className="mx-auto mb-3" size={32} />
                            <p className="font-medium">{error}</p>
                            <button onClick={fetchRetro} className="mt-4 px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium">Try Again</button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <StatCard icon={<Calendar size={20} />} label="Meetings" value={data.stats.meetingCount} sub={`${data.stats.meetingHours.toFixed(1)} hrs`} color="text-purple-400" bg="bg-purple-500/10" border="border-purple-500/20" />
                                <StatCard icon={<Mail size={20} />} label="Sent" value={data.stats.emailSentCount} color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20" />
                                <StatCard icon={<Mail size={20} />} label="Received" value={data.stats.emailReceivedCount} color="text-green-400" bg="bg-green-500/10" border="border-green-500/20" />
                                <StatCard icon={<Clock size={20} />} label="Focus Score" value="--" sub="Coming Soon" color="text-orange-400" bg="bg-orange-500/10" border="border-orange-500/20" />
                            </div>

                            {/* AI Analysis */}
                            <div className="bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-2xl overflow-hidden">
                                <div className="p-6 border-b border-white/5 bg-white/5">
                                    <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                        <Sparkles className="text-yellow-400" size={18} />
                                        AI Productivity Insights
                                    </h3>
                                </div>
                                <div className="p-6 space-y-6">
                                    {parseRetroMarkdown(data.retro)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, sub, color, bg, border }) {
    return (
        <div className={`p-5 rounded-xl border ${border} ${bg} flex flex-col items-center text-center transition-transform hover:scale-[1.02]`}>
            <div className={`mb-3 ${color} p-2 bg-white/5 rounded-lg`}>{icon}</div>
            <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wider mt-1">{label}</div>
            {sub && <div className="text-xs text-gray-500 mt-1 font-mono">{sub}</div>}
        </div>
    );
}

function parseRetroMarkdown(text) {
    if (!text) return null;

    // Split by headers (e.g. **Title:**)
    const sections = text.split(/\*\*(.*?):\*\*/).filter(Boolean);
    const elements = [];

    for (let i = 0; i < sections.length; i += 2) {
        const title = sections[i]?.trim();
        const content = sections[i + 1]?.trim();

        if (title && content) {
            elements.push(
                <div key={i} className="animate-in slide-in-from-bottom-2" style={{ animationDelay: `${i * 50}ms` }}>
                    <h4 className="text-sm font-bold text-purple-300 mb-2 uppercase tracking-wide">{title}</h4>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                        {content.replace(/^[#*-]\s/gm, '• ')} {/* Replace bullets */}
                    </div>
                </div>
            );
        } else if (!content && title) {
            // Handle case where split might behave differently or plain text start
            elements.push(<p key={i} className="text-gray-300 text-sm">{title}</p>);
        }
    }

    return elements.length > 0 ? elements : <p className="text-gray-300 whitespace-pre-line">{text}</p>;
}
