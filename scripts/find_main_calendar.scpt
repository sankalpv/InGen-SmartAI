use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            set allCals to every calendar
            set foundCal to missing value
            
            -- Priority 1: Find a calendar named "Calendar" belonging to an Exchange account
            repeat with c in allCals
                if (name of c) is "Calendar" then
                    -- Check if it has an exchange ID (safest way to identify Exchange/Office365)
                    try
                        if (exchange id of c) is not missing value then
                            set foundCal to c
                            exit repeat
                        end if
                    on error
                        -- Ignore errors checking exchange id
                    end try
                end if
            end repeat
            
            -- Priority 2: If no Exchange calendar, find any calendar named "Calendar" that isn't empty?
            if foundCal is missing value then
                repeat with c in allCals
                    if (name of c) is "Calendar" then
                        set foundCal to c
                        exit repeat
                    end if
                end repeat
            end if
            
            if foundCal is not missing value then
                return "Found Calendar: " & (name of foundCal) & " | ID: " & (id of foundCal)
            else
                return "No suitable 'Calendar' found."
            end if
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run
