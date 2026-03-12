function run(argv) {
    const limit = parseInt(argv[0]) || 20;
    const offset = parseInt(argv[1]) || 0; // Support offset for batched fetching
    const app = Application("Microsoft Outlook");

    // Account resolution — supports Exchange, IMAP, and M365/New Outlook
    let account = null;
    let useDirectFolders = false;
    try { account = app.defaultAccount(); } catch (e) { /* no default */ }
    if (!account) {
        try { if (app.exchangeAccounts.length > 0) account = app.exchangeAccounts[0]; } catch (e) { /* no exchange */ }
    }
    if (!account) {
        try { if (app.imapAccounts.length > 0) account = app.imapAccounts[0]; } catch (e) { /* no imap */ }
    }
    if (!account) {
        // M365/New Outlook fallback: access folders directly by name
        try {
            const testFolders = app.mailFolders.whose({name: "Inbox"});
            if (testFolders.length > 0) useDirectFolders = true;
        } catch (e) { /* no direct folder access either */ }
    }

    if (!account && !useDirectFolders) {
        return JSON.stringify([{ id: "error", subject: "Error: No accounts found. Ensure Outlook has an email account configured.", sender: "System", date: new Date().toISOString() }]);
    }

    const messages = [];
    
    try {
        // Fetch from INBOX (received emails) — 75% of quota goes to inbox
        let inbox, inboxMsgs;
        if (useDirectFolders) {
            // M365/New Outlook: access Inbox folder directly
            const inboxFolders = app.mailFolders.whose({name: "Inbox"});
            // Pick the first non-"On My Computer" Inbox (the real account inbox)
            inbox = inboxFolders.length > 1 ? inboxFolders[1] : inboxFolders[0];
            inboxMsgs = inbox.messages;
        } else {
            inbox = account.inbox();
            inboxMsgs = inbox.messages;
        }
        const inboxLimit = Math.floor(limit * 0.75);
        const inboxOffset = Math.floor(offset * 0.75);

        for (let i = inboxOffset; i < inboxOffset + inboxLimit; i++) {
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

        // Fetch from SENT ITEMS (sent emails) — 25% of quota
        let sentItems, sentMsgs;
        if (useDirectFolders) {
            const sentFolders = app.mailFolders.whose({name: "Sent Items"});
            sentItems = sentFolders.length > 1 ? sentFolders[1] : sentFolders[0];
            sentMsgs = sentItems.messages;
        } else {
            sentItems = account.sentItems();
            sentMsgs = sentItems.messages;
        }
        const sentLimit = limit - messages.length; // Use remaining quota
        const sentOffset = Math.floor(offset * 0.25);

        for (let i = sentOffset; i < sentOffset + sentLimit; i++) {
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
