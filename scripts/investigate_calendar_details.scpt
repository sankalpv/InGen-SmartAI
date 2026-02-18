use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            set output to "Detailed Calendar Properties:\n"
            set allCals to every calendar
            
            repeat with c in allCals
                set cId to (id of c)
                set cName to (name of c)
                
                output & "--------------------------------------------------\n"
                output & "ID: " & cId & "\n"
                output & "Name: " & cName & "\n"
                
                try
                    set cContainer to container of c
                    set output to output & "Container Name: " & (name of cContainer) & "\n"
                    set output to output & "Container Class: " & (class of cContainer) & "\n"
                     try
                        set accountObj to container of cContainer -- Attempt to go up one more level if it's a folder
                         set output to output & "Account Name? : " & (name of accountObj) & "\n"
                    end try
                on error
                    set output to output & "Container: Error or Missing Value\n"
                end try
                
            end repeat
            
            return output
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run
