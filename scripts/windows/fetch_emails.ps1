# fetch_emails.ps1
# Arguments: [Count]
param (
    [int]$Limit = 20
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $inbox = $namespace.GetDefaultFolder(6) # olFolderInbox
    
    $items = $inbox.Items
    $items.Sort("[ReceivedTime]", $true) # Descending

    $messages = @()
    $count = 0

    foreach ($item in $items) {
        if ($count -ge $Limit) { break }

        # Check if MailItem
        if ($item.Class -eq 43) { # olMail
            try {
                $id = $item.EntryID
                $subject = $item.Subject
                $received = $item.ReceivedTime.ToString("yyyy-MM-ddTHH:mm:ss")
                $body = $item.Body
                
                # Sender
                $senderName = "Unknown"
                $senderEmail = ""
                try {
                    $sender = $item.Sender
                    if ($null -ne $sender) {
                        $senderName = $sender.Name
                        $senderEmail = $sender.Address
                    }
                } catch { }

                # Snippet
                $snippet = ""
                if ($null -ne $body) {
                    if ($body.Length -gt 200) {
                        $snippet = $body.Substring(0, 200)
                    } else {
                        $snippet = $body
                    }
                     # Clean up body for JSON safety somewhat (optional, JSON convert handles most)
                }

                $msgObj = @{
                    id = $id
                    subject = $subject
                    from = "$senderName <$senderEmail>"
                    date = $received
                    snippet = $snippet
                    body = $body
                }
                
                $messages += $msgObj
                $count++
            } catch {
                # Skip
            }
        }
    }

    $messages | ConvertTo-Json -Depth 2 -Compress

} catch {
    Write-Output "[]"
    exit 0
}
