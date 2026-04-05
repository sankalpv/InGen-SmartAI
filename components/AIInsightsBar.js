import React, { useEffect, useState } from 'react';
import { Cpu, Zap, Activity } from 'lucide-react';

const AIInsightsBar = ({ insights }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const activeInsights = Array.isArray(insights) ? insights : [];

  useEffect(() => {
    if (activeInsights.length > 1) {
      const interval = setInterval(() => {
        setCurrentIdx((idx) => (idx + 1) % activeInsights.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeInsights.length]);

  if (activeInsights.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full hud-card rounded-none border-t border-white/10 p-4 z-50 animate-in fade-in slide-in-from-bottom duration-700">
      <div className="max-w-7xl mx-auto flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-md">
          <Cpu size={16} className="text-blue-400 status-pulse-green" />
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">
            InGen AI Engine
          </span>
        </div>

        <div className="flex-1 overflow-hidden relative h-6">
          <div
            className="flex flex-col transition-transform duration-700 ease-in-out"
            style={{ transform: `translateY(-${currentIdx * 24}px)` }}
          >
            {activeInsights.map((insight, idx) => (
              <div key={idx} className="flex items-center gap-2 h-6">
                <Activity size={14} className="text-gray-500" />
                <p className="text-xs font-medium text-gray-300 truncate tracking-tight uppercase">
                  {insight}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <div className="w-1 h-1 rounded-full bg-blue-400 status-pulse-green" />
          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
            Real-time Telemetry Active
          </span>
        </div>
      </div>
    </div>
  );
};

export default AIInsightsBar;
