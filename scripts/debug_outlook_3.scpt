
tell application "Microsoft Outlook"
    set inboxCount to count messages of inbox
    
    set msg1 to "Failed"
    try
        set firstMsg to first message of inbox
        set msg1 to subject of firstMsg
    on error e
        set msg1 to "Error: " & e
    end try
    
    set msgN to "Failed"
    try
        set nthMsg to message 5 of inbox
        set msgN to subject of nthMsg
    on error e
        set msgN to "Error: " & e
    end try
    
    return "Count: " & inboxCount & ", Msg 1: " & msg1 & ", Msg 5: " & msgN
end tell
