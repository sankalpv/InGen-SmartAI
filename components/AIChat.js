'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Sparkles, Trash2 } from 'lucide-react';

export default function AIChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hi! I\'m your Dive Deep Assistant. Ask me anything about your emails, meetings, or schedule.' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    const handleClear = () => {
        setMessages([{ role: 'assistant', content: 'Chat cleared. deep dive ready.' }]);
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Add placeholder assistant message for streaming
        const assistantIdx = messages.length + 1; // +1 for the user message we just added
        setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [], streaming: true }]);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    history: messages.map(m => ({ role: m.role, content: m.content })),
                    stream: true
                }),
            });

            if (!response.ok) throw new Error('Network response was not ok');

            // Read SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let sources = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.type === 'sources') {
                            sources = data.sources || [];
                        } else if (data.type === 'chunk') {
                            fullText += data.text;
                            // Update the streaming message in place
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (updated[lastIdx]?.streaming) {
                                    updated[lastIdx] = { ...updated[lastIdx], content: fullText, sources };
                                }
                                return updated;
                            });
                        } else if (data.type === 'done') {
                            // Mark streaming as complete
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                if (updated[lastIdx]?.streaming) {
                                    updated[lastIdx] = { ...updated[lastIdx], content: fullText, sources, streaming: false };
                                }
                                return updated;
                            });
                        } else if (data.type === 'error') {
                            setMessages(prev => {
                                const updated = [...prev];
                                const lastIdx = updated.length - 1;
                                updated[lastIdx] = { role: 'assistant', content: `Error: ${data.message}`, streaming: false };
                                return updated;
                            });
                        }
                    } catch (parseErr) {
                        // Skip malformed SSE lines
                    }
                }
            }
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.streaming) {
                    updated[lastIdx] = { role: 'assistant', content: "Sorry, I encountered an error. Please try again.", streaming: false };
                } else {
                    updated.push({ role: 'assistant', content: "Sorry, I encountered an error. Please try again." });
                }
                return updated;
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 p-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full shadow-lg transition-all transform hover:scale-105 z-50 flex items-center gap-2 group"
            >
                <Sparkles size={24} className="group-hover:animate-spin-slow" />
                <span className="font-semibold">Dive Deep</span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-gray-900/90 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden font-sans ring-1 ring-white/10">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-800/80 to-gray-900/80 border-b border-gray-700/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                        <Bot size={20} className="text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white tracking-wide">Dive Deep Assistant</h3>
                        <p className="text-xs text-blue-300 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                            Online & synced
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleClear}
                        title="Clear History"
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-red-400"
                    >
                        <Trash2 size={18} />
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-[85%] rounded-2xl p-3.5 text-sm shadow-sm ${msg.role === 'user'
                                ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-br-none'
                                : 'bg-gray-800/80 border border-gray-700/50 text-gray-100 rounded-bl-none backdrop-blur-sm'
                                }`}
                        >
                            <p className="whitespace-pre-wrap leading-relaxed">
                                {msg.content}
                                {msg.streaming && <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 rounded-sm" />}
                            </p>

                            {/* Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-white/10">
                                    <p className="text-[10px] font-bold text-blue-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                        <Sparkles size={10} /> Sources
                                    </p>
                                    <div className="space-y-1.5">
                                        {msg.sources.slice(0, 3).map((source, i) => (
                                            <div key={i} className="text-xs text-gray-300 truncate bg-black/20 p-1.5 rounded hover:bg-black/30 transition-colors border border-white/5 flex items-center gap-2">
                                                <div className="w-1 h-full bg-blue-500 rounded-full"></div>
                                                <span className="font-medium text-blue-400">{source.from ? source.from.split(' ')[0] : 'Unknown'}:</span>
                                                <span className="opacity-90">{source.subject}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && !messages[messages.length - 1]?.streaming && (
                    <div className="flex justify-start">
                        <div className="bg-gray-800/80 rounded-2xl rounded-bl-none p-4 border border-gray-700/50">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="p-4 bg-gray-900/95 border-t border-gray-800 backdrop-blur-xl">
                <div className="relative group">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Dive deep into your data..."
                        className="w-full bg-gray-800/50 text-white rounded-xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 border border-gray-700/50 placeholder-gray-500 transition-all group-hover:bg-gray-800"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-blue-500/20"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </form>
        </div>
    );
}
