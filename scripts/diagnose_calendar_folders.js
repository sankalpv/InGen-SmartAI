function run(argv) {
    const app = Application("Microsoft Outlook");

    let account = app.defaultAccount();
    if (!account) {
        if (app.exchangeAccounts.length > 0) account = app.exchangeAccounts[0];
    }

    if (!account) {
        return JSON.stringify({ error: "No account" });
    }

    const result = {
        folders: []
    };

    try {
        const folders = account.folders();
        for (let i = 0; i < folders.length; i++) {
            const f = folders[i];
            const name = f.name();
            // Check if it has calendar events element
            // In JXA, we can try to access the property specifier
            // But let's just log names first.
            result.folders.push({
                name: name,
                // id: f.id(),
                containerType: f.containerType ? f.containerType().toString() : "unknown"
            });

            if (name === "Calendar" || name === "Calendar") {
                // Try getting events count
                try {
                    result.calendarEventsCount = f.calendarEvents.length;
                } catch (e) {
                    result.calendarError = e.message;
                }
            }
        }
    } catch (e) {
        result.error = e.message;
    }

    return JSON.stringify(result, null, 2);
}
