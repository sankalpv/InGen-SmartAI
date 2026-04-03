'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard,
    Settings,
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
    BrainCircuit,
    Activity,
    Layers,
    ChevronDown,
    ChevronRight,
    PanelLeftClose,
    PanelLeftOpen,
    StickyNote,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

// ─── Nav structure ────────────────────────────────────────────────────────────

const PINNED_ITEMS = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, requiresOutlook: true },
    { href: '/notes', label: 'Meeting Notes', icon: StickyNote },
    { href: '/agent', label: 'Agent Workspace', icon: BrainCircuit },
];

const NAV_GROUPS = [
    {
        id: 'my-day',
        label: 'My Day',
        emoji: '☀️',
        items: [
            { href: '/week-ahead', label: 'Week Ahead', icon: CalendarDays, requiresOutlook: true },
            { href: '/leadership', label: 'Leadership', icon: TrendingUp, requiresOutlook: true },
        ],
    },
    {
        id: 'team-org',
        label: 'Team & Org',
        emoji: '👥',
        items: [
            { href: '/org-pulse', label: 'Org Pulse', icon: Activity },
            { href: '/my-team', label: 'Team Health', icon: Network },
            { href: '/sde3-focus', label: 'SDE3 Focus', icon: Users },
        ],
    },
    {
        id: 'engineering',
        label: 'Engineering',
        emoji: '⚙️',
        items: [
            { href: '/sprints', label: 'Sprint Boards', icon: Layers },
            { href: '/eng-metrics', label: 'Code Metrics', icon: Code2 },
            { href: '/ticket-health', label: 'Ticket Health', icon: ClipboardList },
        ],
    },
    {
        id: 'reporting',
        label: 'Reporting',
        emoji: '📊',
        items: [
            { href: '/wbr-prep', label: 'WBR Prep', icon: FileText },
            { href: '/cpp-wbr', label: 'CPP WBR', icon: FileBarChart },
            { href: '/insights/analytics', label: 'Insights', icon: BarChart2, requiresOutlook: true },
        ],
    },
];

const BOTTOM_ITEMS = [
    { href: '/settings', label: 'Settings', icon: Settings },
];

// ─── Component ────────────────────────────────────────────────────────────────
// Styles live in app/globals.css under ".ingen-sidebar" etc.

export default function Sidebar() {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();
    const [outlookEnabled, setOutlookEnabled] = useState(true);

    // Default open — consistent between SSR and first client render (no hydration mismatch).
    // localStorage is applied after mount in useEffect.
    const defaultExpanded = Object.fromEntries(NAV_GROUPS.map(g => [g.id, true]));

    // Use a sentinel so we know if we've restored from localStorage yet.
    // This prevents the save-effect from overwriting localStorage with the
    // default value before the restore-effect has applied the saved value.
    const [hydrated, setHydrated] = useState(false);
    const [isOpen, setIsOpen] = useState(true);
    const [expandedSections, setExpandedSections] = useState(defaultExpanded);

    // After hydration: restore persisted state (runs once on mount)
    useEffect(() => {
        // Clean up legacy keys
        localStorage.removeItem('ingen-sidebar-collapsed');
        localStorage.removeItem('ingen-sidebar-pin');

        const stored = localStorage.getItem('ingen-sidebar-open');
        if (stored !== null) {
            setIsOpen(stored !== 'false');
        }

        try {
            const raw = localStorage.getItem('ingen-sidebar-sections');
            if (raw) {
                const parsed = JSON.parse(raw);
                // Merge: new groups default to expanded
                setExpandedSections(prev => ({ ...prev, ...parsed }));
            }
        } catch {}

        setHydrated(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist open/closed state + update CSS variable.
    // Guard with `hydrated` so we don't overwrite the stored value with the
    // default `true` before the restore effect has read it.
    useEffect(() => {
        document.documentElement.style.setProperty(
            '--sidebar-width',
            isOpen ? '280px' : '72px'
        );
        if (!hydrated) return; // don't write until we've read
        localStorage.setItem('ingen-sidebar-open', String(isOpen));
    }, [isOpen, hydrated]);

    // Settings
    useEffect(() => {
        fetch('/api/settings/config').then(r => r.ok ? r.json() : {}).then(data => {
            const s = data.settings || data;
            if (s.deploymentMode !== 'hosted' && s.outlookIntegration === false) setOutlookEnabled(false);
        }).catch(() => {});
    }, []);

    const toggleOpen = (e) => {
        e.stopPropagation();
        setIsOpen(prev => !prev);
    };

    const toggleSection = (id) => {
        setExpandedSections(prev => {
            const next = { ...prev, [id]: !prev[id] };
            localStorage.setItem('ingen-sidebar-sections', JSON.stringify(next));
            return next;
        });
    };

    const filterItems = (items) =>
        outlookEnabled ? items : items.filter(i => !i.requiresOutlook);

    // data-pin kept for CSS compatibility; map isOpen to the values CSS expects
    const dataPinValue = isOpen ? 'pinned-open' : 'pinned-closed';

    const NavItem = ({ href, label, icon: Icon, isActive, indented }) => (
        <Link
            href={href}
            className={`ingen-nav-item${isActive ? ' active' : ''}`}
            title={label}
            style={{ paddingLeft: indented ? '14px' : '11px', fontSize: indented ? '0.95rem' : '1rem' }}
        >
            <Icon size={indented ? 17 : 19} style={{ flexShrink: 0, minWidth: indented ? 17 : 19 }} />
            <span className="ingen-sidebar-label">{label}</span>
        </Link>
    );

    return (
        <aside className="ingen-sidebar" data-pin={dataPinValue}>
            {/* ── Logo row ── */}
            <Link href="/" style={{ display: 'flex', alignItems: 'center', padding: '20px 16px 16px', minHeight: '60px', flexShrink: 0, textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div style={{
                        width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Sparkles size={16} color="white" />
                    </div>
                    <div style={{
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        opacity: isOpen ? 1 : 0,
                        maxWidth: isOpen ? '200px' : '0px',
                        transition: 'opacity 0.18s ease, max-width 0.22s ease',
                        pointerEvents: isOpen ? 'auto' : 'none',
                    }}>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>InGen</div>
                        <div style={{ fontSize: '1rem', color: 'var(--text-tertiary)' }}>Intelligent Agent</div>
                    </div>
                </div>
            </Link>

            {/* ── Scrollable nav area ── */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 10px', scrollbarWidth: 'none' }}>

                {/* Pinned items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '6px' }}>
                    {filterItems(PINNED_ITEMS).map(item => (
                        <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} isActive={pathname === item.href} />
                    ))}
                </div>

                {/* Divider */}
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 2px 8px' }} />

                {/* Grouped sections */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {NAV_GROUPS.map(group => {
                        const items = filterItems(group.items);
                        if (!items.length) return null;
                        const isExpanded = !!expandedSections[group.id];
                        const hasActive = items.some(i => i.href === pathname);
                        return (
                            <div key={group.id}>
                                <button
                                    className={`ingen-section-header${hasActive ? ' has-active' : ''}`}
                                    onClick={() => toggleSection(group.id)}
                                    title={group.label}
                                >
                                    <span style={{ flexShrink: 0, fontSize: '15px' }}>{group.emoji}</span>
                                    <span className="ingen-sidebar-label" style={{ flex: 1, textAlign: 'left', fontSize: '0.95rem' }}>{group.label}</span>
                                    <span className="ingen-sidebar-label" style={{ flexShrink: 0, opacity: 0.5, display: 'flex', alignItems: 'center' }}>
                                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                    </span>
                                    {!isExpanded && (
                                        <span className="ingen-sidebar-label" style={{
                                            fontSize: '11px', background: hasActive ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.06)',
                                            color: hasActive ? '#a78bfa' : 'rgba(255,255,255,0.35)',
                                            padding: '1px 5px', borderRadius: '4px', fontWeight: 600,
                                            letterSpacing: 0, textTransform: 'none', flexShrink: 0,
                                        }}>
                                            {items.length}
                                        </span>
                                    )}
                                </button>
                                <div className={`ingen-section-body${isExpanded ? ' expanded' : ''}`} style={{ paddingLeft: '4px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingBottom: '4px' }}>
                                        {items.map(item => (
                                            <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} isActive={pathname === item.href} indented />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Bottom ── */}
            <div style={{ padding: '8px 10px 16px', flexShrink: 0 }}>
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '8px' }} />

                {/* Collapse/Expand toggle — always visible, no ingen-sidebar-label class */}
                <button
                    onClick={toggleOpen}
                    title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                    style={{
                        width: '100%', padding: '7px 11px', marginBottom: '2px',
                        background: 'transparent', border: 'none', borderRadius: '8px',
                        cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
                        display: 'flex', alignItems: 'center', gap: '10px',
                        justifyContent: isOpen ? 'flex-start' : 'center',
                        transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#a78bfa'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                >
                    {isOpen ? <PanelLeftClose size={16} style={{ flexShrink: 0 }} /> : <PanelLeftOpen size={16} style={{ flexShrink: 0 }} />}
                    <span className="ingen-sidebar-label" style={{ fontSize: '0.875rem' }}>
                        {isOpen ? 'Collapse' : ''}
                    </span>
                </button>

                {BOTTOM_ITEMS.map(item => (
                    <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} isActive={pathname === item.href} />
                ))}
                <button
                    onClick={toggleTheme}
                    className="ingen-nav-item"
                    title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    style={{ marginTop: '2px', background: 'rgba(139,92,246,0.07)', borderColor: 'rgba(139,92,246,0.12)' }}
                >
                    {theme === 'dark'
                        ? <Sun size={16} style={{ flexShrink: 0, minWidth: 16 }} />
                        : <Moon size={16} style={{ flexShrink: 0, minWidth: 16 }} />
                    }
                    <span className="ingen-sidebar-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>
            </div>
        </aside>
    );
}
