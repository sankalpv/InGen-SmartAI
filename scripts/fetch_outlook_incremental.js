function run(argv) {
    const lastSyncTimestamp = argv[0];
    const lastSyncDate = new Date(lastSyncTimestamp);

    const outlook = Application("Microsoft Outlook");

    if (!outlook.running()) {
        return JSON.stringify({ error: "Outlook is not running" });
    }

    // Use Default Account (safest bet)
    let account = outlook.defaultAccount();

    // Fallback if default is null (rare)
    if (!account) {
        if (outlook.exchangeAccounts.length > 0) {
            account = outlook.exchangeAccounts[0];
        } else if (outlook.imapAccounts.length > 0) {
            account = outlook.imapAccounts[0];
        }
    }

    if (!account) {
        return JSON.stringify([{ subject: "Error: No accounts found", received: new Date().toISOString() }]);
    }

    // Recursive function to get messages
    let allMessages = [];

    function processFolder(folder) {
        try {
            const messages = folder.messages();
            const count = messages.length;

            const batchSize = 50;
            const limit = Math.min(count, batchSize);

            // Outlook JXA returns NEWEST messages at index 0.
            // We want to fetch the top 50.

            for (let i = 0; i < limit; i++) {
                try {
                    const msg = messages[i];
                    allMessages.push({
                        id: msg.id(),
                        subject: msg.subject(),
                        sender: msg.sender().name, // Fix: .name is a property, not a function
                        body: msg.plainTextContent(),
                        received: msg.timeReceived().toISOString()
                    });
                } catch (e) {
                    allMessages.push({ error: "Message Error: " + e.message });
                }
            }
        } catch (e) {
            allMessages.push({ error: "Folder Error: " + e.message });
        }
    }

    // Recursion disabled for speed in this fix,
    // or we risk timeouts if user has many folders.
    // Let's keep it simple for now: Just Inbox.
    try {
        const inbox = account.inbox();
        processFolder(inbox);
    } catch (e) {
        allMessages.push({ error: "Inbox Error: " + e.message });
    }

    return JSON.stringify(allMessages);
}
