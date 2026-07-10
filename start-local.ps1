# Takalot local dev server
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DevPort = 3042
$DevUrl = "http://localhost:$DevPort"
Set-Location $ProjectRoot

function Test-ViteReady {
    $viteJs = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $viteJs)) {
        return $false
    }

    $output = & node $viteJs --version 2>&1
    return $LASTEXITCODE -eq 0 -and ($output -match "vite/")
}

function Install-Dependencies {
    param([switch]$Clean)

    if ($Clean -and (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
        Write-Host "Removing broken node_modules..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force (Join-Path $ProjectRoot "node_modules") -ErrorAction SilentlyContinue
    }

    Write-Host "Installing dependencies (first run may take a minute)..." -ForegroundColor Yellow
    & npm install --strict-ssl=false
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "npm install failed." -ForegroundColor Red
        Write-Host "Try manually in this folder:" -ForegroundColor Yellow
        Write-Host "  npm install --strict-ssl=false" -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit $LASTEXITCODE
    }
    Write-Host ""
}

function Start-DevServer {
    $viteCmd = Join-Path $ProjectRoot "node_modules\.bin\vite.cmd"
    $viteJs = Join-Path $ProjectRoot "node_modules\vite\bin\vite.js"
    $viteArgs = @("--port=$DevPort", "--host=0.0.0.0", "--strictPort")

    $openJob = Start-Job -ScriptBlock {
        param($url)
        Start-Sleep -Seconds 3
        Start-Process $url
    } -ArgumentList $DevUrl

    try {
        if (Test-Path $viteCmd) {
            & $viteCmd @viteArgs
        } else {
            & node $viteJs @viteArgs
        }
    } finally {
        Stop-Job $openJob -ErrorAction SilentlyContinue
        Remove-Job $openJob -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "=== Takalot - Local Dev Server ===" -ForegroundColor Cyan
Write-Host "Project folder: $ProjectRoot" -ForegroundColor Gray
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed. Download from https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm was not found." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$envFile = Join-Path $ProjectRoot ".env.local"
$envExample = Join-Path $ProjectRoot ".env.example"

if (-not (Test-Path $envFile)) {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "Created .env.local from .env.example" -ForegroundColor Yellow
        Write-Host "Fill in your Firebase values before Google login will work." -ForegroundColor Yellow
        Read-Host "Press Enter after updating .env.local"
    } else {
        Write-Host "Missing .env.local file." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

$requiredVars = @(
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID"
)

$envLines = Get-Content $envFile | Where-Object { $_ -notmatch "^\s*#" -and $_ -match "=" }
$envMap = @{}
foreach ($line in $envLines) {
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim([char]34).Trim([char]39)
        $envMap[$key] = $value
    }
}

$missingVars = @()
foreach ($var in $requiredVars) {
    if (-not $envMap.ContainsKey($var) -or [string]::IsNullOrWhiteSpace($envMap[$var])) {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "Missing environment variables in .env.local:" -ForegroundColor Red
    $missingVars | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-ViteReady)) {
    Install-Dependencies
}

if (-not (Test-ViteReady)) {
    Install-Dependencies -Clean
}

if (-not (Test-ViteReady)) {
    Write-Host "Could not start Vite. Dependencies are still broken." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting Takalot at $DevUrl" -ForegroundColor Green
Write-Host "This project always uses port $DevPort (won't open other sites)." -ForegroundColor Gray
Write-Host "Stop with Ctrl+C" -ForegroundColor Gray
Write-Host ""

try {
    Start-DevServer
} catch {
    Write-Host ""
    Write-Host "Failed to start dev server: $_" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
