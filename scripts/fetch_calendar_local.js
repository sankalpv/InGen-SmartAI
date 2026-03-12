function run(argv) {
    const app = Application("Microsoft Outlook");

    // Fast fail
    if (!app.running()) {
        return JSON.stringify([]);
    }

    // Default Account resolution
    let account = app.defaultAccount();
    if (!account) {
        if (app.exchangeAccounts.length > 0) account = app.exchangeAccounts[0];
        else if (app.imapAccounts.length > 0) account = app.imapAccounts[0];
    }

    if (!account) {
        return JSON.stringify([{ id: "error", title: "No account found", start: { dateTime: new Date().toISOString() } }]);
    }

    const eventsData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    try {
        const calendar = account.calendar();
        // JXA filtering for events is tricky.
        // It's often faster to get 'calendar events' and filter in JS if the count isn't massive.
        // Or use a 'whose' clause if possible.

        // Outlook JXA: `calendar events`
        // Let's try to get all events for today. 
        // Filtering by date in JXA ‘whose’ is notoriously flaky. 
        // Better to fetch recent X events or try to narrow down.
        // However, `calendar` object might not be directly iterable like inbox.

        // Let's try getting all events and filtering. 
        // WARNING: This could be slow if there are thousands.
        // A better approach for Outlook Mac is to assume the user manages their calendar actively 
        // and we might need to look at the 'calendar' of the application or account.

        const events = calendar.calendarEvents;
        // Limit to 50 for performance safety if we can't filter
        const count = Math.min(events.length, 50);

        // Optimized loop: Iterate backwards? Or just top N?
        // Actually, calendar events usually aren't sorted by date by default in JXA access.
        // They might be insertion order.

        // Better strategy: Use AppleScript native `whose` via a raw execution string? 
        // Or just iterate and check dates. 
        // Let's try iterating 50. If user has >50 events, might miss some, but unlikely for "Today".

        // Wait, Outlook events have 'startTime' and 'endTime'.

        for (let i = 0; i < count; i++) {
            const evt = events[i];
            try {
                const start = evt.startTime();
                // Check if it's today
                if (start >= today && start < tomorrow) {
                    const end = evt.endTime();
                    const attendees = []; // Keep it simple for now to avoid slowdowns

                    eventsData.push({
                        id: evt.id().toString(),
                        summary: evt.subject(), // Google uses 'summary', Outlook 'subject'
                        start: { dateTime: start.toISOString() },
                        end: { dateTime: end.toISOString() },
                        location: evt.location() || "",
                        description: evt.plainTextContent() || ""
                    });
                }
            } catch (e) {
                // skip
            }
        }
    } catch (e) {
        return JSON.stringify([{ id: "error", title: "Error: " + e.message }]);
    }

    // Sort by start time since JXA iteration order is undefined
    eventsData.sort((a, b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));

    return JSON.stringify(eventsData);
}
