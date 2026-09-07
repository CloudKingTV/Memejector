<#
.SYNOPSIS
  Serve wall/ and open it fullscreen in Chrome on the projector.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\wall.ps1
  powershell -ExecutionPolicy Bypass -File scripts\wall.ps1 -Display 1
  powershell -ExecutionPolicy Bypass -File scripts\wall.ps1 -NoBrowser
  powershell -ExecutionPolicy Bypass -File scripts\wall.ps1 -Page cursor

.NOTES
  -Display is 1-based and lists what it found, so if the projector is not the
  display you expected, run it once, read the list, and pass the right index.
  Ctrl+C stops the server and closes the browser it opened.
#>
[CmdletBinding()]
param(
  [int]$Port = 5173,
  [int]$Display = 0,
  [int]$Seed = 0,
  [ValidateSet('wall', 'cursor')]
  [string]$Page = 'wall',
  [switch]$NoBrowser,
  [switch]$Windowed
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$wall = Join-Path $root 'wall'

if (-not (Test-Path $wall)) { throw "wall/ not found at $wall" }

# Windows PowerShell 5.1 compatible: no ?? operator.
$python = $null
foreach ($name in @('python', 'python3', 'py')) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { $python = $cmd; break }
}
if (-not $python) { throw 'Python not found on PATH. Install Python 3 or serve wall/ some other way.' }

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens

Write-Host ''
Write-Host 'Displays:' -ForegroundColor DarkGray
for ($i = 0; $i -lt $screens.Count; $i++) {
  $s = $screens[$i]
  $tag = if ($s.Primary) { ' (primary)' } else { '' }
  Write-Host ("  [{0}] {1}x{2} at {3},{4}{5}" -f ($i + 1),
    $s.Bounds.Width, $s.Bounds.Height, $s.Bounds.X, $s.Bounds.Y, $tag) -ForegroundColor DarkGray
}

# Default to the first non-primary display, which is almost always the projector.
if ($Display -lt 1 -or $Display -gt $screens.Count) {
  $target = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1
  if (-not $target) { $target = $screens[0] }
} else {
  $target = $screens[$Display - 1]
}
Write-Host ("Using {0}x{1} at {2},{3}" -f $target.Bounds.Width, $target.Bounds.Height,
  $target.Bounds.X, $target.Bounds.Y) -ForegroundColor DarkGray

$server = Start-Process -FilePath $python.Source `
  -ArgumentList @('-m', 'http.server', "$Port", '--bind', '127.0.0.1', '--directory', $wall) `
  -PassThru -WindowStyle Hidden

Start-Sleep -Milliseconds 700
if ($server.HasExited) { throw "Static server exited immediately. Is port $Port already in use?" }
Write-Host "Serving wall/ on http://127.0.0.1:$Port  (pid $($server.Id))" -ForegroundColor Green

$browser = $null
if (-not $NoBrowser) {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  if (-not $chrome) {
    Write-Warning "Chrome not found. Open http://127.0.0.1:$Port yourself and press F."
  } else {
    # -Page cursor opens the Phase 2 diagnostic instead of the flow.
    $url = if ($Page -eq 'cursor') { "http://127.0.0.1:$Port/dev/cursor.html" }
           else { "http://127.0.0.1:$Port/" }
    if ($Seed -gt 0 -and $Page -eq 'wall') { $url += "?seed=$Seed" }

    # A dedicated profile keeps the wall free of extensions, sync popups and
    # whatever else is in the everyday browser. It has to survive a restart
    # mid-stream without asking anything.
    $profileDir = Join-Path $env:LOCALAPPDATA 'Memejector\chrome-profile'
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

    $chromeArgs = @(
      "--user-data-dir=$profileDir",
      "--window-position=$($target.Bounds.X),$($target.Bounds.Y)",
      "--window-size=$($target.Bounds.Width),$($target.Bounds.Height)",
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=Translate,MediaRouter',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble'
    )
    if (-not $Windowed) { $chromeArgs += '--kiosk' }
    $chromeArgs += "--app=$url"

    $browser = Start-Process -FilePath $chrome -ArgumentList $chromeArgs -PassThru
    Write-Host "Chrome on the projector. F toggles fullscreen, ? lists the keys." -ForegroundColor Green
  }
}

Write-Host 'Ctrl+C to stop.' -ForegroundColor DarkGray
try {
  while (-not $server.HasExited) { Start-Sleep -Seconds 1 }
} finally {
  foreach ($p in @($browser, $server)) {
    if ($p -and -not $p.HasExited) { $p.Kill() | Out-Null }
  }
  Write-Host 'Stopped.' -ForegroundColor DarkGray
}
