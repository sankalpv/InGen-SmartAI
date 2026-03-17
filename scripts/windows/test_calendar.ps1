# Quick test: Can we access Outlook calendar via COM?
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

try {
    $outlook = New-Object -ComObject Outlook.Application
    $ns = $outlook.GetNamespace("MAPI")
    $cal = $ns.GetDefaultFolder(9)
    
    Write-Output "Calendar folder: $($cal.Name)"
    Write-Output "Total items: $($cal.Items.Count)"
    
    $items = $cal.Items
    $items.Sort("[Start]")
    $items.IncludeRecurrences = $true
    
    $today = (Get-Date).Date
    $lookback = $today.AddDays(-30)
    $forward = $today.AddDays(14)
    
    $count = 0
    $samples = @()
    
    foreach ($item in $items) {
        if ($item.MessageClass -match "IPM.Appointment") {
            try {
                $s = $item.Start
                if ($s -ge $lookback -and $s -lt $forward) {
                    $count++
                    if ($samples.Count -lt 5) {
                        $samples += "$($s.ToString('yyyy-MM-dd HH:mm')) - $($item.Subject)"
                    }
                }
                if ($s -gt $forward) { break }
            } catch { }
        }
    }
    
    Write-Output ""
    Write-Output "Events in range (30d back, 14d forward): $count"
    Write-Output ""
    Write-Output "Sample events:"
    foreach ($s in $samples) {
        Write-Output "  $s"
    }
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
