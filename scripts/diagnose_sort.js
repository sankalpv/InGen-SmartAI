var outlook = Application("Microsoft Outlook");
var account = outlook.defaultAccount();
var report = { first3: [], last3: [] };

if (account) {
    try {
        var inbox = account.inbox();
        var messages = inbox.messages();
        var count = messages.length;
        report.total = count;

        // Check First 3 (Index 0, 1, 2)
        for (var i = 0; i < Math.min(3, count); i++) {
            var msg = messages[i];
            report.first3.push({
                index: i,
                subject: msg.subject(),
                received: msg.timeReceived().toISOString()
            });
        }

        // Check Last 3
        for (var i = Math.max(0, count - 3); i < count; i++) {
            var msg = messages[i];
            report.last3.push({
                index: i,
                subject: msg.subject(),
                received: msg.timeReceived().toISOString()
            });
        }

    } catch (e) {
        report.error = e.toString();
    }
} else {
    report.error = "No default account";
}

JSON.stringify(report, null, 2);
