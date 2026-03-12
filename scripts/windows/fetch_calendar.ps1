# fetch_calendar.ps1
# Arguments: [CalendarEntryID]
param (
    [string]$CalendarId = ""
)

$ErrorActionPreference = "Stop"
# Output encoding force utf8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    
    $folder = $null

    if ($CalendarId -ne "" -and $CalendarId -ne "432") {
        try {
            $folder = $namespace.GetFolderFromID($CalendarId)
        } catch {
            Write-Error "Folder not found by ID. Falling back to default."
        }
    }

    if ($null -eq $folder) {
        $folder = $namespace.GetDefaultFolder(9) # olFolderCalendar
    }

    $items = $folder.Items
    $items.Sort("[Start]")
    $items.IncludeRecurrences = $true

    # Date Range: Today to Today + 3 days
    $today = (Get-Date).Date
    $endParams = $today.AddDays(3)
    
    # Restrict string format: [Start] >= 'dd/mm/yyyy 00:00' AND [End] <= '...'
    # Outlook filter format depends on system locale, which is PAINFUL.
    # Safer to iterate explicit range or use specific format if possible.
    # We will use the IncludeRecurrences=true and iterate, stopping when exceeding range.
    # This is safer for international dates than .Restrict() strings.

    $outputList = @()

    # Find the starting point (can utilize Find/FindNext for optimization, but iteration is robust)
    # Actually, simplistic iteration is best for reliability over date formats
    
    foreach ($item in $items) {
        # Check if item is an Appointment
        if ($item.MessageClass -match "IPM.Appointment") {
            try {
                $start = $item.Start
                # Filter
                if ($start -ge $today -and $start -lt $endParams) {
                    
                    $id = $item.EntryID
                    $subject = $item.Subject
                    
                    # Clean text
                    if ($null -ne $subject) {
                        $subject = $subject -replace "\|", "-" -replace "`r", " " -replace "`n", " "
                    } else {
                        $subject = "Untitled"
                    }

                    $loc = $item.Location
                    if ($null -ne $loc) {
                        $loc = $loc -replace "\|", "-" -replace "`r", " " -replace "`n", " "
                    } else {
                        $loc = ""
                    }

                    # ISO Dates
                    $startIso = $start.ToString("yyyy-MM-ddTHH:mm:ss")
                    $endIso = $item.End.ToString("yyyy-MM-ddTHH:mm:ss")

                    # Output Format: ID|||Subject|||Start|||End|||Location|||Body
                    $line = "$id|||$subject|||$startIso|||$endIso|||$loc|||"
                    $outputList += $line
                }
                
                # Optimization: Since sorted by Start, if start > endParams, break
                if ($start -gt $endParams) {
                    break
                }
            } catch {
                # Skip invalid item
            }
        }
    }

    $outputList -join "`n"

} catch {
    # Write-Error $_.Exception.Message
    # Output nothing on error to match mac behavior behavior (empty string)
    exit 0
}
