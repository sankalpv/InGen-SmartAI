use AppleScript version "2.4"
use scripting additions

on run
    try
        tell application "Microsoft Outlook"
            set output to "Outlook Accounts and Calendars:\n"
            
            -- Exchange Accounts
            set output to output & "\n--- Exchange Accounts ---\n"
            set excAccounts to every exchange account
            repeat with acc in excAccounts
                set accName to (name of acc)
                set output to output & "Account: " & accName & "\n"
                
                try
                    set accCals to every calendar of acc
                    repeat with c in accCals
                        set output to output & "  - Calendar: " & (name of c) & " (ID: " & (id of c) & ")\n"
                    end repeat
                on error
                    set output to output & "  (Error listing calendars)\n"
                end try
            end repeat
            
            -- Imap Accounts
            set output to output & "\n--- IMAP Accounts ---\n"
            set imapAccounts to every imap account
            repeat with acc in imapAccounts
                set accName to (name of acc)
                set output to output & "Account: " & accName & "\n"
                -- IMAP usually doesn't have calendars in Outlook Mac the same way, but let's check
                try
                    set accCals to every calendar of acc
                    repeat with c in accCals
                        set output to output & "  - Calendar: " & (name of c) & " (ID: " & (id of c) & ")\n"
                    end repeat
                on error
                     -- Ignore
                end try
            end repeat

            return output
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run
