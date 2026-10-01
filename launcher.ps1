# =============================================================================
# Video to Prompts: Universal llama-server & Application Launcher
# =============================================================================
[CmdletBinding()]
param (
    [string]$LlamaDir = "C:\llamaCPP",
    [int]$Port = 8081,
    [int]$ContextTokens = 16384,
    [int]$ModelIndex = -999
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LastChoiceFile = Join-Path $ScriptDir ".last_model_choice"

function Write-Color($text, $color = "Cyan") {
    Write-Host $text -ForegroundColor $color
}

function Show-Header {
    Clear-Host
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "         Video to Prompts: Vision AI & App Launcher                 " -ForegroundColor Green
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host " Engine: llama-server (llama.cpp)  |  Port: $Port  |  Context: $ContextTokens" -ForegroundColor Gray
    Write-Host ""
}

# 1. Verify llama-server executable
$LlamaServerExe = Join-Path $LlamaDir "llama-server.exe"
if (-not (Test-Path $LlamaServerExe)) {
    Write-Host "[!] Error: llama-server.exe not found at $LlamaServerExe" -ForegroundColor Red
    Write-Host "    Please ensure C:\llamaCPP is installed or pass -LlamaDir <path>." -ForegroundColor Yellow
    pause
    exit 1
}

# 2. Discover vision models and mmproj pairs
Show-Header
Write-Color "[*] Scanning for Vision Models in $LlamaDir\models..." "Yellow"

$ModelsDir = Join-Path $LlamaDir "models"
if (-not (Test-Path $ModelsDir)) {
    Write-Host "[!] Error: Models directory not found at $ModelsDir" -ForegroundColor Red
    pause
    exit 1
}

$AllGgufs = Get-ChildItem -Path $ModelsDir -Recurse -Filter "*.gguf" -File -ErrorAction SilentlyContinue
$MmprojFiles = @($AllGgufs | Where-Object { $_.Name -like "mmproj*" })
$CandidateModels = @($AllGgufs | Where-Object { 
    $_.Name -notlike "mmproj*" -and 
    $_.Name -notlike "*embed*" -and 
    $_.Name -notlike "*imatrix*"
})

$VisionLibrary = [System.Collections.Generic.List[PSCustomObject]]::new()

foreach ($model in $CandidateModels) {
    # Check if there is an mmproj in the exact same directory
    $folderProj = $MmprojFiles | Where-Object { $_.DirectoryName -eq $model.DirectoryName }
    
    # Or search for mmproj matching model family in filename
    if (-not $folderProj) {
        $baseNamePrefix = ($model.BaseName -split "-")[0]
        $folderProj = $MmprojFiles | Where-Object { $_.Name -like "*$baseNamePrefix*" }
    }

    if ($folderProj) {
        $primaryProj = $folderProj[0]
        $sizeGb = [math]::Round($model.Length / 1GB, 1)
        
        # Format a clean readable label
        $cleanName = $model.Name -replace '\.gguf$', ''
        
        $VisionLibrary.Add([PSCustomObject]@{
            DisplayName = $cleanName
            SizeGB      = $sizeGb
            ModelPath   = $model.FullName
            MmprojPath  = $primaryProj.FullName
            MmprojName  = $primaryProj.Name
            Folder      = (Split-Path $model.DirectoryName -Leaf)
        })
    }
}

if ($VisionLibrary.Count -eq 0) {
    Write-Host "[!] No multimodal vision models (model + mmproj) discovered in $ModelsDir!" -ForegroundColor Red
    pause
    exit 1
}

# 3. Read previous choice
$DefaultIndex = 1
if (Test-Path $LastChoiceFile) {
    $SavedName = Get-Content $LastChoiceFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($SavedName) {
        for ($i = 0; $i -lt $VisionLibrary.Count; $i++) {
            if ($VisionLibrary[$i].DisplayName -eq $SavedName.Trim()) {
                $DefaultIndex = $i + 1
                break
            }
        }
    }
}

# 4. Display Menu
Show-Header
Write-Color "Available Vision Models in Library:" "White"
Write-Host "---------------------------------------------------------------------" -ForegroundColor DarkGray

for ($i = 0; $i -lt $VisionLibrary.Count; $i++) {
    $m = $VisionLibrary[$i]
    $num = ($i + 1).ToString().PadLeft(2)
    $isDefault = if ($i + 1 -eq $DefaultIndex) { " [DEFAULT]" } else { "" }
    
    Write-Host " [$num] " -ForegroundColor Yellow -NoNewline
    Write-Host "$($m.DisplayName)" -ForegroundColor Cyan -NoNewline
    Write-Host " ($($m.SizeGB) GB)" -ForegroundColor Gray -NoNewline
    Write-Host "$isDefault" -ForegroundColor Green
    Write-Host "      Folder: $($m.Folder) | mmproj: $($m.MmprojName)" -ForegroundColor DarkGray
}

Write-Host "---------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " [ 0] " -ForegroundColor Yellow -NoNewline
Write-Host "Skip starting llama-server (Use server already running on port $Port)" -ForegroundColor White
Write-Host " [ Q] " -ForegroundColor Yellow -NoNewline
Write-Host "Quit" -ForegroundColor White
Write-Host ""

$SelectedIndex = $DefaultIndex - 1

if ($ModelIndex -ne -999) {
    if ($ModelIndex -eq 0) {
        $SelectedIndex = -1
    } elseif ($ModelIndex -ge 1 -and $ModelIndex -le $VisionLibrary.Count) {
        $SelectedIndex = $ModelIndex - 1
    }
} else {
    $choice = Read-Host "Select a model [1-$($VisionLibrary.Count) or 0, default=$DefaultIndex]"
    if ($choice -match '^[Qq]') {
        exit 0
    }

    if ($choice -match '^\d+$') {
        $parsed = [int]$choice
        if ($parsed -eq 0) {
            $SelectedIndex = -1
        } elseif ($parsed -ge 1 -and $parsed -le $VisionLibrary.Count) {
            $SelectedIndex = $parsed - 1
        }
    }
}

# 5. Handle llama-server startup
if ($SelectedIndex -ge 0) {
    $Chosen = $VisionLibrary[$SelectedIndex]
    $Chosen.DisplayName | Out-File -FilePath $LastChoiceFile -Encoding utf8

    Write-Color "`n[+] Selected: $($Chosen.DisplayName)" "Green"
    Write-Host "    Model:  $($Chosen.ModelPath)" -ForegroundColor Gray
    Write-Host "    Mmproj: $($Chosen.MmprojPath)" -ForegroundColor Gray

    # Check if a process is already listening on target port
    $OccupyingConn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($OccupyingConn) {
        $pids = $OccupyingConn | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 }
        foreach ($pidToKill in $pids) {
            $proc = Get-Process -Id $pidToKill -ErrorAction SilentlyContinue
            if ($proc -and $proc.ProcessName -match "llama-server") {
                Write-Color "[*] Stopping existing llama-server process (PID: $pidToKill)..." "Yellow"
                try {
                    Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue *>$null
                } catch {}
                Start-Sleep -Seconds 1
            } elseif ($proc) {
                Write-Host "[!] Port $Port is currently used by '$($proc.ProcessName)' (PID: $pidToKill)." -ForegroundColor Red
                $killAnswer = Read-Host "Terminate process '$($proc.ProcessName)' to free port $Port? [y/N]"
                if ($killAnswer -match '^[Yy]') {
                    try {
                        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue *>$null
                    } catch {}
                    Start-Sleep -Seconds 1
                } else {
                    Write-Host "[!] Aborting: Port $Port is occupied." -ForegroundColor Red
                    exit 1
                }
            }
        }
    }

    Write-Color "[*] Launching llama-server on port $Port..." "Yellow"

    $LlamaArgs = @(
        "-m", "`"$($Chosen.ModelPath)`"",
        "--mmproj", "`"$($Chosen.MmprojPath)`"",
        "--port", "$Port",
        "-c", "$ContextTokens",
        "-ngl", "99",
        "--flash-attn", "on",
        "-ctk", "q8_0",
        "-ctv", "q8_0",
        "--host", "127.0.0.1",
        "--alias", "`"$($Chosen.DisplayName)`"",
        "--sleep-idle-seconds", "15"
    )

    $LlamaCmdLine = "$LlamaServerExe " + ($LlamaArgs -join " ")
    
    # Launch llama-server in its own window so logs and performance can be viewed
    Start-Process -FilePath "cmd.exe" -ArgumentList @('/k', "title llama-server ($($Chosen.DisplayName)) & $LlamaCmdLine")

    # Wait for endpoint to become responsive
    Write-Color "[*] Waiting for llama-server to initialize API on http://localhost:$Port/v1/models..." "Yellow"
    $maxAttempts = 40
    $ready = $false

    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        Start-Sleep -Milliseconds 800
        try {
            $resp = Invoke-RestMethod -Uri "http://localhost:$Port/v1/models" -Method Get -TimeoutSec 2 -ErrorAction Stop
            if ($resp -and ($resp.data -or $resp.models)) {
                $ready = $true
                break
            }
        } catch {
            Write-Host "." -NoNewline -ForegroundColor DarkGray
        }
    }
    Write-Host ""

    if ($ready) {
        Write-Color "[OK] llama-server is READY on http://localhost:$Port!" "Green"
    } else {
        Write-Host "[!] Warning: llama-server has not responded yet, but continuing with app startup..." -ForegroundColor Yellow
    }
} else {
    Write-Color "[*] Skipping llama-server startup (using existing server on port $Port)." "Cyan"
}

# 6. Start the Electron Application
Write-Host ""
Write-Color "[*] Launching Video to Prompts application..." "Green"
Set-Location $ScriptDir

# Set environment variable so child processes inherit port 8081
$env:LLAMA_SERVER_PORT = "$Port"
$env:LOCAL_AI_URL = "http://localhost:$Port"

Start-Process -FilePath "cmd.exe" -ArgumentList @('/k', 'title Video to Prompts Dev Server & npm run dev')

Write-Host ""
Write-Color "=====================================================================" "Cyan"
Write-Color " Everything is launched!" "Green"
Write-Color "   - llama-server: http://localhost:$Port" "White"
Write-Color "   - Electron App: Starting via Vite dev server..." "White"
Write-Color "=====================================================================" "Cyan"
Start-Sleep -Seconds 2
