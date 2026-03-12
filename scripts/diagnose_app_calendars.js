function run(argv) {
    const app = Application("Microsoft Outlook");

    // Check app.calendars
    const cals = app.calendars; // Ref
    const count = cals.length;

    const result = {
        calendars: []
    };

    for (let i = 0; i < count; i++) {
        try {
            const cal = cals[i];
            result.calendars.push({
                name: cal.name(),
                id: cal.id(),
                // account: cal.account().name() // maybe?
            });
        } catch (e) {
            result.calendars.push({ error: e.message });
        }
    }

    return JSON.stringify(result, null, 2);
}
