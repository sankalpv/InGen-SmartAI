'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
    LayoutDashboard,
    Settings,
    Zap,
    Sparkles,
} from 'lucide-react';

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    const isGoogleConnected = !!session?.user;

    const navItems = [
        { href: '/', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/settings', label: 'Settings', icon: Settings },
    ];

    const connections = [
        { name: 'Gmail', status: isGoogleConnected ? 'connected' : 'disconnected', emoji: '📧' },
        { name: 'Calendar', status: isGoogleConnected ? 'connected' : 'disconnected', emoji: '📅' },
        { name: 'Outlook', status: 'disconnected', emoji: '📬' },
        { name: 'Slack', status: 'mock', emoji: '💬' },
        { name: 'AI Engine', status: 'mock', emoji: '🧠' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">
                    <Sparkles size={24} color="white" />
                </div>
                <div>
                    <h1>InGen</h1>
                    <span>Intelligent Agent</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                        >
                            <Icon size={18} className="nav-icon" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div>
                <div className="sidebar-section-title" style={{ marginTop: '24px', marginBottom: '12px', paddingLeft: '12px', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '1px', fontWeight: 600 }}>System Status</div>
                <div className="connections-list">
                    {connections.map((conn) => (
                        <div key={conn.name} className={`connection-item ${conn.status}`}>
                            <div className="connection-info">
                                <span className="connection-icon-wrapper">{conn.emoji}</span>
                                <span className="connection-name">{conn.name}</span>
                            </div>
                            <span className={`connection-dot ${conn.status}`} />
                        </div>
                    ))}
                </div>

                {isGoogleConnected && (
                    <div style={{
                        marginTop: 16,
                        padding: '10px 16px',
                        fontSize: '0.75rem',
                        color: 'var(--text-tertiary)',
                        borderTop: '1px solid var(--border-subtle)',
                    }}>
                        Signed in as<br />
                        <span style={{ color: 'var(--text-secondary)' }}>{session.user.email}</span>
                    </div>
                )}
            </div>
        </aside>
    );
}
