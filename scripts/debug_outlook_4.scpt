
tell application "Microsoft Outlook"
    set jsonList to {}
    log "Starting loop for 5 messages"
    repeat with i from 1 to 5
        try
            set msg to message i of inbox
            log "Got message " & i
            
            set msgId to "UNKNOWN"
            try
                set msgId to id of msg
            end try
            
            -- Only include ID for now
            set jsonItem to "{\"id\": \"" & msgId & "\"}"
            copy jsonItem to end of jsonList
        on error e
            log "Error in loop " & i & ": " & e
        end try
    end repeat
    
    set jsonString to "[" & (my joinList(jsonList, ",")) & "]"
    return jsonString
end tell

on joinList(theList, delimiter)
    set oldDelims to AppleScript's text item delimiters
    set AppleScript's text item delimiters to delimiter
    set theString to theList as string
    set AppleScript's text item delimiters to oldDelims
    return theString
end joinList
