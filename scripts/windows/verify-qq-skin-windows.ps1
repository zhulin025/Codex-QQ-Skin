param([int]$Port = 0, [string]$Screenshot)
. (Join-Path $PSScriptRoot 'common-windows.ps1')
Initialize-StateRoot
Resolve-NodeRuntime | Out-Null
Resolve-CodexApp | Out-Null
$state = Read-State
if ($Port -eq 0 -and $state) { $Port = [int]$state.port }
if ($Port -lt 1024 -or $Port -gt 65535) { Stop-WithError 'No valid saved debug port was found.' }
if (-not (Test-CodexCdpEndpoint -Port $Port)) { Stop-WithError "Port $Port is not a verified Codex loopback CDP endpoint." }
$arguments = @('--verify','--port',$Port,'--theme-dir',$script:ThemeDir,'--timeout-ms','12000')
if ($Screenshot) { $arguments += @('--screenshot',([IO.Path]::GetFullPath($Screenshot))) }
Invoke-Injector -Arguments $arguments
