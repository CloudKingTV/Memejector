<#
.SYNOPSIS
  Four-corner homography calibration. Do this once per camera/projector placement.

.DESCRIPTION
  A dot appears in each corner of the wall in turn. Click that dot where you see
  it in the camera window. Four clicks gives the transform from camera pixels to
  projector pixels, including keystone.

  Then, optionally, the depth baseline: hold your hand tucked at your chest,
  press SPACE; extend your arm fully at the wall, press SPACE.

  Stand out of the way during the corner step — the camera needs to see the
  wall, not you.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\calibrate.ps1
  powershell -ExecutionPolicy Bypass -File scripts\calibrate.ps1 -Display 1
#>
[CmdletBinding()]
param(
  [int]$Camera = 0,
  [int]$Display = 0,
  [int]$Width = 1280,
  [int]$Height = 720,
  [switch]$NoMirror
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$trackerDir = Join-Path $root 'tracker'

$python = $null
foreach ($name in @('python', 'python3', 'py')) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { $python = $cmd; break }
}
if (-not $python) { throw 'Python not found on PATH.' }

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

if ($Display -lt 1 -or $Display -gt $screens.Count) {
  $target = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1
  if (-not $target) { $target = $screens[0] }
} else {
  $target = $screens[$Display - 1]
}
Write-Host ("Projector: {0}x{1} at {2},{3}" -f $target.Bounds.Width, $target.Bounds.Height,
  $target.Bounds.X, $target.Bounds.Y) -ForegroundColor DarkGray
Write-Host ''

$pyArgs = @(
  '-m', 'memejector_tracker', 'calibrate',
  '--camera', "$Camera",
  '--width', "$Width", '--height', "$Height",
  '--projector-width', "$($target.Bounds.Width)",
  '--projector-height', "$($target.Bounds.Height)",
  '--projector-x', "$($target.Bounds.X)",
  '--projector-y', "$($target.Bounds.Y)"
)
if ($NoMirror) { $pyArgs += '--no-mirror' }

Push-Location $trackerDir
try { & $python.Source @pyArgs } finally { Pop-Location }
