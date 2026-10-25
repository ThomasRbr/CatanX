# Generates H1 then H2 premium GLB batches via Blender Python generators.
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

$outRoot = Join-Path $repoRoot 'apps\client\public\assets\models'
$previewRoot = Join-Path $repoRoot 'assets-src\blender\previews'

$batches = @(
  'generators\generate_h1_batch.py',
  'generators\generate_h2_batch.py',
  'generators\generate_h3_batch.py',
  'generators\generate_ck_pieces.py'
)

foreach ($rel in $batches) {
  $generator = Join-Path $scriptDir $rel
  Write-Host "Generating with $blender :: $rel"
  & $blender `
    --background `
    --factory-startup `
    --python-exit-code 1 `
    --python $generator `
    -- `
    --repo-root $repoRoot `
    --output $outRoot `
    --preview $previewRoot

  if (-not $?) {
    Write-Error "Blender generation failed for $rel"
    exit 1
  }
}

$realisticGenerator = Join-Path $scriptDir 'generators\generate_realistic_surface_batch.py'
$realisticOutput = Join-Path $outRoot 'realistic'
Write-Host "Generating realistic Surface LOD kit"
& $blender `
  --background `
  --factory-startup `
  --python-exit-code 1 `
  --python $realisticGenerator `
  -- `
  --repo-root $repoRoot `
  --output $realisticOutput

if (-not $?) {
  Write-Error 'Blender generation failed for the realistic Surface kit'
  exit 1
}

$treeGenerator = Join-Path $scriptDir 'generators\generate_realistic_trees_batch.py'
$treeOutput = Join-Path $realisticOutput 'vegetation'
Write-Host "Generating realistic vegetation LOD kit"
& $blender `
  --background `
  --factory-startup `
  --python-exit-code 1 `
  --python $treeGenerator `
  -- `
  --repo-root $repoRoot `
  --output $treeOutput

if (-not $?) {
  Write-Error 'Blender generation failed for the realistic vegetation kit'
  exit 1
}

Write-Host 'assets:blender:generate OK (legacy kits + realistic Surface + vegetation)'
exit 0
