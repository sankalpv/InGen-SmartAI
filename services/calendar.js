// Unified Calendar Service
// Merges events from Google Calendar and Outlook Calendar

import { fetchGoogleCalendarEvents } from './gmail';
import { fetchOutlookCalendarEvents } from './outlook';

export async function fetchAllCalendarEvents({ googleToken, outlookToken }) {
    const [googleEvents, outlookEvents] = await Promise.all([
        fetchGoogleCalendarEvents(googleToken),
        fetchOutlookCalendarEvents(outlookToken),
    ]);

    const allEvents = [...googleEvents, ...outlookEvents];

    // Deduplicate by title + start time
    const deduped = allEvents.reduce((acc, event) => {
        const key = `${event.title.toLowerCase()}-${event.startTime}`;
        if (!acc.has(key)) {
            acc.set(key, event);
        }
        return acc;
    }, new Map());

    // Sort by start time
    return Array.from(deduped.values()).sort(
        (a, b) => new Date(a.startTime) - new Date(b.startTime)
    );
}
