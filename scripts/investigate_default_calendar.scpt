use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            set output to "Outlook Application Properties:\n"
            
            -- Check if there's a default calendar property on the app
            try
                set defCal to default calendar
                set output to output & "Default Calendar Name: " & (name of defCal) & " | ID: " & (id of defCal) & "\n"
            on error
                set output to output & "Application 'default calendar' property not found.\n"
            end try
            
            set output to output & "\nIterating all calendars:\n"
            set allCals to every calendar
            
            repeat with c in allCals
                set cName to (name of c)
                set cId to (id of c)
                set cAccount to "N/A"
                try
                    set cAccount to (name of (container of c))
                end try
                
                set output to output & "Name: " & cName & " | ID: " & cId & " | Container: " & cAccount & "\n"
            end repeat
            
            return output
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run
