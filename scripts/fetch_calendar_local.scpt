-- fetch_calendar_local.scpt
use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            if not running then
                return "[]"
            end if
            
            -- Date range: Today
            set today to (current date)
            set time of today to 0
            set tomorrow to today + (1 * days)
            
            set jsonList to {}
            set targetCal to missing value
            
            -- PLAN A: Find by ID 432 (User specified)
            set allCals to every calendar
            repeat with c in allCals
                try
                    if (id of c) is 432 then
                        set targetCal to c
                        exit repeat
                    end if
                end try
            end repeat
            
            -- PLAN B: If ID 432 not found, try "Calendar" (but careful of missing value)
            if targetCal is missing value then
                 repeat with c in allCals
                    try
                        if (name of c) is "Calendar" and (id of c) is not 13 then
                             -- try to avoid the empty local one if we can distinguish it
                            set targetCal to c
                            exit repeat
                        end if
                    end try
                end repeat
            end if

            if targetCal is not missing value then
                try
                    set theEvents to (every calendar event of targetCal whose start time > today and start time < tomorrow)
                    
                    repeat with evt in theEvents
                        -- Extract props
                        set evtId to (id of evt) as string
                        set evtSubject to (subject of evt)
                        set evtStart to (start time of evt)
                        set evtEnd to (end time of evt)
                        
                        set evtLoc to ""
                        try
                            set evtLoc to (location of evt)
                        end try
                        set evtBody to ""
                        try
                            set evtBody to (plain text content of evt)
                            if evtBody is missing value then set evtBody to ""
                        end try
                        
                        -- JSON Escape
                        set evtSubject to my escapeJSON(evtSubject)
                        set evtLoc to my escapeJSON(evtLoc)
                        if (length of evtBody) > 200 then
                            set evtBody to text 1 thru 200 of evtBody
                        end if
                        set evtBody to my escapeJSON(evtBody)
                        
                        -- Format Date (ISOish)
                        set startIso to my dateToISO(evtStart)
                        set endIso to my dateToISO(evtEnd)
                        
                        -- Build JSON Item
                        set jsonItem to "{\"id\": \"" & evtId & "\", \"summary\": \"" & evtSubject & "\", \"start\": {\"dateTime\": \"" & startIso & "\"}, \"end\": {\"dateTime\": \"" & endIso & "\"}, \"location\": \"" & evtLoc & "\", \"description\": \"" & evtBody & "\"}"
                        copy jsonItem to end of jsonList
                    end repeat
                on error errMsg
                     -- Log error 
                end try
            end if

            set jsonString to "[" & (my joinList(jsonList, ",")) & "]"
            return jsonString
        end tell
    on error errMsg
        return "{\"error\": \"" & (my escapeJSON(errMsg)) & "\"}"
    end try
end run

-- Helper: Date to ISO string (approximate for local time)
on dateToISO(dt)
    set {year:y, month:m, day:d, time:t} to dt
    set m to m as integer
    set output to (y as string) & "-" & (my pad(m)) & "-" & (my pad(d)) & "T"
    
    set hr to t div 3600
    set min to (t mod 3600) div 60
    set sec to t mod 60
    
    set output to output & (my pad(hr)) & ":" & (my pad(min)) & ":" & (my pad(sec))
    return output
end dateToISO

on pad(n)
    if n < 10 then
        return "0" & n
    else
        return n as string
    end if
end pad

-- Helper to escape JSON special chars
on escapeJSON(str)
    set str to str as string
    set str to my replaceString(str, "\\", "\\\\")
    set str to my replaceString(str, "\"", "\\\"")
    try
        set str to my replaceString(str, (character id 10), "\\n")
    end try
    try
        set str to my replaceString(str, (character id 13), "\\r")
    end try
    return str
end escapeJSON

-- Helper to fetch substring
on replaceString(theText, oldString, newString)
    set AppleScript's text item delimiters to oldString
    set theTextItems to text items of theText
    set AppleScript's text item delimiters to newString
    set theText to theTextItems as string
    set AppleScript's text item delimiters to ""
    return theText
end replaceString

on joinList(theList, delimiter)
    set AppleScript's text item delimiters to delimiter
    set theString to theList as string
    set AppleScript's text item delimiters to ""
    return theString
end joinList
