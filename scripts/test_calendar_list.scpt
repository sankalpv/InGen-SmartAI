tell application "Microsoft Outlook"
    try
        set cals to every calendar
        set output to "Found " & (count of cals) & " calendars:
"
        
        repeat with c in cals
            set output to output & " - " & (name of c) & " (ID: " & (id of c) & ")
"
        end repeat
        
        return output
    on error errMsg
        return "Error: " & errMsg
    end try
end tell
