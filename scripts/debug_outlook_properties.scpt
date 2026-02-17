
tell application "Microsoft Outlook"
    try
        set msg to message 1 of inbox
        
        -- Try Subject
        set s to "N/A"
        try
            set s to subject of msg
        on error
            set s to "ERROR"
        end try
        
        -- Try Sender Record
        set senderRec to "N/A"
        try
            set senderRec to sender of msg
        on error
            set senderRec to "ERROR"
        end try
        
        -- Try Sender Name
        set sn to "N/A"
        try
            set sn to name of sender of msg
        on error
            set sn to "ERROR"
        end try
        
        -- Try Content
        set c to "N/A"
        try
            set c to plain text content of msg
            -- Truncate for display
            if (length of c) > 50 then set c to (text 1 thru 50 of c) & "..."
        on error
            set c to "ERROR"
        end try

        -- Try Time Received
        set t to "N/A"
        try
            set t to time received of msg
        on error
            set t to "ERROR"
        end try
        
        return "Subject: " & s & ", SenderRec: " & senderRec & ", SenderName: " & sn & ", Content: " & c & ", Time: " & t
        
    on error e
        return "Critical Error getting message 1: " & e
    end try
end tell
