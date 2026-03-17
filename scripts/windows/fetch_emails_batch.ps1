# fetch_emails_batch.ps1
# Fetches emails from Inbox and Sent Items with offset/limit support
# Arguments: [Limit] [Offset]
# Equivalent to fetch_outlook_ui_optimized.js (JXA) for Windows
param (
    [int]$Limit = 20,
    [int]$Offset = 0
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")

    $messages = @()

    # --- Inbox (75% of quota) ---
    $inboxLimit = [Math]::Floor($Limit * 0.75)
    $inboxOffset = [Math]::Floor($Offset * 0.75)

    try {
        $inbox = $namespace.GetDefaultFolder(6) # olFolderInbox
        $inboxItems = $inbox.Items
        $inboxItems.Sort("[ReceivedTime]", $true) # Descending (newest first)

        $inboxCount = $inboxItems.Count
        $inboxEnd = [Math]::Min($inboxOffset + $inboxLimit, $inboxCount)

        for ($i = $inboxOffset + 1; $i -le $inboxEnd; $i++) {
            try {
                $item = $inboxItems.Item($i)
                if ($item.Class -ne 43) { continue } # olMail only

                $id = $item.EntryID
                $subject = $item.Subject
                if ($null -eq $subject) { $subject = "(No Subject)" }
                $received = $item.ReceivedTime.ToString("yyyy-MM-ddTHH:mm:ss")

                $senderName = "Unknown"
                $senderEmail = ""
                try {
                    $sender = $item.Sender
                    if ($null -ne $sender) {
                        $senderName = $sender.Name
                        $senderEmail = $sender.Address
                    }
                } catch { }

                $body = ""
                $snippet = ""
                try {
                    $body = $item.Body
                    if ($null -ne $body) {
                        if ($body.Length -gt 50000) { $body = $body.Substring(0, 50000) }
                        if ($body.Length -gt 200) { $snippet = $body.Substring(0, 200) } else { $snippet = $body }
                    }
                } catch { }

                $messages += @{
                    id      = $id
                    subject = $subject
                    from    = "$senderName <$senderEmail>"
                    date    = $received
                    snippet = $snippet
                    body    = $body
                    folder  = "Inbox"
                    isSent  = $false
                }
            } catch {
                # Skip problematic message
            }
        }
    } catch {
        # Inbox fetch failed, continue to Sent Items
    }

    # --- Sent Items (25% of quota) ---
    $sentLimit = $Limit - $messages.Count  # Use remaining quota
    $sentOffset = [Math]::Floor($Offset * 0.25)

    try {
        $sentFolder = $namespace.GetDefaultFolder(5) # olFolderSentMail
        $sentItems = $sentFolder.Items
        $sentItems.Sort("[SentOn]", $true) # Descending (newest first)

        $sentCount = $sentItems.Count
        $sentEnd = [Math]::Min($sentOffset + $sentLimit, $sentCount)

        for ($i = $sentOffset + 1; $i -le $sentEnd; $i++) {
            try {
                $item = $sentItems.Item($i)
                if ($item.Class -ne 43) { continue } # olMail only

                $id = $item.EntryID
                $subject = $item.Subject
                if ($null -eq $subject) { $subject = "(No Subject)" }
                $sentDate = $item.SentOn.ToString("yyyy-MM-ddTHH:mm:ss")

                # For sent emails, get recipient
                $recipientName = "Unknown"
                $recipientEmail = ""
                try {
                    $recips = $item.Recipients
                    if ($recips.Count -gt 0) {
                        $recipientName = $recips.Item(1).Name
                        $recipientEmail = $recips.Item(1).Address
                    }
                } catch { }

                $body = ""
                $snippet = ""
                try {
                    $body = $item.Body
                    if ($null -ne $body) {
                        if ($body.Length -gt 50000) { $body = $body.Substring(0, 50000) }
                        if ($body.Length -gt 200) { $snippet = $body.Substring(0, 200) } else { $snippet = $body }
                    }
                } catch { }

                $messages += @{
                    id      = $id
                    subject = $subject
                    to      = "$recipientName <$recipientEmail>"
                    date    = $sentDate
                    snippet = $snippet
                    body    = $body
                    folder  = "Sent Items"
                    isSent  = $true
                }
            } catch {
                # Skip problematic message
            }
        }
    } catch {
        # Sent Items fetch failed
    }

    # Sort by date descending and output as JSON
    $sorted = $messages | Sort-Object { [DateTime]$_.date } -Descending
    $sorted | ConvertTo-Json -Depth 3 -Compress

} catch {
    Write-Output "[]"
    exit 0
}
