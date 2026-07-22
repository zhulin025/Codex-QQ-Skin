param([int]$Port = 9341, [switch]$NoLaunch, [switch]$InPlace)
. (Join-Path $PSScriptRoot 'common-windows.ps1')

if ($Port -lt 1024 -or $Port -gt 65535) { Stop-WithError 'Port must be between 1024 and 65535.' }
Initialize-StateRoot

if (-not $InPlace -and $script:ProjectRoot -ne $script:InstallRoot) {
  $bundledVersion = ConvertTo-SkinVersion -Value $script:SkinVersion
  $installedVersion = Get-EngineVersionAt -Root $script:InstallRoot
  $installedComplete = Test-InstalledEngineComplete -Root $script:InstallRoot
  if ($installedVersion -and $bundledVersion -and $installedVersion -gt $bundledVersion) {
    Write-Host "Installed engine $installedVersion is newer than bundled $bundledVersion; downgrade skipped."
    if (-not $NoLaunch) {
      & (Join-Path $script:InstallRoot 'scripts\windows\start-qq-skin-windows.ps1') -Port $Port -RestartExisting
      exit $LASTEXITCODE
    }
    exit 0
  }
  if ($installedVersion -and $bundledVersion -and $installedVersion -eq $bundledVersion -and $installedComplete) {
    Write-Host "Installed engine $installedVersion is already current; replacement skipped."
    if (-not $NoLaunch) {
      & (Join-Path $script:InstallRoot 'scripts\windows\start-qq-skin-windows.ps1') -Port $Port -RestartExisting
      exit $LASTEXITCODE
    }
    exit 0
  }
  $parent = Split-Path -Parent $script:InstallRoot
  $stage = "$($script:InstallRoot).installing.$PID"
  $previous = "$($script:InstallRoot).previous.$PID"

  # Upgrades can replace an engine that is currently hosting the injector.
  # Stop only the PID recorded in our state file; Stop-RecordedInjector also
  # validates its executable and command line before touching the process.
  Stop-RecordedInjector

  function Move-DirectoryWithRetry {
    param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Destination)
    $lastError = $null
    for ($attempt = 1; $attempt -le 12; $attempt++) {
      try {
        Move-Item -LiteralPath $Source -Destination $Destination -ErrorAction Stop
        return
      } catch {
        $lastError = $_
        if ($attempt -lt 12) { Start-Sleep -Milliseconds 250 }
      }
    }
    throw $lastError
  }

  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  New-Item -ItemType Directory -Path $stage | Out-Null
  $null = & robocopy.exe $script:ProjectRoot $stage /E /XD .git release website macos-app menubar /XF '*.command' '*.sh' '.DS_Store' /NFL /NDL /NJH /NJS
  if ($LASTEXITCODE -ge 8) { Stop-WithError "Could not stage the Windows engine (robocopy exit $LASTEXITCODE)." }
  if (Test-Path -LiteralPath $script:InstallRoot) { Move-DirectoryWithRetry -Source $script:InstallRoot -Destination $previous }
  try { Move-DirectoryWithRetry -Source $stage -Destination $script:InstallRoot }
  catch {
    if (Test-Path -LiteralPath $previous) { Move-DirectoryWithRetry -Source $previous -Destination $script:InstallRoot }
    throw
  }
  if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $script:InstallRoot 'scripts\windows\install-qq-skin-windows.ps1'),'-InPlace','-Port',$Port)
  if ($NoLaunch) { $arguments += '-NoLaunch' }
  & powershell.exe @arguments
  exit $LASTEXITCODE
}

Resolve-NodeRuntime | Out-Null
Resolve-CodexApp | Out-Null
Seed-BundledTheme
if (-not (Test-Path -LiteralPath $script:ConfigPath -PathType Leaf)) {
  Stop-WithError "Codex config was not found at $($script:ConfigPath). Launch Codex once, close it, and rerun the installer."
}
Invoke-Injector -Arguments @('--check-payload','--theme-dir',$script:ThemeDir) | Out-Null
$env:CODEX_QQ_SKIN_PLATFORM = 'win32'
& $script:NodePath (Join-Path $script:ProjectRoot 'scripts\theme-config.mjs') install $script:ConfigPath $script:ThemeBackupPath
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Could not save the Codex appearance backup.' }

$desktop = [Environment]::GetFolderPath('Desktop')
$launcher = Join-Path $desktop 'ChatGPT QQ Skin.cmd'
$startScript = '%LOCALAPPDATA%\CodexQQSkin\engine\scripts\windows\start-qq-skin-windows.ps1'
@('@echo off', "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port -RestartExisting", 'if errorlevel 1 pause') |
  Set-Content -LiteralPath $launcher -Encoding ASCII

Write-Host "ChatGPT QQ Skin $($script:SkinVersion) installed at $($script:InstallRoot)."
if (-not $NoLaunch) {
  & (Join-Path $script:ProjectRoot 'scripts\windows\start-qq-skin-windows.ps1') -Port $Port -RestartExisting
  exit $LASTEXITCODE
}
exit 0
