<#
.SYNOPSIS
  Run the hand tracker. Streams hand state to the wall over a WebSocket.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1
  powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1 -Source synthetic
  powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1 -Record
  powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1 -Replay recordings\x.jsonl

.NOTES
  -Source synthetic needs no camera and no MediaPipe. Start there: if the dot
  moves under synthetic but not under camera, the problem is the camera, and
  that is worth knowing before you start reinstalling drivers.
#>
[CmdletBinding()]
param(
  [ValidateSet('camera', 'synthetic', 'replay')]
  [string]$Source = 'camera',
  [string]$Replay = '',
  [int]$Camera = 0,
  [int]$Port = 8787,
  [int]$Fps = 0,
  [switch]$Record,
  [switch]$Landmarks,
  [double]$MinCutoff = 0,
  [double]$Beta = 0
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$trackerDir = Join-Path $root 'tracker'

$python = $null
foreach ($name in @('python', 'python3', 'py')) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { $python = $cmd; break }
}
if (-not $python) { throw 'Python not found on PATH. Install Python 3.10+ first.' }

if ($Replay) { $Source = 'replay' }

$pyArgs = @('-m', 'memejector_tracker')
if ($Source -eq 'replay') {
  if (-not $Replay) { throw 'Pass -Replay <path to .jsonl> to replay a recording.' }
  $pyArgs += @('replay', $Replay)
} else {
  $pyArgs += @('run', '--source', $Source)
  if ($Record) { $pyArgs += '--record' }
}
$pyArgs += @('--port', "$Port", '--camera', "$Camera")
if ($Fps -gt 0) { $pyArgs += @('--fps', "$Fps") }
if ($Landmarks) { $pyArgs += '--landmarks' }
if ($MinCutoff -gt 0) { $pyArgs += @('--min-cutoff', "$MinCutoff") }
if ($Beta -gt 0) { $pyArgs += @('--beta', "$Beta") }

Write-Host "tracker: $($python.Source) $($pyArgs -join ' ')" -ForegroundColor DarkGray
Push-Location $trackerDir
try { & $python.Source @pyArgs } finally { Pop-Location }
