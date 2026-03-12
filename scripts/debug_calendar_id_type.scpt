use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            set output to "Calendars found:\n"
            set allCals to every calendar
            
            repeat with c in allCals
                try
                    set cName to (name of c)
                on error
                    set cName to "N/A"
                end try
                set cId to (id of c)
                set cClass to (class of cId)
                set output to output & "- Name: " & cName & " | ID: " & cId & " | Class: " & cClass & "\n"
            end repeat
            
            return output
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run
