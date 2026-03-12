use AppleScript version "2.4"
use scripting additions

on run
    log "Starting Diagnosis..."
    
    set startTime to (current date)
    
    tell application "Microsoft Outlook"
        if not running then
            return "Outlook not running"
        end if
        
        log "Listing all calendars..."
        set allCals to every calendar
        log "Count: " & (count of allCals)
        
        repeat with c in allCals
            try
                set cName to name of c
                set cId to id of c
                log "Cal: " & cName & " (ID: " & cId & ")"
                
                if cId is 432 then
                     log "Fetching events for " & cName & "..."
                     set evts to (every calendar event of c whose start time > (current date) and start time < ((current date) + 1 * days))
                     log "Event Count: " & (count of evts)
                     
                     repeat with e in evts
                        log "Fetching event: " & (subject of e)
                        try
                            set b to (plain text content of e)
                            log "Body length: " & (length of b)
                        on error
                             log "Error fetching body"
                        end try
                     end repeat
                end if
            on error errMsg
                log "Error accessing cal: " & errMsg
            end try
        end repeat
        
    end tell
    
    set endTime to (current date)
    log "Finished in " & (endTime - startTime) & " seconds."
    return "Done"
end run
