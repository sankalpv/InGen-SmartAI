function run(argv) {
    const outlook = Application("Microsoft Outlook");
    if (!outlook.running()) return "Outlook not running";

    const account = outlook.exchangeAccounts[0];
    const inbox = account.inbox();
    const messages = inbox.messages();
    const count = messages.length;

    let results = [];
    const limit = Math.min(count, 3);

    // Fetch last 3 messages (usually newest)
    for (let i = 0; i < limit; i++) {
        const msg = messages[i]; // JXA arrays are 0-indexed or 1-indexed? Usually 0-indexed for JS arrays, but object specifiers?
        // Let's assume 0-indexed for now.
        // Actually, let's grab the first one to be safe.
        // Or traverse from end?
        // Let's just grab index 0, 1, 2.

        try {
            results.push({
                subject: msg.subject(),
                sender: msg.sender().name(),
                received: msg.timeReceived().toISOString()
            });
        } catch (e) {
            results.push({ error: e.message });
        }
    }

    return JSON.stringify(results, null, 2);
}
