-- fetch_calendar_local.scpt
use AppleScript version "2.4"
use scripting additions

on run argv
    try
        tell application "Microsoft Outlook"
            if not running then
                return ""
            end if
            
            -- Date range: Today + 3 days (Reduced for speed)
            set today to (current date)
            set time of today to 0
            set tomorrow to today + (3 * days)
            
            set outputList to {}
            set targetCal to missing value
            
            -- 1. Try to use ID passed directly from args
            if (count of argv) > 0 then
                set calId to item 1 of argv
                try
                    -- AppleScript IDs are sometimes integers, sometimes strings. 
                    -- Safest is to try getting it directly.
                    if (class of calId) is text then
                        try
                            set calId to calId as integer
                        end try
                    end if
                    set targetCal to calendar id calId
                on error
                    return "Error: Calendar ID " & calId & " not found"
                end try
            else
                -- 2. Fallback: Try "Calendar" (ID 432 is common but not guaranteed)
                try
                     -- Legacy fallback / Default behavior
                    set targetCal to calendar id 432
                on error
                    return "Error: No Calendar ID provided and default 432 not found."
                end try
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
                            if evtLoc is missing value then set evtLoc to ""
                        end try
                        
                        -- Clean text logic
                        set evtSubject to my cleanText(evtSubject)
                        set evtLoc to my cleanText(evtLoc)
                        
                        -- Format Date
                        set startIso to my dateToISO(evtStart)
                        set endIso to my dateToISO(evtEnd)
                        
                        -- Build Line: ID|||Subject|||Start|||End|||Location|||Body(Empty)
                        set lineItem to evtId & "|||" & evtSubject & "|||" & startIso & "|||" & endIso & "|||" & evtLoc & "|||" & ""
                        copy lineItem to end of outputList
                    end repeat
                on error errMsg
                     -- Log error 
                end try
            end if

            -- Join list
            set outputText to my joinList(outputList, "\n")
            return outputText
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run

-- Helper: clean text (remove newlines, pipes, tabs)
on cleanText(str)
    set str to str as string
    set str to my replaceString(str, "|", "-") -- Replace pipe with dash
    try
        set str to my replaceString(str, (character id 10), " ") -- Newline to space
    end try
    try
        set str to my replaceString(str, (character id 13), " ") -- CR to space
    end try
    try
        set str to my replaceString(str, (character id 9), " ") -- Tab to space
    end try
    return str
end cleanText

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
