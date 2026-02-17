use AppleScript version "2.4"
use scripting additions

on run argv
    set limitVal to 20
    if (count of argv) > 0 then
        try
            set limitVal to (item 1 of argv) as integer
        end try
    end if
    
    set jsonList to {}
    
    tell application "Microsoft Outlook"
        try
            -- Get the Inbox folder of the default account
            set theAccount to default account
            set theInbox to folder "Inbox" of theAccount
            
            -- Get all messages (references)
            set allMsgs to every message of theInbox
            
            -- Sort by time received (descending) is hard in AS. 
            -- Instead, just take the last N messages (assuming new ones are appended/indexed last)
            -- OR iterate backwards.
            
            set msgCount to count of allMsgs
            
            if msgCount is 0 then
                return "[]"
            end if
            
            -- Debugging Sort Order:
            -- Previous attempt (End -> backwards) gave 2023 emails.
            -- Let's try Start -> forward (1 to limit). Maybe Outlook returns Newest first?
            
            set loopEnd to limitVal
            if loopEnd > msgCount then set loopEnd to msgCount
            
            repeat with i from 1 to loopEnd
                try
                    set theMsg to item i of allMsgs
                    
                    set msgId to (id of theMsg) as string
                    set msgSubject to subject of theMsg
                    set msgContent to plain text content of theMsg
                    -- User requested not to cut off emails. Increasing limit significantly.
                    if length of msgContent > 5000 then
                        set msgSnippet to text 1 thru 5000 of msgContent
                    else
                        set msgSnippet to msgContent
                    end if
                    
                    set msgDate to time received of theMsg
                    set isoDate to (my dateToISO(msgDate))
                    
                    set msgSender to sender of theMsg
                    set senderName to name of msgSender
                    set senderAddress to address of msgSender
                    
                    set jsonItem to "{\"id\": \"" & msgId & "\", \"subject\": " & (my jsonEscape(msgSubject)) & ", \"snippet\": " & (my jsonEscape(msgSnippet)) & ", \"from\": {\"name\": " & (my jsonEscape(senderName)) & ", \"email\": " & (my jsonEscape(senderAddress)) & "}, \"date\": \"" & isoDate & "\", \"source\": \"outlook\"}"
                    copy jsonItem to end of jsonList
                on error errMsg
                    -- log "Error on msg " & i & ": " & errMsg
                end try
            end repeat
            
        on error errMsg
            return "[{\"error\": \"" & (my jsonEscape(errMsg)) & "\"}]"
        end try
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

-- Helper: JSON Escape
on jsonEscape(str)
    set str to str as text
    if str is missing value then return "null"
    
    -- 1. Escape Backslashes first
    set AppleScript's text item delimiters to "\\"
    set str to text items of str
    set AppleScript's text item delimiters to "\\\\"
    set str to str as text
    
    -- 2. Escape Double Quotes
    set AppleScript's text item delimiters to "\""
    set str to text items of str
    set AppleScript's text item delimiters to "\\\""
    set str to str as text
    
    -- 3. Escape Newlines (CR and LF)
    set AppleScript's text item delimiters to string id 10 -- LF
    set str to text items of str
    set AppleScript's text item delimiters to "\\n"
    set str to str as text
    
    set AppleScript's text item delimiters to string id 13 -- CR
    set str to text items of str
    set AppleScript's text item delimiters to "\\r"
    set str to str as text
    
    -- 4. Escape Tabs
    set AppleScript's text item delimiters to string id 9 -- Tab
    set str to text items of str
    set AppleScript's text item delimiters to "\\t"
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
