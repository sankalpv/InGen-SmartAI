use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            set targetCal to calendar id 13
            set props to properties of targetCal
            return props
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run
