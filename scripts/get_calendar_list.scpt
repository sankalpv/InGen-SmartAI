use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            if not running then
                return "[]"
            end if
            
            set jsonOutput to "["
            set allCals to every calendar
            set isFirst to true
            
            repeat with c in allCals
                set cId to (id of c)
                set cName to (name of c)
                set accName to "Unknown Account"
                
                try
                    -- Try to get the account name (container's container usually)
                    -- This hierarchy can be tricky in Outlook scripting
                    if class of (container of c) is exchange account then
                        set accName to name of (container of c)
                    else if class of (container of c) is imap account then
                         set accName to name of (container of c)
                    else
                         -- Try going up one level if it's in a folder
                         try
                            set parentObj to container of c
                            if class of parentObj is mail folder then
                                set accName to name of (container of parentObj)
                            end if
                         end try
                    end if
                on error
                    set accName to "Local / On My Computer"
                end try
                
                if isFirst then
                    set isFirst to false
                else
                    set jsonOutput to jsonOutput & ","
                end if
                
                set jsonOutput to jsonOutput & "{\"id\": " & cId & ", \"name\": \"" & cName & "\", \"account\": \"" & accName & "\"}"
            end repeat
            
            set jsonOutput to jsonOutput & "]"
            return jsonOutput
        end tell
    on error errMsg
        return "[]" -- Return empty array on error to be safe
    end try
end run
