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
        // Fetch from INBOX (received emails)
        const inbox = account.inbox();
        const inboxMsgs = inbox.messages;
        const inboxLimit = Math.floor(limit / 2); // Split between inbox and sent

        for (let i = 0; i < inboxLimit; i++) {
            try {
                const msg = inboxMsgs[i];
                if (!msg.exists()) break;

                const subject = msg.subject();
                const timeReceived = msg.timeReceived();
                const id = msg.id().toString();

                let senderName = "Unknown";
                let senderAddress = "";
                try {
                    const senderObj = msg.sender();
                    senderName = senderObj.name;
                    senderAddress = senderObj.address;
                } catch (e) {
                    senderName = "Unknown";
                }

                const plainBody = msg.plainTextContent();
                const snippet = plainBody.substring(0, 200);
                const body = plainBody.substring(0, 50000);

                messages.push({
                    id: id,
                    subject: subject,
                    from: `${senderName} <${senderAddress}>`,
                    date: timeReceived.toISOString(),
                    snippet: snippet,
                    body: body,
                    folder: "Inbox",
                    isSent: false
                });
            } catch (e) {
                // Skip problematic message
            }
        }

        // Fetch from SENT ITEMS (sent emails)
        const sentItems = account.sentItems();
        const sentMsgs = sentItems.messages;
        const sentLimit = limit - messages.length; // Use remaining quota

        for (let i = 0; i < sentLimit; i++) {
            try {
                const msg = sentMsgs[i];
                if (!msg.exists()) break;

                const subject = msg.subject();
                const timeSent = msg.timeSent();
                const id = msg.id().toString();

                // For sent emails, get recipient instead of sender
                let recipientName = "Unknown";
                let recipientAddress = "";
                try {
                    const recipients = msg.toRecipients();
                    if (recipients.length > 0) {
                        recipientName = recipients[0].name();
                        recipientAddress = recipients[0].address();
                    }
                } catch (e) {
                    recipientName = "Unknown";
                }

                const plainBody = msg.plainTextContent();
                const snippet = plainBody.substring(0, 200);
                const body = plainBody.substring(0, 50000);

                messages.push({
                    id: id,
                    subject: subject,
                    to: `${recipientName} <${recipientAddress}>`,
                    date: timeSent.toISOString(),
                    snippet: snippet,
                    body: body,
                    folder: "Sent Items",
                    isSent: true
                });
            } catch (e) {
                // Skip problematic message
            }
        }
    } catch (e) {
        return JSON.stringify([{ id: "error", subject: "Error: " + e.message, sender: "System" }]);
    }

    // Sort all messages by date (newest first)
    messages.sort((a, b) => new Date(b.date) - new Date(a.date));

    return JSON.stringify(messages);
}
