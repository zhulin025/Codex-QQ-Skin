param([int]$Port = 9341, [switch]$RestartExisting)
. (Join-Path $PSScriptRoot 'common-windows.ps1')

if ($Port -lt 1024 -or $Port -gt 65535) { Stop-WithError 'Port must be between 1024 and 65535.' }
Initialize-StateRoot
Resolve-NodeRuntime | Out-Null
Resolve-CodexApp | Out-Null
Seed-BundledTheme

$debugReady = Test-CodexCdpEndpoint -Port $Port
$running = @(Get-CodexProcesses)
if ($running.Count -gt 0 -and -not $debugReady) {
  if (-not $RestartExisting) { Stop-WithError 'Codex is already running without the verified QQ Skin debug endpoint. Close it or pass -RestartExisting.' }
  Stop-CodexApp
}

try { Stop-RecordedInjector } catch { throw }
if (-not $debugReady) {
  $Port = Get-AvailablePort -Preferred $Port
  Write-Host "Launching Codex with loopback debug port $Port..."
  Start-CodexWithCdp -Port $Port
  if (-not (Wait-CodexCdpEndpoint -Port $Port)) {
    Stop-WithError "Codex did not expose a verified loopback CDP endpoint within 45 seconds. See $($script:CodexErrorLog)."
  }
}

$injector = Start-Injector -Port $Port
try {
  Invoke-Injector -Arguments @('--verify','--port',$Port,'--theme-dir',$script:ThemeDir,'--timeout-ms','20000') | Out-Null
} catch {
  Stop-Process -Id $injector.Id -ErrorAction SilentlyContinue
  throw
}
$codexProcess = @(Get-CodexProcesses) | Select-Object -First 1
if (-not $codexProcess) {
  Stop-Process -Id $injector.Id -ErrorAction SilentlyContinue
  Stop-WithError 'Codex exited before the running state could be recorded.'
}
$codexPid = [int]$codexProcess.ProcessId
$startedAt = $injector.StartTime.ToUniversalTime().ToString('o')
Write-State -Port $Port -InjectorPid $injector.Id -InjectorStartedAt $startedAt -CodexPid $codexPid
Write-Host "Codex QQ Skin $($script:SkinVersion) is active on loopback port $Port."
