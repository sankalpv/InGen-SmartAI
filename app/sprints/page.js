'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, List, RefreshCw, Layers, Search, ChevronDown, Check } from 'lucide-react';
import AIChat from '@/components/AIChat';
import GoalSprintTable from '@/components/GoalSprintTable';

export default function SprintBoardPage() {
    const [goals, setGoals] = useState([]);
    const [selectedGoalId, setSelectedGoalId] = useState('');
    const [subtasks, setSubtasks] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    
    const [isLoadingGoals, setIsLoadingGoals] = useState(true);
    const [isLoadingSprint, setIsLoadingSprint] = useState(false);
    const [error, setError] = useState(null);

    const fetchGoals = useCallback(async () => {
        setIsLoadingGoals(true);
        setError(null);
        try {
            const res = await fetch('/api/team?view=wbr');
            if (!res.ok) throw new Error('Failed to fetch goals');
            
            const data = await res.json();
            const report = data.data;
            
            const allGoals = [];
            if (report && report.sections) {
                report.sections.forEach(sec => {
                    if (sec.goals) {
                        sec.goals.forEach(g => {
                            if (!allGoals.find(x => x.id === g.id)) {
                                allGoals.push(g);
                            }
                        });
                    }
                });
            }
            
            setGoals(allGoals);
            if (allGoals.length > 0 && !selectedGoalId) {
                setSelectedGoalId(allGoals[0].id);
            }
        } catch (e) {
            setError(e.message);
        }
        setIsLoadingGoals(false);
    }, [selectedGoalId]);

    useEffect(() => {
        fetchGoals();
    }, [fetchGoals]);

    const fetchSprintData = useCallback(async (goalId) => {
        if (!goalId) return;
        setIsLoadingSprint(true);
        setSubtasks([]);
        try {
            const res = await fetch(`/api/team?view=subtasks&alias=${goalId}`);
            if (!res.ok) throw new Error('Failed to fetch sprint tasks');
            const data = await res.json();
            setSubtasks(data.data?.subtasks || []);
        } catch (e) {
            console.error(e);
            setSubtasks([]);
        }
        setIsLoadingSprint(false);
    }, []);

    useEffect(() => {
        if (selectedGoalId) {
            fetchSprintData(selectedGoalId);
        }
    }, [selectedGoalId, fetchSprintData]);

    const activeGoal = goals.find(g => g.id === selectedGoalId);

    return (
        <div className="dark-inline-page" style={{ maxWidth: '1200px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <Layers size={26} color="#30d158" /> Sprint Boards
                    </h1>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        View detailed Taskei sprint plans for any team goal.
                    </div>
                </div>
                <button onClick={fetchGoals} disabled={isLoadingGoals} style={{
                    background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: '#fff', border: 'none',
                    borderRadius: '12px', padding: '10px 20px', fontSize: '13px', fontWeight: 600,
                    cursor: isLoadingGoals ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isLoadingGoals ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                    <RefreshCw size={14} className={isLoadingGoals ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div style={{ background: 'rgba(255,69,58,0.08)', border: '1px solid rgba(255,69,58,0.2)', borderRadius: '12px', padding: '16px', color: '#ff453a', marginBottom: '20px' }}>
                    Failed to load goals: {error}
                </div>
            )}

            {/* Main Content Area */}
            {!isLoadingGoals && !error && goals.length === 0 && (
                <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(22,22,30,0.6)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No Goals Found</h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>Configure your goals in settings to see sprint planning data.</p>
                </div>
            )}

            {!isLoadingGoals && !error && goals.length > 0 && (
                <div>
                    {/* Searchable Goal Selector */}
                    <div style={{ 
                        background: 'rgba(22,22,30,0.6)', padding: '16px 20px', borderRadius: '16px', 
                        border: '1px solid rgba(255,255,255,0.06)', marginBottom: '24px',
                        display: 'flex', alignItems: 'center', gap: '16px' 
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                            <Target size={16} color="#a78bfa" /> Select Goal
                        </div>
                        
                        <div style={{ flex: 1, position: 'relative' }}>
                            <div 
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                style={{
                                    padding: '10px 14px', borderRadius: '8px',
                                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#fff', fontSize: '14px', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                                    {activeGoal && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: activeGoal.statusColor === 'Green' ? '#30d158' : activeGoal.statusColor === 'Red' ? '#ff453a' : '#ff9f0a', flexShrink: 0 }} />}
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {activeGoal ? `${activeGoal.id} — ${activeGoal.title}` : 'Select a goal...'}
                                    </span>
                                </div>
                                <ChevronDown size={16} style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }} />
                            </div>

                            {isDropdownOpen && (
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                                    background: '#1c1c24', border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                                    zIndex: 100, overflow: 'hidden', padding: '8px'
                                }}>
                                    <div style={{ 
                                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
                                        background: 'rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '8px'
                                    }}>
                                        <Search size={14} style={{ opacity: 0.4 }} />
                                        <input 
                                            autoFocus
                                            placeholder="Search goals..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ 
                                                background: 'none', border: 'none', color: '#fff', fontSize: '13px', 
                                                outline: 'none', width: '100%', fontFamily: 'inherit' 
                                            }}
                                        />
                                    </div>
                                    <div style={{ overflowY: 'auto', maxHeight: '300px' }}>
                                        {goals.filter(g => 
                                            g.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                            g.id.toLowerCase().includes(searchTerm.toLowerCase())
                                        ).map(g => (
                                            <div 
                                                key={g.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedGoalId(g.id);
                                                    setIsDropdownOpen(false);
                                                    setSearchTerm('');
                                                }}
                                                style={{
                                                    padding: '10px 12px', borderRadius: '6px', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '10px',
                                                    background: selectedGoalId === g.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                                                    transition: 'background 0.2s'
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = selectedGoalId === g.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = selectedGoalId === g.id ? 'rgba(139,92,246,0.15)' : 'transparent'}
                                            >
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: g.statusColor === 'Green' ? '#30d158' : g.statusColor === 'Red' ? '#ff453a' : '#ff9f0a', flexShrink: 0 }} />
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, opacity: 0.5 }}>{g.id}</span>
                                                    <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                                                </div>
                                                {selectedGoalId === g.id && <Check size={14} color="#a78bfa" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Active Goal Context */}
                    {activeGoal && (
                        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                            <div>
                                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: 'rgba(255,255,255,0.95)' }}>
                                    {activeGoal.title}
                                </h2>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '13px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <List size={14} /> {subtasks.length} subtasks
                                    </span>
                                    <span style={{ color: activeGoal.statusColor === 'Green' ? '#30d158' : activeGoal.statusColor === 'Red' ? '#ff453a' : '#ff9f0a' }}>
                                        Goal Status: {activeGoal.statusColor}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sprint Data Table */}
                    <GoalSprintTable subtasks={subtasks} isLoading={isLoadingSprint} />
                </div>
            )}

            {/* Dive Deep Assistant */}
            <AIChat pageContext="sprints" />
            
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
