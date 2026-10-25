# Verifies Blender is installed and can run headless Python.
$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$findScript = Join-Path $scriptDir 'find-blender.ps1'
$blender = & $findScript
if (-not $blender) {
  Write-Error 'find-blender.ps1 did not return a Blender path'
  exit 1
}

Write-Host "Blender: $blender"
& $blender --version
if (-not $?) { exit 1 }

# Use single-quoted Python strings — PowerShell strips nested double quotes.
$py = "import bpy; print('BPY_OK', bpy.app.version_string)"
& $blender --background --factory-startup --python-expr $py
if (-not $?) { exit 1 }

Write-Host 'assets:blender:check OK'
exit 0
