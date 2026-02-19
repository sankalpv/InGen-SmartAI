# get_calendars.ps1
# Lists all Calendar folders in Outlook

$ErrorActionPreference = "Stop"

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $calendars = @()

    # Recursive function to find calendar folders
    function Get-CalendarFolders($folder) {
        foreach ($sub in $folder.Folders) {
            # olFolderCalendar = 9
            if ($sub.DefaultItemType -eq 9) {
                # Attempt to get account name (Store DisplayName)
                $accountName = "Unknown"
                try {
                    $accountName = $sub.Store.DisplayName
                } catch {
                    $accountName = "Local / PST"
                }

                $calObj = @{
                    id = $sub.EntryID
                    name = $sub.Name
                    account = $accountName
                }
                $script:calendars += $calObj
            }
            
            # Recurse (limit depth if needed, but usually fine)
            try {
                if ($sub.Folders.Count -gt 0) {
                    Get-CalendarFolders $sub
                }
            } catch {
                # Permission errors on some folders
            }
        }
    }

    # Start with all Stores (Accounts)
    foreach ($store in $namespace.Stores) {
        try {
            $root = $store.GetRootFolder()
            Get-CalendarFolders $root
        } catch {
            # Skip stores we can't open
        }
    }
    
    # If no calendars found via iteration (rare), try default
    if ($calendars.Count -eq 0) {
        try {
            $defaultCal = $namespace.GetDefaultFolder(9) # olFolderCalendar
            $calObj = @{
                id = $defaultCal.EntryID
                name = $defaultCal.Name
                account = "Default"
            }
            $calendars += $calObj
        } catch {
            # No default calendar?
        }
    }

    # Output JSON
    $calendars | ConvertTo-Json -Depth 2 -Compress
} catch {
    Write-Output "[]"
    exit 0
}
