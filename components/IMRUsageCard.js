import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const IMRUsageCard = ({ data }) => {
  const [pulse, setPulse] = useState(false);
  const metrics = data?.dataPoints?.[0]?.metrics || {};
  const variancePercent = data?.dataPoints?.[0]?.value || 0;
  const status = metrics.status || 'GREEN';

  useEffect(() => {
    if (status === 'RED') {
      const interval = setInterval(() => setPulse((p) => !p), 1000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const getStatusColor = () => {
    if (variancePercent > 5) return 'var(--hud-accent-amber)';
    if (variancePercent < 0) return 'var(--hud-accent-green)';
    return 'var(--hud-accent-blue)';
  };

  const statusColor = getStatusColor();

  return (
    <div
      className={`hud-card p-6 h-full flex flex-col justify-between ${status === 'RED' ? 'status-pulse-red' : ''}`}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
            Infrastructure Telemetry
          </h3>
          <h2 className="text-xl font-extrabold hud-text-glow text-white">IMR Budget Health</h2>
        </div>
        <div className="p-2 rounded-lg bg-black/40 border border-white/5">
          {variancePercent > 0 ? (
            <TrendingUp size={20} color={statusColor} />
          ) : (
            <TrendingDown size={20} color={statusColor} />
          )}
        </div>
      </div>

      <div className="my-6">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black hud-number-odometer text-white">
            {variancePercent > 0 ? '+' : ''}
            {variancePercent.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500 uppercase tracking-tighter">
            Variance vs. Goal
          </span>
        </div>

        <div className="w-full h-1.5 bg-white/10 rounded-full mt-4 overflow-hidden relative">
          <div
            className="h-full transition-all duration-1000 ease-out"
            style={{
              width: `${Math.min(100, Math.max(0, 100 - variancePercent))}%`,
              background: `linear-gradient(90deg, ${statusColor}, var(--hud-bg))`,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
        <div>
          <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Actual Spend</p>
          <p className="text-sm font-mono text-white">
            {metrics.actualSpend ? `$${(metrics.actualSpend / 1000).toFixed(1)}k` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Fleet Scenario</p>
          <p className="text-sm text-gray-300 truncate" title={metrics.scenario}>
            2026 FCP2 V2
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-md bg-white/5 border border-white/5 text-[10px]">
        {status === 'GREEN' ? (
          <CheckCircle size={12} className="text-emerald-400" />
        ) : (
          <AlertTriangle size={12} className="text-amber-400" />
        )}
        <span className="text-gray-400 uppercase tracking-widest font-medium">
          {status === 'GREEN' ? 'Cost Aligned' : 'Review Optimization Needed'}
        </span>
      </div>
    </div>
  );
};

export default IMRUsageCard;
