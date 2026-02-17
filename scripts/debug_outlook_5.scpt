
tell application "Microsoft Outlook"
    set jsonList to {}
    log "Starting loop for 5 messages"
    repeat with i from 1 to 5
        -- NO OUTER TRY BLOCK
        log "Getting message " & i
        set msg to message i of inbox
            
        -- ID
        log "Getting ID"
        set msgId to "UNKNOWN"
        try
            set msgId to id of msg
        end try
        
        -- Subject
        log "Getting Subject"
        set msgSubject to "No Subject"
        try
            set msgSubject to subject of msg
        end try
        
        -- Sender
        log "Getting Sender"
        set msgSenderName to "Unknown Sender"
        try
            set msgSenderName to name of sender of msg
        end try
        
        set msgSenderAddress to ""
        try
             set msgSenderAddress to address of sender of msg
        end try
        
        set msgSender to msgSenderName & " <" & msgSenderAddress & ">"
        
        -- Content
        log "Getting Content"
        set msgContent to ""
        try
            set msgContent to plain text content of msg
            if msgContent is missing value then set msgContent to ""
        end try
        
        -- Date
        log "Getting Date"
        set msgDate to ""
        try
            set msgDate to time received of msg
        end try
        
        -- Escape JSON
        log "Escaping Subject"
        set msgSubject to my escapeJSON(msgSubject)
        
        log "Truncating Content"
        if (length of msgContent) > 300 then
            set msgContent to text 1 thru 300 of msgContent
        end if
        log "Escaping Content"
        set msgContent to my escapeJSON(msgContent)
        
        log "Building JSON Item"
        set jsonItem to "{\"id\": \"" & msgId & "\", \"subject\": \"" & msgSubject & "\", \"from\": \"" & msgSender & "\", \"date\": \"" & msgDate & "\", \"snippet\": \"" & msgContent & "\"}"
        copy jsonItem to end of jsonList
        
        log "Added item " & i
    end repeat
    
    set jsonString to "[" & (my joinList(jsonList, ",")) & "]"
    return jsonString
end tell

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
    try
        set str to my replaceString(str, (character id 9), "\\t")
    end try
    try
        set str to my replaceString(str, (character id 12), "\\f") -- Form Feed
    end try
    try
        set str to my replaceString(str, (character id 8), "\\b") -- Backspace
    end try
    return str
end escapeJSON

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
