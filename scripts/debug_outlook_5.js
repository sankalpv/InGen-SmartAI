function run() {
    const outlook = Application("Microsoft Outlook");
    const result = { accounts: [], messages: [] };

    try {
        // 1. List Accounts
        const accounts = outlook.exchangeAccounts();
        if (accounts.length === 0) {
            result.error = "No Exchange accounts found.";
            // Try imap?
            const imap = outlook.imapAccounts();
            if (imap.length > 0) {
                result.accounts = imap.map(a => a.name());
                result.accountType = "imap";
            } else {
                return JSON.stringify({ error: "No accounts found (Exchange or IMAP)." });
            }
        } else {
            result.accounts = accounts.map(a => a.name());
            result.accountType = "exchange";
        }

        // 2. Get Inbox of first account
        const account = (result.accountType === "imap") ? outlook.imapAccounts()[0] : outlook.exchangeAccounts()[0];
        const inbox = account.inbox();

        // 3. Get recent messages (Manual Slice)
        const messages = inbox.messages();
        const count = messages.length;
        result.totalMessages = count;

        // Fetch last 5 (Outlook typically appends, so last might be newest? or first?)
        // Let's grab first 5 and last 5 to be sure.

        // Grab a few from the end (usually newest in default sort, but JXA index 0 is oldest usually?)
        // Actually, let's just grab the *first* 10 and *last* 10.

        const sampleIndices = [];
        for (let i = 0; i < Math.min(5, count); i++) sampleIndices.push(i);
        // keys in JXA are 0-indexed? No, usually 0-indexed in array access but JXA is weird. 
        // In JXA via JS, it behaves like array.

        // Let's just Try to map the first 5 messages
        // NOTE: messages() returns a specifier. accessing [i] resolves it.

        const samples = [];
        for (let i = 0; i < Math.min(5, count); i++) {
            const msg = messages[i];
            samples.push({
                subject: msg.subject(),
                received: msg.timeReceived().toISOString(),
                index: i
            });
        }

        result.messages = samples;

    } catch (e) {
        result.error = e.message;
    }

    return JSON.stringify(result, null, 2);
}
