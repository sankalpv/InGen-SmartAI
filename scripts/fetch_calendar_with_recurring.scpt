-- fetch_calendar_with_recurring.scpt
-- Enhanced version that also captures recurring event masters for expansion
use AppleScript version "2.4"
use scripting additions

on run argv
    try
        tell application "Microsoft Outlook"
            if not running then
                return ""
            end if
            
            set today to (current date)
            set time of today to 0
            
            -- Get lookback days from second argument (default 7)
            set lookbackDays to 7
            if (count of argv) > 1 then
                try
                    set lookbackDays to (item 2 of argv) as integer
                end try
            end if
            
            -- Get forward days from third argument (default 3)
            set forwardDays to 3
            if (count of argv) > 2 then
                try
                    set forwardDays to (item 3 of argv) as integer
                end try
            end if
            
            set startDate to today - (lookbackDays * days)
            set endDate to today + (forwardDays * days)
            
            set outputList to {}
            set targetCal to missing value
            
            if (count of argv) > 0 then
                set calId to item 1 of argv
                try
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
                try
                    set targetCal to calendar id 432
                on error
                    return "Error: No Calendar ID provided"
                end try
            end if

            if targetCal is not missing value then
                -- PHASE 1: Get events in date range (non-recurring + some recurring)
                try
                    set theEvents to (every calendar event of targetCal whose start time > startDate and start time < endDate)
                    
                    repeat with evt in theEvents
                        set lineItem to my formatEvent(evt, "normal")
                        if lineItem is not "" then
                            copy lineItem to end of outputList
                        end if
                    end repeat
                on error errMsg
                    -- Continue to phase 2
                end try

                -- PHASE 2: Get recurring events whose master start is BEFORE our range
                -- Only include BUSY events from last 1 year to reduce noise
                try
                    set oneYearAgo to today - (365 * days)
                    set recurringEvts to (every calendar event of targetCal whose is recurring is true and start time < startDate and start time > oneYearAgo and free busy status is busy)
                    
                    repeat with evt in recurringEvts
                        try
                            -- Get recurrence info
                            set evtStart to start time of evt
                            set evtEnd to end time of evt
                            set evtSubject to subject of evt
                            
                            -- Calculate duration
                            set evtDuration to (evtEnd - evtStart)
                            
                            -- Get day of week of the master event (1=Sun, 2=Mon, etc.)
                            set evtDayOfWeek to weekday of evtStart
                            
                            -- Skip free/cancelled events (only expand busy/tentative)
                            set evtBusy to "busy"
                            try
                                set evtBusy to (free busy status of evt) as string
                            end try
                            if evtBusy is not "free" then
                                -- Check each day in our range to see if this recurring event falls on it
                                set checkDate to startDate
                                repeat while checkDate < endDate
                                    if weekday of checkDate = evtDayOfWeek then
                                        -- This day matches the recurring event's day of week
                                        -- Create a virtual occurrence
                                        set occurrenceStart to checkDate + (time of evtStart)
                                        set occurrenceEnd to occurrenceStart + evtDuration
                                        
                                        -- Only include if within range
                                        if occurrenceStart > startDate and occurrenceStart < endDate then
                                            set lineItem to my formatEventManual(evt, occurrenceStart, occurrenceEnd)
                                            if lineItem is not "" then
                                                copy lineItem to end of outputList
                                            end if
                                        end if
                                    end if
                                    set checkDate to checkDate + 1 * days
                                end repeat
                            end if
                        on error
                            -- Skip problematic recurring events
                        end try
                    end repeat
                on error errMsg
                    -- Phase 2 failed, continue with phase 1 results
                end try
            end if

            set outputText to my joinList(outputList, "\n")
            return outputText
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run

on formatEvent(evt, evtType)
    tell application "Microsoft Outlook"
        try
            set evtId to (id of evt) as string
            set evtSubject to (subject of evt)
            set evtStart to (start time of evt)
            set evtEnd to (end time of evt)
            
            set evtLoc to ""
            try
                set evtLoc to (location of evt)
                if evtLoc is missing value then set evtLoc to ""
            end try
            
            set busyStatus to "busy"
            try
                set busyStatus to (free busy status of evt) as string
            end try
            
            set attendeeCount to 0
            try
                set attendeeCount to count of (attendees of evt)
            end try
            
            set evtSubject to my cleanText(evtSubject)
            set evtLoc to my cleanText(evtLoc)
            
            set startIso to my dateToISO(evtStart)
            set endIso to my dateToISO(evtEnd)
            
            return evtId & "|||" & evtSubject & "|||" & startIso & "|||" & endIso & "|||" & evtLoc & "|||" & "" & "|||" & busyStatus & "|||" & attendeeCount
        on error
            return ""
        end try
    end tell
end formatEvent

on formatEventManual(evt, occStart, occEnd)
    tell application "Microsoft Outlook"
        try
            set evtId to (id of evt) as string
            set evtSubject to (subject of evt)
            
            set evtLoc to ""
            try
                set evtLoc to (location of evt)
                if evtLoc is missing value then set evtLoc to ""
            end try
            
            set busyStatus to "busy"
            try
                set busyStatus to (free busy status of evt) as string
            end try
            
            set attendeeCount to 0
            try
                set attendeeCount to count of (attendees of evt)
            end try
            
            set evtSubject to my cleanText(evtSubject)
            set evtLoc to my cleanText(evtLoc)
            
            set startIso to my dateToISO(occStart)
            set endIso to my dateToISO(occEnd)
            
            -- Use R prefix on ID to indicate this is a recurring expansion
            return "R" & evtId & "|||" & evtSubject & "|||" & startIso & "|||" & endIso & "|||" & evtLoc & "|||" & "" & "|||" & busyStatus & "|||" & attendeeCount
        on error
            return ""
        end try
    end tell
end formatEventManual

on cleanText(str)
    set str to str as string
    set str to my replaceString(str, "|", "-")
    try
        set str to my replaceString(str, (character id 10), " ")
    end try
    try
        set str to my replaceString(str, (character id 13), " ")
    end try
    try
        set str to my replaceString(str, (character id 9), " ")
    end try
    return str
end cleanText

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