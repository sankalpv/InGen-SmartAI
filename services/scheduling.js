// Unified Calendar Service
// Merges events from Outlook Calendar (Local)

import { fetchOutlookCalendar } from './outlook-local'; // Use local optimized service

export async function findFreeSlots(constraints, session) {
    // 1. Determine Date Range
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + 7); // Default 1 week

    if (constraints.dateRange === 'next week') {
        // Calculate start of next week (Monday)
        const day = startDate.getDay();
        const diff = startDate.getDate() - day + (day === 0 ? -6 : 1) + 7;
        startDate.setDate(diff);
        endDate.setDate(startDate.getDate() + 5); // Fri
    } else if (constraints.dateRange === 'tomorrow') {
        startDate.setDate(startDate.getDate() + 1);
        endDate.setDate(startDate.getDate() + 1);
    }

    // 2. Fetch All Events
    let events = [];
    try {
        // Only fetch Outlook as requested
        const outlookEvents = await fetchOutlookCalendar();
        events = [...outlookEvents];
    } catch (e) {
        console.error('Error fetching events for slots:', e);
    }

    // 3. Find Gaps
    const slots = [];
    const durationMs = (constraints.durationMinutes || 30) * 60000;

    // Normalize events
    const busyTimes = events.map(e => ({
        start: new Date(e.start?.dateTime || e.date || e.startTime).getTime(),
        end: new Date(e.end?.dateTime || e.endTime).getTime()
    })).sort((a, b) => a.start - b.start);

    // Scan working hours (9-5) for each day in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });

        // Skip weekends unless requested? (Assume M-F for now)
        if (d.getDay() === 0 || d.getDay() === 6) continue;

        // Check if day is preferred
        if (constraints.preferredDays?.length > 0 && !constraints.preferredDays.includes(dayName)) continue;

        // Set Work Hours
        const workStart = new Date(d); workStart.setHours(9, 0, 0, 0);
        const workEnd = new Date(d); workEnd.setHours(17, 0, 0, 0);

        let currentTime = workStart.getTime();

        while (currentTime + durationMs <= workEnd.getTime()) {
            const slotEnd = currentTime + durationMs;

            // Check collision
            const isBusy = busyTimes.some(busy =>
                (currentTime >= busy.start && currentTime < busy.end) || // Start inside
                (slotEnd > busy.start && slotEnd <= busy.end) || // End inside
                (currentTime <= busy.start && slotEnd >= busy.end) // Encloses
            );

            if (!isBusy) {
                // Check Time of Day preference
                const hour = new Date(currentTime).getHours();
                const isMorning = hour < 12;
                const matchesPref = constraints.preferredTimeOfDay === 'any' ||
                    (constraints.preferredTimeOfDay === 'morning' && isMorning) ||
                    (constraints.preferredTimeOfDay === 'afternoon' && !isMorning);

                if (matchesPref) {
                    slots.push({
                        start: new Date(currentTime).toISOString(),
                        end: new Date(slotEnd).toISOString(),
                        label: `${dayName}, ${new Date(currentTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                    });
                }
            }
            // Increment by 30 mins
            currentTime += 30 * 60000;
        }
    }

    return slots.slice(0, 5); // Return top 5
}
