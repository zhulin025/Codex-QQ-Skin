param([Parameter(Mandatory)][string]$Id, [int]$Port = 9341, [switch]$NoApply)
. (Join-Path $PSScriptRoot 'common-windows.ps1')

if ($Id -notmatch '^[A-Za-z0-9_-]{1,80}$') { Stop-WithError 'Theme id contains unsupported characters.' }
Initialize-StateRoot
Resolve-NodeRuntime | Out-Null
$source = Join-Path $script:ThemesRoot $Id
if (-not (Test-Path -LiteralPath (Join-Path $source 'theme.json') -PathType Leaf)) {
  Stop-WithError "Theme not found: $Id"
}
& $script:NodePath (Join-Path $script:ProjectRoot 'scripts\deep-theme.mjs') validate --theme-dir $source | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-WithError "Theme validation failed: $Id" }

$stage = Join-Path $script:StateRoot ('.theme-stage-' + [guid]::NewGuid().ToString('N'))
$backup = Join-Path $script:StateRoot ('.theme-backup-' + [guid]::NewGuid().ToString('N'))
Copy-Item -LiteralPath $source -Destination $stage -Recurse
try {
  Stop-RecordedInjector
  if (Test-Path -LiteralPath $script:ThemeDir) { Move-Item -LiteralPath $script:ThemeDir -Destination $backup }
  try {
    Move-Item -LiteralPath $stage -Destination $script:ThemeDir
  } catch {
    if (Test-Path -LiteralPath $backup) { Move-Item -LiteralPath $backup -Destination $script:ThemeDir }
    throw
  }
  if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Recurse -Force }
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not $NoApply) {
  & (Join-Path $PSScriptRoot 'start-qq-skin-windows.ps1') -Port $Port -RestartExisting -SkinMode custom
  exit $LASTEXITCODE
}
Write-Host "Ready: $Id"
