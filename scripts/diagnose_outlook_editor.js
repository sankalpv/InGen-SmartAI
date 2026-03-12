var outlook = Application("Microsoft Outlook");
var report = {
    exchangeAccounts: [],
    imapAccounts: [],
    defaultAccount: null,
    inboxMessagesCount: -1,
    lastMessage: null,
    error: null
};

try {
    // 1. List Accounts
    var exUsers = outlook.exchangeAccounts();
    for (var i = 0; i < exUsers.length; i++) {
        report.exchangeAccounts.push(exUsers[i].name());
    }

    var imUsers = outlook.imapAccounts();
    for (var i = 0; i < imUsers.length; i++) {
        report.imapAccounts.push(imUsers[i].name());
    }

    // 2. Default Account
    var def = outlook.defaultAccount();
    if (def) {
        report.defaultAccount = def.name();

        // 3. Inbox Check
        var inbox = def.inbox();
        var msgs = inbox.messages();
        report.inboxMessagesCount = msgs.length;

        // 4. Sample Last Message
        if (report.inboxMessagesCount > 0) {
            // Get the LAST message (usually newest)
            var lastMsg = msgs[report.inboxMessagesCount - 1];
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

JSON.stringify(report, null, 2);
