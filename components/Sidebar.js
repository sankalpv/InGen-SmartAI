'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Settings,
    Zap,
    Sparkles,
    TrendingUp,
    BarChart2,
    CalendarDays,
    Users,
    Network,
    Code2,
    ClipboardList,
    FileText,
    FileBarChart,
    Sun,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    BrainCircuit,
    Activity,
    Layers,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function Sidebar() {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();
    const [collapsed, setCollapsed] = useState(false);
    const [outlookEnabled, setOutlookEnabled] = useState(true);

    // Load settings (outlookIntegration flag)
    useEffect(() => {
        fetch('/api/settings/config').then(r => r.ok ? r.json() : {}).then(data => {
            const settings = data.settings || data;
            // In hosted mode (AgentSpaces), aws-outlook-mcp provides email/calendar —
            // show all pages regardless of outlookIntegration flag.
            const isHosted = settings.deploymentMode === 'hosted';
            if (!isHosted && settings.outlookIntegration === false) setOutlookEnabled(false);
        }).catch(() => {});
    }, []);

    // Persist collapsed state in localStorage
    useEffect(() => {
        const stored = localStorage.getItem('ingen-sidebar-collapsed');
        if (stored === 'true') setCollapsed(true);
    }, []);

    useEffect(() => {
        localStorage.setItem('ingen-sidebar-collapsed', String(collapsed));
        // Update CSS variable for main content margin
        document.documentElement.style.setProperty('--sidebar-width', collapsed ? '72px' : '280px');
    }, [collapsed]);

    // Pages that require Outlook integration (email + calendar sync)
    const allNavItems = [
        { href: '/', label: 'Dashboard', icon: LayoutDashboard, requiresOutlook: true },
        { href: '/agent', label: 'Agent Workspace', icon: BrainCircuit },
        { href: '/week-ahead', label: 'Week Ahead', icon: CalendarDays, requiresOutlook: true },
        { href: '/leadership', label: 'Leadership', icon: TrendingUp, requiresOutlook: true },
        { href: '/org-pulse', label: 'Org Pulse', icon: Activity },
        { href: '/sprints', label: 'Sprint Boards', icon: Layers },
        { href: '/sde3-focus', label: 'SDE3 Focus', icon: Users },
        { href: '/my-team', label: 'Team Health', icon: Network },
        { href: '/eng-metrics', label: 'Code Metrics', icon: Code2 },
        { href: '/ticket-health', label: 'Ticket Health', icon: ClipboardList },
        { href: '/wbr-prep', label: 'WBR Prep', icon: FileText },
        { href: '/cpp-wbr', label: 'CPP WBR', icon: FileBarChart },
        { href: '/insights/analytics', label: 'Insights', icon: BarChart2, requiresOutlook: true },
        { href: '/settings', label: 'Settings', icon: Settings },
    ];

    // Filter out Outlook-dependent pages when outlookIntegration is disabled
    const navItems = outlookEnabled
        ? allNavItems
        : allNavItems.filter(item => !item.requiresOutlook);

    const connections = [
        { name: 'Outlook', status: 'connected', emoji: '📬' },
        { name: 'Calendar', status: 'connected', emoji: '📅' },
        { name: 'AI Engine (Ollama)', status: 'connected', emoji: '🧠' },
        { name: 'Slack', status: 'mock', emoji: '💬' },
    ];

    const sidebarWidth = collapsed ? '72px' : '280px';

    return (
        <aside className="sidebar" style={{ width: sidebarWidth, padding: collapsed ? '24px 12px' : '32px 24px', transition: 'width 0.25s ease, padding 0.25s ease' }}>
            {/* Logo */}
            <div className="sidebar-logo" style={{ gap: collapsed ? '0' : '16px', marginBottom: collapsed ? '24px' : '48px', justifyContent: collapsed ? 'center' : 'flex-start', paddingLeft: collapsed ? '0' : '12px' }}>
                <div className="sidebar-logo-icon" style={{ flexShrink: 0 }}>
                    <Sparkles size={collapsed ? 20 : 24} color="white" />
                </div>
                {!collapsed && (
                    <div>
                        <h1>InGen</h1>
                        <span>Intelligent Agent</span>
                    </div>
                )}
            </div>

            {/* Nav */}
            <nav className="sidebar-nav" style={{ flex: 1 }}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                            style={{
                                gap: collapsed ? '0' : '16px',
                                justifyContent: collapsed ? 'center' : 'flex-start',
                                padding: collapsed ? '12px' : '14px 20px',
                            }}
                            title={collapsed ? item.label : undefined}
                        >
                            <Icon size={18} className="nav-icon" />
                            {!collapsed && item.label}
                        </Link>
                    );
                })}
            </nav>

            <div>
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: collapsed ? '0' : '12px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        width: '100%',
                        padding: collapsed ? '10px' : '12px 20px',
                        marginBottom: '12px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(139, 92, 246, 0.08)',
                        border: '1px solid rgba(139, 92, 246, 0.15)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        transition: 'all 0.2s ease',
                    }}
                    title={collapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.08)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                >
                    {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    {!collapsed && (theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
                </button>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: collapsed ? '0' : '12px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        width: '100%',
                        padding: collapsed ? '10px' : '12px 20px',
                        marginBottom: '16px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        transition: 'all 0.2s ease',
                    }}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.color = 'var(--text-tertiary)';
                    }}
                >
                    {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    {!collapsed && 'Collapse'}
                </button>

            </div>
        </aside>
    );
}