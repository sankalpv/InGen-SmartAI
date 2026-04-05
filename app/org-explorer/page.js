'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, Loader2, Users } from 'lucide-react';

export default function OrgExplorerPage() {
  const [viewAsInput, setViewAsInput] = useState('');
  const [viewAsAlias, setViewAsAlias] = useState(null);

  // Core data states
  const [viewAsOrg, setViewAsOrg] = useState(null); // { rootAlias, rootName, totalEngineers, l7Managers, managerMap }
  const [viewAsDashboard, setViewAsDashboard] = useState(null); // The actual metric data backfilled

  // Loading/Network States
  const [viewAsLoading, setViewAsLoading] = useState(false);
  const [viewAsError, setViewAsError] = useState(null);
  const [viewAsBackfilling, setViewAsBackfilling] = useState(false);

  // UI states
  const [collapsedL7, setCollapsedL7] = useState(new Set());

  // Format helpers
  const currentYear = new Date().getFullYear();

  const handleViewAsSubmit = async (e) => {
    if (e) e.preventDefault();
    const targetAlias = viewAsInput.trim().toLowerCase();
    if (!targetAlias) return;

    setViewAsLoading(true);
    setViewAsError(null);
    setViewAsOrg(null);
    setViewAsDashboard(null);

    try {
      // First pass: Resolve the L7->L6->IC tree specifically mapping SDE/SDMs
      const orgRes = await fetch(`/api/org-explorer?view=resolve-org&alias=${targetAlias}`);
      if (!orgRes.ok) throw new Error('Failed to resolve org tree from builder-mcp');

      const orgData = await orgRes.json();
      if (orgData.error || orgData.data?.error)
        throw new Error(orgData.error || orgData.data.error);

      const tree = orgData.data;
      if (!tree || !tree.l7Managers || tree.l7Managers.length === 0) {
        throw new Error(`No Software Engineers or SDMs found under "${targetAlias}"`);
      }

      setViewAsOrg(tree);
      setViewAsAlias(tree.rootAlias);

      // Second pass: Send the flat list of aliases to quickly cache/load the current week dashboard
      const payload = {
        flatAliases: tree.flatAliases,
        managerMap: tree.managerMap,
      };
      const dashRes = await fetch('/api/org-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: 'dashboard', payload: { ...payload, history: true } }),
      });
      if (!dashRes.ok) throw new Error('Failed to fetch org dashboard cache');
      const dashData = await dashRes.json();

      setViewAsDashboard(dashData.data);

      // Check if we need to auto-trigger a foreground refresh for this week's data
      // (If the DB mapped exactly 0 rows or matched 0 metrics for current week)
      if (
        dashData.data &&
        (dashData.data.engineers.length === 0 ||
          (dashData.data.totalCrsCreated === 0 && dashData.data.totalCrsReviewed === 0))
      ) {
        // Foreground refresh awaits the database write
        const refreshRes = await fetch('/api/org-explorer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ view: 'refresh', payload }),
        });

        if (refreshRes.ok) {
          // Refetch dashboard cleanly from the now-warmed cache
          const reDashRes = await fetch('/api/org-explorer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ view: 'dashboard', payload: { ...payload, history: true } }),
          });
          const reDashData = await reDashRes.json();
          if (reDashData.data) {
            setViewAsDashboard(reDashData.data);
          }
        }
      }
    } catch (error) {
      setViewAsError(error.message);
    } finally {
      setViewAsLoading(false);
    }
  };

  const handleViewAsBackfill = async () => {
    if (!viewAsOrg) return;
    setViewAsBackfilling(true);
    try {
      const payload = {
        flatAliases: viewAsOrg.flatAliases,
        managerMap: viewAsOrg.managerMap,
        year: currentYear,
      };
      const res = await fetch('/api/org-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view: 'backfill', payload }),
      });
      if (!res.ok) throw new Error('Failed to start backfill');

      // Poll for completion
      const interval = setInterval(async () => {
        const statRes = await fetch('/api/org-explorer?view=backfill-status');
        const stat = await statRes.json();
        if (!stat.data?.running) {
          clearInterval(interval);
          setViewAsBackfilling(false);
        }
      }, 5000);
    } catch (e) {
      setViewAsError(e.message);
      setViewAsBackfilling(false);
    }
  };

  const toggleL7 = (alias) => {
    setCollapsedL7((prev) => {
      const next = new Set(prev);
      if (next.has(alias)) next.delete(alias);
      else next.add(alias);
      return next;
    });
  };

  // Helper to map DB row to an IC object
  const getEngineerMetrics = (alias) => {
    if (!viewAsDashboard || !viewAsDashboard.engineers) return null;
    return viewAsDashboard.engineers.find((e) => e.alias === alias);
  };

  const aggregateHistory = (aliases) => {
    const weeklySums = {};
    aliases.forEach((a) => {
      const m = getEngineerMetrics(a);
      if (m && m.history) {
        m.history.forEach((h) => {
          if (!weeklySums[h.weekId]) {
            weeklySums[h.weekId] = { weekId: h.weekId, crsCreated: 0, crsReviewed: 0 };
          }
          weeklySums[h.weekId].crsCreated += h.crsCreated || 0;
          weeklySums[h.weekId].crsReviewed += h.crsReviewed || 0;
        });
      }
    });
    return Object.values(weeklySums).sort((a, b) => a.weekId.localeCompare(b.weekId));
  };

  // Derived variables
  const isReady = viewAsOrg && viewAsDashboard;
  let globalCrCreated = 0;
  let globalCrReviewed = 0;

  if (isReady) {
    globalCrCreated = viewAsDashboard.engineers.reduce((s, e) => s + (e.crsCreated || 0), 0);
    globalCrReviewed = viewAsDashboard.engineers.reduce((s, e) => s + (e.crsReviewed || 0), 0);
  }

  return (
    <div
      style={{
        padding: '30px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: '28px',
          fontWeight: 800,
          margin: '0 0 8px 0',
          color: '#fff',
          letterSpacing: '-0.5px',
        }}
      >
        Org Explorer
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px', margin: '0 0 24px 0' }}>
        View architectural codebase metrics across deeply-nested engineering hierarchies. Data is
        fully isolated.
      </p>

      {/* Input Bar */}
      <div
        style={{
          background: 'rgba(22,22,30,0.6)',
          border: '1px solid rgba(255,255,255,0.06)',
          padding: '24px',
          borderRadius: '16px',
          marginBottom: '32px',
        }}
      >
        <form onSubmit={handleViewAsSubmit} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Users
              size={16}
              style={{
                position: 'absolute',
                left: '16px',
                top: '16px',
                color: 'rgba(255,255,255,0.3)',
              }}
            />
            <input
              type="text"
              value={viewAsInput}
              onChange={(e) => setViewAsInput(e.target.value)}
              placeholder="Enter VP, Director, or SDM alias (e.g. onalan) to explore their organization..."
              style={{
                width: '100%',
                padding: '14px 16px 14px 44px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '14px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(10,132,255,0.5)')}
              onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>
          <button
            type="submit"
            disabled={viewAsLoading || !viewAsInput.trim()}
            style={{
              background: viewAsInput.trim() ? '#0a84ff' : 'rgba(255,255,255,0.1)',
              color: viewAsInput.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
              border: 'none',
              borderRadius: '10px',
              padding: '0 24px',
              cursor: viewAsInput.trim() ? 'pointer' : 'not-allowed',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {viewAsLoading ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Search size={16} />
            )}
            {viewAsLoading ? 'Resolving Org...' : 'Explore Org'}
          </button>
        </form>
      </div>

      {viewAsError && (
        <div
          style={{
            background: 'rgba(255,69,58,0.1)',
            border: '1px solid rgba(255,69,58,0.2)',
            color: '#ff453a',
            padding: '16px',
            borderRadius: '12px',
            fontSize: '13px',
            marginBottom: '24px',
          }}
        >
          <strong>Exploration Failed:</strong> {viewAsError}
        </div>
      )}

      {/* Main Org Content */}
      {isReady && (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {/* Header Strip */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px',
              paddingBottom: '20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <h2
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '24px',
                  color: '#fff',
                  letterSpacing: '-0.3px',
                }}
              >
                Org: {viewAsOrg.rootName}
              </h2>
              <div
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span>
                  <strong>{viewAsOrg.totalEngineers}</strong> software engineers found
                </span>
                <span>•</span>
                <span>{viewAsOrg.l7Managers.length} director divisions</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Current Week Volume
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#30d158' }}>
                  {globalCrCreated} 📝 / {globalCrReviewed} 👀
                </div>
              </div>

              <button
                onClick={handleViewAsBackfill}
                disabled={viewAsBackfilling}
                style={{
                  background: 'rgba(10,132,255,0.1)',
                  border: '1px solid rgba(10,132,255,0.2)',
                  color: '#60a5fa',
                  borderRadius: '8px',
                  padding: '0 16px',
                  cursor: viewAsBackfilling ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: viewAsBackfilling ? 0.6 : 1,
                }}
              >
                {viewAsBackfilling ? (
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Search size={13} />
                )}
                {viewAsBackfilling ? 'Backfilling...' : `Deep Backfill ${currentYear}`}
              </button>
            </div>
          </div>

          {/* Manager Buckets */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {viewAsOrg.l7Managers.map((l7) => {
              const isCollapsed = collapsedL7.has(l7.alias);

              // Roll up L7 stats
              const allL7Eng = Object.keys(viewAsOrg.managerMap).filter(
                (k) => viewAsOrg.managerMap[k].l7Alias === l7.alias
              );
              let l7CrC = 0,
                l7CrR = 0;
              allL7Eng.forEach((a) => {
                const m = getEngineerMetrics(a);
                if (m) {
                  l7CrC += m.crsCreated || 0;
                  l7CrR += m.crsReviewed || 0;
                }
              });

              return (
                <div
                  key={l7.alias}
                  style={{
                    background: 'rgba(22,22,30,0.4)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  {/* L7 Header */}
                  <div
                    onClick={() => toggleL7(l7.alias)}
                    style={{
                      background: 'rgba(30,30,42,0.8)',
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      borderBottom: isCollapsed ? 'none' : '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {isCollapsed ? (
                        <ChevronDown size={18} color="rgba(255,255,255,0.3)" />
                      ) : (
                        <ChevronUp size={18} color="rgba(255,255,255,0.3)" />
                      )}
                      <div>
                        <div
                          style={{
                            fontSize: '15px',
                            fontWeight: 600,
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          {l7.name}{' '}
                          <span
                            style={{
                              fontSize: '11px',
                              color: 'rgba(255,255,255,0.3)',
                              fontWeight: 400,
                            }}
                          >
                            ({l7.alias})
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'rgba(255,255,255,0.35)',
                            marginTop: '2px',
                          }}
                        >
                          {l7.jobTitle}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {allL7Eng.length} Engineers
                      </div>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#30d158',
                          background: 'rgba(48,209,88,0.1)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                        }}
                      >
                        {l7CrC} CRs / {l7CrR} Rvws
                      </div>
                    </div>
                  </div>

                  {/* L7 Content (L6 Managers & Direct ICs) */}
                  {!isCollapsed && (
                    <div style={{ padding: '20px 20px 20px 42px' }}>
                      {/* L7 Trend Chart */}
                      {(() => {
                        const hData = aggregateHistory(allL7Eng);
                        return (
                          <div
                            style={{
                              marginBottom: '30px',
                              padding: '16px',
                              background: 'rgba(0,0,0,0.2)',
                              borderRadius: '12px',
                              border: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.7)',
                                marginBottom: '16px',
                              }}
                            >
                              12-Week Velocity / Division Trend
                            </div>
                            {hData.length > 1 ? (
                              <DualAxisSparkline data={hData} height={140} />
                            ) : (
                              <div
                                style={{
                                  height: '140px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'rgba(255,255,255,0.2)',
                                  border: '1px dashed rgba(255,255,255,0.1)',
                                  borderRadius: '8px',
                                  fontSize: '13px',
                                }}
                              >
                                Insufficient history. Click "Deep Backfill" to unlock trend charts.
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {l7.l6Managers.map((l6) => {
                        // Roll up L6 stats
                        let l6CrC = 0,
                          l6CrR = 0;
                        l6.engineers.forEach((ic) => {
                          const m = getEngineerMetrics(ic.alias);
                          if (m) {
                            l6CrC += m.crsCreated || 0;
                            l6CrR += m.crsReviewed || 0;
                          }
                        });

                        return (
                          <div key={l6.alias} style={{ marginTop: '20px' }}>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#0a84ff',
                                display: 'flex',
                                alignItems: 'flex-end',
                                justifyContent: 'space-between',
                                borderBottom: '1px solid rgba(10,132,255,0.15)',
                                paddingBottom: '6px',
                                marginBottom: '16px',
                              }}
                            >
                              <span>
                                {l6.name} ({l6.alias}) — {l6.jobTitle}
                              </span>
                              <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 500 }}>
                                {l6CrC} CRs / {l6CrR} Rvws · {l6.engineers.length} Eng
                              </span>
                            </div>

                            {(() => {
                              const l6Hist = aggregateHistory(l6.engineers.map((e) => e.alias));
                              return (
                                <div style={{ marginBottom: '16px' }}>
                                  {l6Hist.length > 1 ? (
                                    <DualAxisSparkline
                                      data={l6Hist}
                                      width="100%"
                                      height={90}
                                      simplified={true}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        height: '90px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'rgba(255,255,255,0.15)',
                                        border: '1px dashed rgba(255,255,255,0.05)',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                      }}
                                    >
                                      No trend available. Backfill required.
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                gap: '8px',
                              }}
                            >
                              {l6.engineers.map((ic) => {
                                const m = getEngineerMetrics(ic.alias);
                                return (
                                  <div
                                    key={ic.alias}
                                    style={{
                                      background: 'rgba(0,0,0,0.2)',
                                      border: '1px solid rgba(255,255,255,0.02)',
                                      padding: '10px 14px',
                                      borderRadius: '8px',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <div
                                      style={{ fontSize: '13px', color: '#fff', fontWeight: 500 }}
                                    >
                                      {ic.name}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '12px',
                                        color: 'rgba(255,255,255,0.5)',
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {(m?.crsCreated || 0).toString().padStart(2, ' ')} :{' '}
                                      {(m?.crsReviewed || 0).toString().padStart(2, ' ')}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {l7.directICs && l7.directICs.length > 0 && (
                        <div style={{ marginTop: '20px' }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: 'rgba(255,255,255,0.5)',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              paddingBottom: '6px',
                              marginBottom: '8px',
                            }}
                          >
                            Directly Reporting Engineers
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                              gap: '8px',
                            }}
                          >
                            {l7.directICs.map((ic) => {
                              const m = getEngineerMetrics(ic.alias);
                              return (
                                <div
                                  key={ic.alias}
                                  style={{
                                    background: 'rgba(0,0,0,0.2)',
                                    border: '1px solid rgba(255,255,255,0.02)',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                  }}
                                >
                                  <div style={{ fontSize: '13px', color: '#fff', fontWeight: 500 }}>
                                    {ic.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      color: 'rgba(255,255,255,0.5)',
                                      fontFamily: 'monospace',
                                    }}
                                  >
                                    {(m?.crsCreated || 0).toString().padStart(2, ' ')} :{' '}
                                    {(m?.crsReviewed || 0).toString().padStart(2, ' ')}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DualAxisSparkline({ data, height = 120, simplified = false }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const [uid] = useState(() => Math.random().toString(36).slice(2));

  if (!data || data.length < 2) return null;

  const w = 600;
  const h = height;
  const padding = { top: 20, right: 10, bottom: 20, left: 10 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => Math.max(d.crsCreated, d.crsReviewed)), 1);

  // Smooth bezier curve generator
  const generatePath = (points) => {
    if (points.length === 0) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const cp1x = points[i].x + (points[i + 1].x - points[i].x) / 2;
      const cp1y = points[i].y;
      const cp2x = points[i].x + (points[i + 1].x - points[i].x) / 2;
      const cp2y = points[i + 1].y;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return d;
  };

  const pointsCreated = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - (d.crsCreated / maxVal) * chartH,
    val: d.crsCreated,
    date: d.weekId,
  }));

  const pointsReviewed = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - (d.crsReviewed / maxVal) * chartH,
    val: d.crsReviewed,
    date: d.weekId,
  }));

  const pathCreated = generatePath(pointsCreated);
  const pathReviewed = generatePath(pointsReviewed);

  const areaCreated = `${pathCreated} L ${pointsCreated[pointsCreated.length - 1].x},${padding.top + chartH} L ${pointsCreated[0].x},${padding.top + chartH} Z`;
  const areaReviewed = `${pathReviewed} L ${pointsReviewed[pointsReviewed.length - 1].x},${padding.top + chartH} L ${pointsReviewed[0].x},${padding.top + chartH} Z`;

  const idCreated = `grad-c-${uid}`;
  const idReviewed = `grad-r-${uid}`;
  const idGlow = `glow-${uid}`;

  return (
    <div
      style={{ position: 'relative', width: '100%', height: `${h}px` }}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={idCreated} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a84ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0a84ff" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id={idReviewed} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.0" />
          </linearGradient>
          <filter id={idGlow} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {data.map((_, i) => {
          const x = padding.left + (i / (data.length - 1)) * chartW;
          return (
            <line
              key={i}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={h - padding.bottom}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="1"
            />
          );
        })}

        <path
          d={areaCreated}
          fill={`url(#${idCreated})`}
          stroke="none"
          style={{ transition: 'all 0.3s' }}
        />
        <path
          d={areaReviewed}
          fill={`url(#${idReviewed})`}
          stroke="none"
          style={{ transition: 'all 0.3s' }}
        />

        <path
          d={pathCreated}
          fill="none"
          stroke="#0a84ff"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#${idGlow})`}
        />
        <path
          d={pathReviewed}
          fill="none"
          stroke="#ec4899"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#${idGlow})`}
        />

        {data.map((_, i) => {
          const x = padding.left + (i / (data.length - 1)) * chartW;
          return (
            <rect
              key={i}
              x={x - chartW / (data.length - 1) / 2}
              y={0}
              width={chartW / (data.length - 1)}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              style={{ cursor: 'crosshair', outline: 'none' }}
            />
          );
        })}

        {hoverIdx !== null && (
          <g style={{ transition: 'all 0.1s ease-out', pointerEvents: 'none' }}>
            <line
              x1={pointsCreated[hoverIdx].x}
              y1={padding.top}
              x2={pointsCreated[hoverIdx].x}
              y2={h - padding.bottom}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={pointsCreated[hoverIdx].x}
              cy={pointsCreated[hoverIdx].y}
              r="4.5"
              fill="#0a84ff"
              stroke="#fff"
              strokeWidth="2"
            />
            <circle
              cx={pointsReviewed[hoverIdx].x}
              cy={pointsReviewed[hoverIdx].y}
              r="4.5"
              fill="#ec4899"
              stroke="#fff"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {hoverIdx !== null && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${(hoverIdx / (data.length - 1)) * 100}%`,
            transform: 'translateX(-50%) translateY(-100%)',
            background: 'rgba(20,20,30,0.85)',
            border: '1px solid rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            padding: '8px 12px',
            borderRadius: '8px',
            pointerEvents: 'none',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
            zIndex: 10,
            transition: 'left 0.1s ease-out',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.6)',
              marginBottom: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {pointsCreated[hoverIdx].date}
          </div>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', fontWeight: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div
                style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0a84ff' }}
              />{' '}
              {pointsCreated[hoverIdx].val} CRs
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div
                style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ec4899' }}
              />{' '}
              {pointsReviewed[hoverIdx].val} Rvws
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = `
@keyframes spin { 100% { transform: rotate(360deg); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
`;
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
