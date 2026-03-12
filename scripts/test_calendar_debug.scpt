tell application "Microsoft Outlook"
    set output to ""
    try
        set theAccount to default account
        set output to output & "Account: " & (name of theAccount) & "

"
        
        set myCal to calendar of theAccount
        set output to output & "Calendar: " & (name of myCal) & "

"
        
        -- Try count
        set evtCount to count of calendar events of myCal
        set output to output & "Event Count: " & evtCount
        
        return output
    on error errMsg
        return output & "Error: " & errMsg
    end try
end tell
