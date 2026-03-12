
tell application "Microsoft Outlook"
    set accountsList to name of every account
    set inboxCount to 0
    try
        set inboxFolder to folder "Inbox" of default account
        set inboxCount to count of messages of inboxFolder
    end try
    
    return "Accounts: " & (accountsList as string) & ", Inbox Count: " & (inboxCount as string)
end tell
