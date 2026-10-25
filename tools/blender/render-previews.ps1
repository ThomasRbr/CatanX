# Renders orthographic preview sheets for generated GLB assets.
$ErrorActionPreference = 'Stop'

$scriptDir = $PSScriptRoot
if (-not $scriptDir) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$repoRoot = Resolve-Path (Join-Path $scriptDir '..\..')
$findScript = Join-Path $scriptDir 'find-blender.ps1'
$blender = & $findScript
if (-not $blender) {
  Write-Error 'find-blender.ps1 did not return a Blender path'
  exit 1
}

$renderer = Join-Path $scriptDir 'generators\render_preview_sheet.py'
$modelsRoot = Join-Path $repoRoot 'apps\client\public\assets\models'
$previewRoot = Join-Path $repoRoot 'assets-src\blender\previews'

New-Item -ItemType Directory -Force -Path $previewRoot | Out-Null

Write-Host "Rendering previews with $blender"
& $blender `
  --background `
  --factory-startup `
  --python-exit-code 1 `
  --python $renderer `
  -- `
  --repo-root $repoRoot `
  --models $modelsRoot `
    --preview $previewRoot

if (-not $?) {
  Write-Error 'Preview render failed'
  exit 1
}

& $blender `
  --background `
  --factory-startup `
  --python-exit-code 1 `
  --python $renderer `
  -- `
  --repo-root $repoRoot `
  --models $modelsRoot `
  --preview $previewRoot `
  --contains 'cities-knights' `
  --output 'ck_piece_sheet.png'

if (-not $?) {
  Write-Error 'Cities & Knights preview render failed'
  exit 1
}

Write-Host 'assets:blender:previews OK'
exit 0
