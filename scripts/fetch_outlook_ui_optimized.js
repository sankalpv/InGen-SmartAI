function run(argv) {
    const limit = parseInt(argv[0]) || 20;
    const app = Application("Microsoft Outlook");

    // Account resolution
    let account = app.defaultAccount();
    if (!account) {
        if (app.exchangeAccounts.length > 0) account = app.exchangeAccounts[0];
        else if (app.imapAccounts.length > 0) account = app.imapAccounts[0];
    }

    if (!account) {
        return JSON.stringify([{ id: "error", subject: "Error: No accounts found", sender: "System", date: new Date().toISOString() }]);
    }

    const messages = [];
    try {
        const inbox = account.inbox();
        const inboxMsgs = inbox.messages; // Reference, not array

        for (let i = 0; i < limit; i++) {
            try {
                // Access by index (0 is newest)
                const msg = inboxMsgs[i];
                if (!msg.exists()) break;

                // Basic props
                // Note: JXA can be slow on property access.
                const subject = msg.subject();
                const timeReceived = msg.timeReceived();
                const id = msg.id().toString();

                // Sender
                let senderName = "Unknown";
                let senderAddress = "";
                try {
                    const senderObj = msg.sender();
                    senderName = senderObj.name;
                    senderAddress = senderObj.address;
                } catch (e) {
                    senderName = "Unknown";
                }

                // Body
                const plainBody = msg.plainTextContent();
                const snippet = plainBody.substring(0, 200);
                const body = plainBody.substring(0, 1000);

                messages.push({
                    id: id,
                    subject: subject,
                    from: `${senderName} <${senderAddress}>`,
                    date: timeReceived.toISOString(),
                    snippet: snippet,
                    body: body
                });
            } catch (e) {
                // Skip problematic message
            }
        }
    } catch (e) {
        return JSON.stringify([{ id: "error", subject: "Error: " + e.message, sender: "System" }]);
    }

    return JSON.stringify(messages);
}
