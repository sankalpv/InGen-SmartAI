'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * PageTracker — Sends page view events to /api/track
 * Placed in layout.js to track all page navigations.
 * Fire-and-forget: never blocks rendering, never shows errors.
 */

const PAGE_NAMES = {
    '/': 'Dashboard',
    '/week-ahead': 'WeekAhead',
    '/leadership': 'Leadership',
    '/my-team': 'TeamHealth',
    '/eng-metrics': 'EngMetrics',
    '/ticket-health': 'TicketHealth',
    '/wbr-prep': 'WBRPrep',
    '/insights/analytics': 'InsightsAnalytics',
    '/settings': 'Settings',
    '/agent': 'Agent',
    '/team-pulse': 'TeamPulse',
};

export default function PageTracker() {
    const pathname = usePathname();

    useEffect(() => {
        if (!pathname) return;

        const pageName = PAGE_NAMES[pathname] || pathname.replace(/^\//, '').replace(/\//g, '-') || 'Unknown';

        // Fire-and-forget — don't await, don't catch visibly
        fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'PageView',
                data: { pageName }
            }),
        }).catch(() => { /* silent */ });

    }, [pathname]);

    return null; // Renders nothing
}
