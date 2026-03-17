# Enumerate ALL calendar folders in Outlook (including shared/secondary calendars)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $outlook = New-Object -ComObject Outlook.Application
    $ns = $outlook.GetNamespace("MAPI")
    
    Write-Output "=== Default Calendar ==="
    $defaultCal = $ns.GetDefaultFolder(9)
    Write-Output "  Name: $($defaultCal.Name)"
    Write-Output "  Items: $($defaultCal.Items.Count)"
    Write-Output "  EntryID: $($defaultCal.EntryID.Substring(0, 40))..."
    Write-Output ""
    
    Write-Output "=== All Stores (Accounts) ==="
    foreach ($store in $ns.Stores) {
        Write-Output "Store: $($store.DisplayName)"
        try {
            $root = $store.GetRootFolder()
            # Recursively find calendar folders
            function Find-CalendarFolders($folder, $depth) {
                $prefix = "  " * $depth
                try {
                    # Check if this folder is a calendar type (olFolderCalendar = 9)
                    if ($folder.DefaultItemType -eq 1) { # olAppointmentItem
                        $count = $folder.Items.Count
                        Write-Output "$prefix📅 $($folder.Name) ($count items) [EntryID: $($folder.EntryID.Substring(0, 30))...]"
                    }
                } catch { }
                
                try {
                    foreach ($sub in $folder.Folders) {
                        Find-CalendarFolders $sub ($depth + 1)
                    }
                } catch { }
            }
            Find-CalendarFolders $root 1
        } catch {
            Write-Output "  Error accessing store: $($_.Exception.Message)"
        }
        Write-Output ""
    }
    
    Write-Output "=== Outlook Version Info ==="
    Write-Output "Outlook Version: $($outlook.Version)"
    Write-Output "Product Code: $($outlook.ProductCode)"
    
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
