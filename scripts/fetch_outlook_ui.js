function run(argv) {
    const limit = parseInt(argv[0]) || 20;
    const outlook = Application("Microsoft Outlook");

    // Use Default Account
    let account = outlook.defaultAccount();
    if (!account) {
        if (outlook.exchangeAccounts.length > 0) account = outlook.exchangeAccounts[0];
        else if (outlook.imapAccounts.length > 0) account = outlook.imapAccounts[0];
    }

    if (!account) {
        return JSON.stringify([{ id: "error", subject: "Error: No accounts found", sender: "System", date: new Date().toISOString() }]);
    }

    const messages = [];
    try {
        const inbox = account.inbox();
        const inboxMsgs = inbox.messages();
        const count = inboxMsgs.length;
        const fetchCount = Math.min(count, limit);

        // Outlook JXA: Index 0 is newest
        for (let i = 0; i < fetchCount; i++) {
            try {
                const msg = inboxMsgs[i];
                // Safely get properties
                let senderName = "Unknown";
                let senderAddress = "";

                try {
                    const senderObj = msg.sender();
                    senderName = senderObj.name; // Property access
                    senderAddress = senderObj.address;
                } catch (e) {
                    senderName = "Unknown Sender";
                }

                const plainBody = msg.plainTextContent();

                messages.push({
                    id: msg.id().toString(),
                    subject: msg.subject(),
                    from: `${senderName} <${senderAddress}>`,
                    date: msg.timeReceived().toISOString(),
                    snippet: plainBody.substring(0, 200),
                    body: plainBody.substring(0, 1000) // Return more context for UI
                });
            } catch (e) {
                // Skip bad messages
            }
        }
    } catch (e) {
        return JSON.stringify([{ id: "error", subject: "Error: " + e.message, sender: "System" }]);
    }

    return JSON.stringify(messages);
}
