tell application "Microsoft Outlook"
    set theAccount to default account
    -- Outlook calendar object model is a bit specific.
    -- Account has "calendar" property which is the default calendar folder.
    
    set myCal to calendar of theAccount
    
    -- Calculate "today"
    set today to (current date)
    set time of today to 0 -- midnight
    
    set tomorrow to today + (1 * days)
    
    -- Fetch events
    -- Note: 'calendar events' is the element name
    try
        set theEvents to (every calendar event of myCal whose start time > today and start time < tomorrow)
        
        set output to {}
        repeat with evt in theEvents
            set evtSubject to subject of evt
            set evtStart to start time of evt
            set end of output to {name:evtSubject, startTime:evtStart}
        end repeat
        
        return output
    on error errMsg
        return "Error: " & errMsg
    end try
end tell
