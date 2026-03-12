-- fetch_outlook.scpt
-- Fetches the last N emails from Microsoft Outlook and returns them as JSON

use AppleScript version "2.4" -- Yosemite (10.10) or later
use scripting additions

on run argv
    try
        set emailCount to 10
        if (count of argv) > 0 then
            set emailCount to (item 1 of argv) as integer
        end if
        
        tell application "Microsoft Outlook"
            if not running then
                return "{\"error\": \"Outlook is not running\"}"
            end if
            
            set jsonList to {}
            
            repeat with i from 1 to emailCount
                try
                    set msg to message i of inbox
                    
                    -- ID
                    set msgId to "UNKNOWN"
                    try
                        set msgId to id of msg
                    end try
                    
                    -- Subject
                    set msgSubject to "No Subject"
                     try
                        set msgSubject to subject of msg
                    end try

                    -- Sender
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
                    set msgContent to ""
                    try
                        set msgContent to plain text content of msg
                        if msgContent is missing value then set msgContent to ""
                    end try
                    
                    -- Date
                    set msgDate to ""
                    try
                        set msgDate to time received of msg
                    end try

                    -- Escape JSON
                    set msgSubject to my escapeJSON(msgSubject)
                    
                    if (length of msgContent) > 300 then
                        set msgContent to text 1 thru 300 of msgContent
                    end if
                    set msgContent to my escapeJSON(msgContent)
                    
                    set jsonItem to "{\"id\": \"" & msgId & "\", \"subject\": \"" & msgSubject & "\", \"from\": \"" & msgSender & "\", \"date\": \"" & msgDate & "\", \"snippet\": \"" & msgContent & "\"}"
                    copy jsonItem to end of jsonList
                on error e
                    -- Skip if unexpected fatal error
                end try
            end repeat
            
            set jsonString to "[" & (my joinList(jsonList, ",")) & "]"
            return jsonString
        end tell
    on error errMsg
        return "{\"error\": \"" & (my escapeJSON(errMsg)) & "\"}"
    end try
end run

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

-- Helper to join list
on joinList(theList, delimiter)
    set AppleScript's text item delimiters to delimiter
    set theString to theList as string
    set AppleScript's text item delimiters to ""
    return theString
end joinList

-- Helper for min
on min(x, y)
    if x < y then
        return x
    else
        return y
    end if
end min

-- Helper to replace substrings
on replaceString(theText, oldString, newString)
    set AppleScript's text item delimiters to oldString
    set theTextItems to text items of theText
    set AppleScript's text item delimiters to newString
    set theText to theTextItems as string
    set AppleScript's text item delimiters to ""
    return theText
end replaceString
