# fetch_outlook_folder.ps1
# Fetches emails from a named Outlook folder (supports path like "Inbox/Issues")
# Equivalent to fetch_outlook_folder.scpt (AppleScript) for Windows
# Arguments: [FolderPath] [Limit]
param (
    [string]$FolderPath = "Inbox",
    [int]$Limit = 50
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-OutlookFolder {
    param (
        [object]$Namespace,
        [string]$Path
    )

    $parts = $Path -split "/"

    # Start from the first part
    $folder = $null
    $firstPart = $parts[0]

    # Try well-known folder names first
    switch ($firstPart.ToLower()) {
        "inbox" {
            $folder = $Namespace.GetDefaultFolder(6) # olFolderInbox
        }
        "sent" {
            $folder = $Namespace.GetDefaultFolder(5) # olFolderSentMail
        }
        "sent items" {
            $folder = $Namespace.GetDefaultFolder(5)
        }
        "drafts" {
            $folder = $Namespace.GetDefaultFolder(16) # olFolderDrafts
        }
        "deleted items" {
            $folder = $Namespace.GetDefaultFolder(3) # olFolderDeletedItems
        }
        "junk email" {
            $folder = $Namespace.GetDefaultFolder(23) # olFolderJunk
        }
        default {
            # Try to find by name in the default store's root folder
            try {
                $store = $Namespace.DefaultStore
                $rootFolder = $store.GetRootFolder()
                $folder = $rootFolder.Folders.Item($firstPart)
            } catch {
                # Try inbox subfolders as fallback
                try {
                    $inbox = $Namespace.GetDefaultFolder(6)
                    $folder = $inbox.Folders.Item($firstPart)
                } catch {
                    throw "Folder '$firstPart' not found"
                }
            }
        }
    }

    # Navigate deeper through subfolders
    for ($i = 1; $i -lt $parts.Count; $i++) {
        try {
            $folder = $folder.Folders.Item($parts[$i])
        } catch {
            throw "Subfolder '$($parts[$i])' not found in path '$FolderPath'"
        }
    }

    return $folder
}

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")

    # Navigate to the requested folder
    $folder = Get-OutlookFolder -Namespace $namespace -Path $FolderPath

    $items = $folder.Items
    $items.Sort("[ReceivedTime]", $true) # Descending (newest first)

    $totalCount = $items.Count
    $fetchCount = [Math]::Min($Limit, $totalCount)

    $messages = @()

    for ($i = 1; $i -le $fetchCount; $i++) {
        try {
            $item = $items.Item($i)

            # Only process mail items (Class 43 = olMail)
            if ($item.Class -ne 43) { continue }

            $id = $item.EntryID
            $subject = $item.Subject
            if ($null -eq $subject) { $subject = "(No Subject)" }

            $dateStr = ""
            try {
                $dateStr = $item.ReceivedTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
            } catch {
                $dateStr = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            }

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

            # Recipients
            $recipStr = ""
            try {
                $recips = $item.Recipients
                $recipList = @()
                for ($r = 1; $r -le [Math]::Min($recips.Count, 10); $r++) {
                    $recipList += $recips.Item($r).Address
                }
                $recipStr = $recipList -join "; "
            } catch { }

            # Body (truncate at 8000 chars for vector store)
            $body = ""
            try {
                $body = $item.Body
                if ($null -ne $body -and $body.Length -gt 8000) {
                    $body = $body.Substring(0, 8000)
                }
            } catch { }

            $messages += @{
                id         = $id
                subject    = $subject
                body       = $body
                sender     = @{
                    name  = $senderName
                    email = $senderEmail
                }
                recipients = $recipStr
                date       = $dateStr
                folder     = $FolderPath
            }
        } catch {
            # Skip problematic message
        }
    }

    if ($messages.Count -eq 0) {
        Write-Output "[]"
    } else {
        $messages | ConvertTo-Json -Depth 3 -Compress
    }

} catch {
    # Return error in same format as the AppleScript version
    $errMsg = $_.Exception.Message -replace '"', '\"'
    Write-Output "[{`"error`": `"$errMsg`"}]"
    exit 0
}
