function run(argv) {
    const app = Application("Microsoft Outlook");

    let account = app.defaultAccount();
    if (!account) {
        if (app.exchangeAccounts.length > 0) account = app.exchangeAccounts[0];
        else if (app.imapAccounts.length > 0) account = app.imapAccounts[0];
    }

    if (!account) {
        return JSON.stringify({ error: "No account" });
    }

    const result = {
        accountName: account.name(),
        calendars: []
    };

    try {
        // accounts have 'calendars' (plural)
        const cals = account.calendars();
        for (let i = 0; i < cals.length; i++) {
            const cal = cals[i];
            const eventCount = cal.calendarEvents.length; // might be slow?
            result.calendars.push({
                name: cal.name(),
                id: cal.id(),
                eventCount: eventCount
            });
        }
    } catch (e) {
        result.error = e.message;
    }

    return JSON.stringify(result, null, 2);
}
