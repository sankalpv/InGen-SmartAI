function run() {
    const outlook = Application("Microsoft Outlook");
    const report = {
        exchangeAccounts: [],
        imapAccounts: [],
        defaultAccount: null,
        inboxMessagesCount: -1,
        lastMessage: null,
        error: null
    };

    try {
        // 1. List Accounts
        const exUsers = outlook.exchangeAccounts();
        for (let i = 0; i < exUsers.length; i++) {
            report.exchangeAccounts.push(exUsers[i].name());
        }

        const imUsers = outlook.imapAccounts();
        for (let i = 0; i < imUsers.length; i++) {
            report.imapAccounts.push(imUsers[i].name());
        }

        // 2. Default Account
        const def = outlook.defaultAccount();
        if (def) {
            report.defaultAccount = def.name();

            // 3. Inbox Check
            const inbox = def.inbox();
            const msgs = inbox.messages();
            report.inboxMessagesCount = msgs.length;

            // 4. Sample Last Message
            if (report.inboxMessagesCount > 0) {
                const lastMsg = msgs[report.inboxMessagesCount - 1];
                report.lastMessage = {
                    subject: lastMsg.subject(),
                    received: lastMsg.timeReceived().toISOString()
                };
            }
        } else {
            report.error = "No default account found.";
        }
    } catch (e) {
        report.error = e.toString();
    }

    return JSON.stringify(report, null, 2);
}
