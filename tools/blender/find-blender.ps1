# Resolves absolute path to blender.exe for CatanX asset tooling.
# Priority: BLENDER_PATH → PATH → official Program Files installs.

$ErrorActionPreference = 'Stop'

function Find-BlenderExe {
  if ($env:BLENDER_PATH) {
    $candidate = $env:BLENDER_PATH.Trim('"')
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
    Write-Error "BLENDER_PATH is set but invalid: $candidate"
  }

  $cmd = Get-Command blender -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -and (Test-Path -LiteralPath $cmd.Source)) {
    return (Resolve-Path -LiteralPath $cmd.Source).Path
  }

  $roots = @(
    "${env:ProgramFiles}\Blender Foundation",
    "${env:ProgramFiles(x86)}\Blender Foundation"
  )

  foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $found = Get-ChildItem -LiteralPath $root -Recurse -Filter 'blender.exe' -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }

  return $null
}

$blender = Find-BlenderExe
if (-not $blender) {
  Write-Error @"
Blender was not found.

Install with:
  winget install --exact --id BlenderFoundation.Blender

Or set BLENDER_PATH to blender.exe, then re-run:
  npm run assets:blender:check
"@
  exit 1
}

Write-Output $blender
