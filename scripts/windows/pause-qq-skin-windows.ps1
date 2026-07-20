param()
. (Join-Path $PSScriptRoot 'common-windows.ps1')
Initialize-StateRoot
Resolve-NodeRuntime | Out-Null
$state = Read-State
if (-not $state) { Write-Host 'Codex QQ Skin is not running.'; exit 0 }
if ($state.codexExe -and (Test-Path -LiteralPath $state.codexExe)) {
  $script:CodexExe = [string]$state.codexExe
}
$port = [int]$state.port
if ($script:CodexExe -and (Test-CodexCdpEndpoint -Port $port)) {
  try { Invoke-Injector -Arguments @('--remove','--port',$port,'--theme-dir',$script:ThemeDir,'--timeout-ms','8000') | Out-Null } catch {}
}
Stop-RecordedInjector
Write-State -Port $port -InjectorPid 0 -InjectorStartedAt '' -CodexPid ([int]$state.codexPid)
Write-Host 'Codex QQ Skin is paused; Codex remains open.'
