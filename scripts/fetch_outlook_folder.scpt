use AppleScript version "2.4"
use scripting additions

on run argv
    set folderName to "Inbox"
    set limitVal to 50
    
    if (count of argv) > 0 then
        try
            set folderName to (item 1 of argv)
        end try
    end if
    
    if (count of argv) > 1 then
        try
            set limitVal to (item 2 of argv) as integer
        end try
    end if
    
    set jsonList to {}
    
    tell application "Microsoft Outlook"
        with timeout of 600 seconds
            try
                set theAccount to default account
            
            -- Dynamic Folder Selection (supports paths like "Inbox/Issues")
            if folderName contains "/" then
                -- Path-based navigation: split by "/" and traverse
                set AppleScript's text item delimiters to "/"
                set pathParts to text items of folderName
                set AppleScript's text item delimiters to ""
                
                -- Start from the first folder
                try
                    set theFolder to folder (item 1 of pathParts) of theAccount
                on error
                    -- Try inbox() shortcut if first part is "Inbox"
                    if (item 1 of pathParts) is "Inbox" then
                        set theFolder to inbox of theAccount
                    else
                        return "[{\"error\": \"Folder '" & (item 1 of pathParts) & "' not found\"}]"
                    end if
                end try
                
                -- Navigate deeper through subfolders
                repeat with i from 2 to (count of pathParts)
                    try
                        set theFolder to mail folder (item i of pathParts) of theFolder
                    on error
                        return "[{\"error\": \"Subfolder '" & (item i of pathParts) & "' not found in path '" & folderName & "'\"}]"
                    end try
                end repeat
            else if folderName is "Inbox" then
                set theFolder to folder "Inbox" of theAccount
            else if folderName is "Sent" or folderName is "Sent Items" then
                try
                    set theFolder to folder "Sent Items" of theAccount
                on error
                    try
                        set theFolder to folder "Sent" of theAccount
                    on error
                         return "[{\"error\": \"Could not find Sent Items folder\"}]"
                    end try
                end try
            else
                -- Try generic name at top level
                try
                    set theFolder to folder folderName of theAccount
                on error
                    -- Also try as a subfolder of inbox (common pattern)
                    try
                        set theFolder to mail folder folderName of (inbox of theAccount)
                    on error
                        return "[{\"error\": \"Folder '" & folderName & "' not found (checked top-level and Inbox subfolders)\"}]"
                    end try
                end try
            end if
            
            set allMsgs to every message of theFolder
            set msgCount to count of allMsgs
            
            if msgCount is 0 then
                return "[]"
            end if
            
            -- Limit logic
            set loopEnd to limitVal
            if loopEnd > msgCount then set loopEnd to msgCount
            
            -- Iterate (assuming 1 is newest, based on previous findings)
            repeat with i from 1 to loopEnd
                try
                    set theMsg to item i of allMsgs
                    
                    set msgId to (id of theMsg) as string
                    set msgSubject to subject of theMsg
                    set msgContent to plain text content of theMsg
                    
                    -- Truncate at 8000 chars for vector store (approx 2000 tokens)
                    if length of msgContent > 8000 then
                        set msgSnippet to text 1 thru 8000 of msgContent
                    else
                        set msgSnippet to msgContent
                    end if
                    
                    set msgDate to time received of theMsg
                    set isoDate to (my dateToISO(msgDate))
                    
                    set msgSender to sender of theMsg
                    set senderName to name of msgSender
                    set senderAddress to address of msgSender
                    
                    -- Get Recipients (To/CC) - Important for "Sent" items to know who we talked to
                    set recipStr to ""
                    try
                         set recips to to recipients of theMsg
                         repeat with r in recips
                            set recipStr to recipStr & (address of r) & "; "
                         end repeat
                    end try
                    
                    set jsonItem to "{\"id\": \"" & msgId & "\", \"subject\": " & (my jsonEscape(msgSubject)) & ", \"body\": " & (my jsonEscape(msgSnippet)) & ", \"sender\": {\"name\": " & (my jsonEscape(senderName)) & ", \"email\": " & (my jsonEscape(senderAddress)) & "}, \"recipients\": " & (my jsonEscape(recipStr)) & ", \"date\": \"" & isoDate & "\", \"folder\": \"" & folderName & "\"}"
                    copy jsonItem to end of jsonList
                on error errMsg
                    -- log "Error on msg " & i & ": " & errMsg
                end try
            end repeat
            
            on error errMsg
                return "[{\"error\": \"" & (my jsonEscape(errMsg)) & "\"}]"
            end try
        end timeout
    end tell
    
    -- Join to JSON
    set jsonString to "["
    set firstItem to true
    repeat with itemStr in jsonList
        if not firstItem then set jsonString to jsonString & ","
        set jsonString to jsonString & itemStr
        set firstItem to false
    end repeat
    set jsonString to jsonString & "]"
    
    return jsonString
end run

-- Helper: JSON Escape (Robust)
on jsonEscape(str)
    set str to str as text
    if str is missing value then return "null"
    
    set AppleScript's text item delimiters to "\\"
    set str to text items of str
    set AppleScript's text item delimiters to "\\\\"
    set str to str as text
    
    set AppleScript's text item delimiters to "\""
    set str to text items of str
    set AppleScript's text item delimiters to "\\\""
    set str to str as text
    
    set AppleScript's text item delimiters to string id 10 -- LF
    set str to text items of str
    set AppleScript's text item delimiters to "\\n"
    set str to str as text
    
    set AppleScript's text item delimiters to string id 13 -- CR
    set str to text items of str
    set AppleScript's text item delimiters to "\\r"
    set str to str as text
    
    set AppleScript's text item delimiters to string id 9 -- Tab
    set str to text items of str
    set AppleScript's text item delimiters to "\\t"
    set str to str as text
    
    -- 5. Escape other control characters (0x00-0x1F) by removing them or replacing
    -- AppleScript doesn't have regex, so we just hope the above covers common ones.
    -- For robustness, we can try to filter out bad chars if we loop, but that's slow.
    -- Instead, let's just be very careful with the common ones.
    -- Ensure we didn't miss Form Feed (12) or Vertical Tab (11)
    
    set AppleScript's text item delimiters to string id 12 -- Form Feed
    set str to text items of str
    set AppleScript's text item delimiters to "\\f"
    set str to str as text
    
    set AppleScript's text item delimiters to string id 11 -- Vertical Tab
    set str to text items of str
    set AppleScript's text item delimiters to " "
    set str to str as text
    
    set AppleScript's text item delimiters to string id 8 -- Backspace
    set str to text items of str
    set AppleScript's text item delimiters to "\\b"
    set str to str as text
    
    return "\"" & str & "\""
end jsonEscape

-- Helper: Date to ISO
on dateToISO(d)
    set y to year of d
    set m to month of d as integer
    set dayVal to day of d
    set t to time of d
    
    if m < 10 then set m to "0" & m
    if dayVal < 10 then set dayVal to "0" & dayVal
    
    return (y as text) & "-" & (m as text) & "-" & (dayVal as text) & "T" & (my secondsToTime(t)) & "Z"
end dateToISO

on secondsToTime(s)
    set h to s div 3600
    set r to s mod 3600
    set m to r div 60
    set s to r mod 60
    
    if h < 10 then set h to "0" & h
    if m < 10 then set m to "0" & m
    if s < 10 then set s to "0" & s
    
    return (h as text) & ":" & (m as text) & ":" & (s as text)
end secondsToTime
