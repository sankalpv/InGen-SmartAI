# fetch_emails_incremental.ps1
# Arguments: [LastSyncTimestamp]
# Example: .\fetch_emails_incremental.ps1 "2023-10-27T10:00:00.000Z"

param (
    [string]$LastSyncTimestamp
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    # Parse Timestamp
    $sinceDate = Get-Date -Date $LastSyncTimestamp
    
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $inbox = $namespace.GetDefaultFolder(6) # olFolderInbox
    
    # Restrict is faster than iterating all, but format is tricky.
    # We'll use iteration with a filter for simplicity and robustness like other scripts, 
    # but since we need "Newer than X", we can sort desc and stop when we hit older.
    
    $items = $inbox.Items
    $items.Sort("[ReceivedTime]", $true) # Descending (Newest first)

    $newMessages = @()
    $limit = 50 # Batch limit to prevent overload

    foreach ($item in $items) {
        if ($newMessages.Count -ge $limit) { break }

        # Check MailItem
        if ($item.Class -eq 43) { 
            try {
                $received = $item.ReceivedTime
                
                # Compare Dates
                if ($received -le $sinceDate) {
                    # We reached emails older than our sync time, stop.
                    break
                }
                
                $id = $item.EntryID
                $subject = $item.Subject
                $body = $item.Body
                
                # Sender
                $senderName = "Unknown"
                try { $senderName = $item.SenderName } catch {} # property is SenderName usually
                
                # Clean up body if needed or just pass valid string
                
                $msgObj = @{
                    id = $id
                    subject = $subject
                    sender = $senderName
                    body = $body
                    received = $received.ToString("yyyy-MM-ddTHH:mm:ss.000Z") # ISO-ish
                }
                
                $newMessages += $msgObj
            } catch {
                # Skip bad item
            }
        }
    }
    
    $newMessages | ConvertTo-Json -Depth 2 -Compress

} catch {
    # On top level error, return empty array or error object?
    # Mac script returns error object if Outlook not running.
    # We'll return empty array to be safe for now, or error struct.
    # Background agent handles "error" property.
    
    $err = @{ error = $_.Exception.Message }
    $err | ConvertTo-Json -Compress
}
