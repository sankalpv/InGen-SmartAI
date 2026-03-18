# InGen Packager for Windows Distribution
# Creates a clean zip ready to share with new users

$PROJECT_DIR = $PSScriptRoot | Split-Path | Split-Path
$DESKTOP = [Environment]::GetFolderPath('Desktop')
$PACKAGE_NAME = 'InGen-SmartAI'
$ZIP_PATH = Join-Path $DESKTOP ($PACKAGE_NAME + '.zip')
$TEMP_DIR = Join-Path $env:TEMP ('ingen-package-' + (Get-Random))

Write-Host ''
Write-Host '  InGen Packager - Create Distributable Zip' -ForegroundColor Magenta
Write-Host ''
Write-Host ('  Source: ' + $PROJECT_DIR) -ForegroundColor Cyan
Write-Host ('  Output: ' + $ZIP_PATH) -ForegroundColor Cyan
Write-Host ''

# Step 1: Create clean copy
Write-Host '  [1/4] Creating clean copy...' -ForegroundColor Blue

$excludeDirs = @('node_modules', '.next', 'data', 'brain', '.git', '__tests__', 'mockups', 'assets')
$excludeFiles = @('.env.local', 'smartai.log', 'sync_state.json', 'meetings_7days_raw.json', 'meetings_raw.json', 'test-embedding-models.js', 'test-mcp-connection.js', 'test-mcp-tools.js', 'test-quicksight-access.js', 'demo-script.html', 'marketing-catalog.html')

New-Item -ItemType Directory -Path $TEMP_DIR -Force | Out-Null
$destDir = Join-Path $TEMP_DIR $PACKAGE_NAME

$excludeDirArgs = $excludeDirs | ForEach-Object { '/XD'; $_ }
$excludeFileArgs = $excludeFiles | ForEach-Object { '/XF'; $_ }

robocopy $PROJECT_DIR $destDir /E /NFL /NDL /NJH /NJS /NC /NS /NP @excludeDirArgs @excludeFileArgs | Out-Null

Write-Host '    [OK] Clean copy created' -ForegroundColor Green

# Step 2: Clean settings.json
Write-Host '  [2/4] Cleaning settings.json...' -ForegroundColor Blue

$settingsFile = Join-Path $destDir 'config\settings.json'
if (Test-Path $settingsFile) {
    try {
        $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json
        $settings.phonetoolAlias = ''
        $settings.logUploadUrl = ''
        if ($settings.mcpServers.'builder-mcp') { $settings.mcpServers.'builder-mcp'.command = 'builder-mcp' }
        if ($settings.mcpServers.'amzn-mcp') { $settings.mcpServers.'amzn-mcp'.command = 'amzn-mcp' }
        }
        $jsonOut = $settings | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($settingsFile, $jsonOut, (New-Object System.Text.UTF8Encoding $false))
        Write-Host '    [OK] settings.json cleaned' -ForegroundColor Green
    } catch {
        Write-Host '    [!!] Could not clean settings.json' -ForegroundColor Yellow
    }
}

# Step 3: Create empty directories
Write-Host '  [3/4] Creating empty data directories...' -ForegroundColor Blue
New-Item -ItemType Directory -Path (Join-Path $destDir 'data') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $destDir 'brain') -Force | Out-Null
Write-Host '    [OK] Empty data/ and brain/ created' -ForegroundColor Green

# Step 4: Create zip
Write-Host '  [4/4] Creating zip archive...' -ForegroundColor Blue

if (Test-Path $ZIP_PATH) { Remove-Item $ZIP_PATH -Force }

Compress-Archive -Path $destDir -DestinationPath $ZIP_PATH -CompressionLevel Optimal

$zipSizeBytes = (Get-Item $ZIP_PATH).Length
$zipSizeMB = [math]::Round($zipSizeBytes / 1048576, 1)

Write-Host '    [OK] Zip created successfully' -ForegroundColor Green

# Cleanup
Remove-Item $TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue

# Done
Write-Host ''
Write-Host '  Package created successfully!' -ForegroundColor Green
Write-Host ''
Write-Host ('  File: ' + $ZIP_PATH) -ForegroundColor Cyan
Write-Host ('  Size: ' + $zipSizeMB + ' megabytes') -ForegroundColor Cyan
Write-Host ''
Write-Host '  Share this zip with new users. They just need to:' -ForegroundColor Gray
Write-Host '    1. Extract the zip to their Desktop' -ForegroundColor Gray
Write-Host '    2. Open the extracted folder' -ForegroundColor Gray
Write-Host '    3. Double-click setup_windows.bat' -ForegroundColor Gray
Write-Host '    4. Follow the prompts' -ForegroundColor Gray
Write-Host '    5. Open http://localhost:3000' -ForegroundColor Gray
Write-Host ''

pause
