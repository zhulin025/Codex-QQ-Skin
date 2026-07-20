param([switch]$RestoreBaseTheme, [switch]$RestartCodex)
. (Join-Path $PSScriptRoot 'common-windows.ps1')
Initialize-StateRoot
Resolve-NodeRuntime | Out-Null
$state = Read-State
if ($state -and $state.codexExe -and (Test-Path -LiteralPath $state.codexExe)) {
  $script:CodexExe = [string]$state.codexExe
  $script:CodexVersion = [string]$state.codexVersion
} else { Resolve-CodexApp | Out-Null }
$port = if ($state) { [int]$state.port } else { 9341 }
if (Test-CodexCdpEndpoint -Port $port) {
  try { Invoke-Injector -Arguments @('--remove','--port',$port,'--theme-dir',$script:ThemeDir,'--timeout-ms','8000') | Out-Null } catch {}
}
if ($state) { Stop-RecordedInjector }
if ($RestoreBaseTheme -and (Test-Path -LiteralPath $script:ThemeBackupPath)) {
  $env:CODEX_QQ_SKIN_PLATFORM = 'win32'
  & $script:NodePath (Join-Path $script:ProjectRoot 'scripts\theme-config.mjs') restore $script:ConfigPath $script:ThemeBackupPath
  if ($LASTEXITCODE -ne 0) { Stop-WithError 'Could not restore the saved Codex appearance settings.' }
}
Remove-Item -LiteralPath $script:StatePath -Force -ErrorAction SilentlyContinue
if ($RestartCodex) {
  Stop-CodexApp
  Start-Process -FilePath $script:CodexExe | Out-Null
}
$message = if ($RestoreBaseTheme) { 'Codex QQ Skin was removed and the saved official appearance was restored.' } else { 'Codex QQ Skin was removed.' }
Write-Host $message
