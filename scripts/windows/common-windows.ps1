Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:SkinVersion = '2.3.1'
$script:ScriptRoot = Split-Path -Parent $PSCommandPath
$script:ProjectRoot = (Resolve-Path (Join-Path $script:ScriptRoot '..\..')).Path
$script:InjectorPath = Join-Path $script:ProjectRoot 'scripts\injector.mjs'
$script:InstallRoot = Join-Path $env:LOCALAPPDATA 'CodexQQSkin\engine'
$script:StateRoot = Join-Path $env:APPDATA 'CodexQQSkin'
$script:StatePath = Join-Path $script:StateRoot 'state.json'
$script:ThemeDir = Join-Path $script:StateRoot 'theme'
$script:ThemesRoot = Join-Path $script:StateRoot 'themes'
$script:ThemeBackupPath = Join-Path $script:StateRoot 'theme-backup.json'
$script:ConfigPath = Join-Path $HOME '.codex\config.toml'
$script:InjectorLog = Join-Path $script:StateRoot 'injector.log'
$script:InjectorErrorLog = Join-Path $script:StateRoot 'injector-error.log'
$script:CodexLog = Join-Path $script:StateRoot 'codex-launch.log'
$script:CodexErrorLog = Join-Path $script:StateRoot 'codex-launch-error.log'
$script:NodePath = $null
$script:CodexExe = $null
$script:CodexVersion = $null
$script:CodexAppUserModelId = $null
$script:CodexAppIds = @{}

function Stop-WithError {
  param([Parameter(Mandatory)][string]$Message)
  throw "Codex QQ Skin: $Message"
}

function Initialize-StateRoot {
  New-Item -ItemType Directory -Force -Path $script:StateRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $script:ThemesRoot | Out-Null
}

function Resolve-NodeRuntime {
  $candidates = @(
    $env:CODEX_QQ_SKIN_NODE,
    (Join-Path $script:ProjectRoot 'runtime\node.exe')
  )
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) { $candidates += $command.Source }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      $script:NodePath = (Resolve-Path -LiteralPath $candidate).Path
      $version = (& $script:NodePath --version).TrimStart('v')
      $major = 0
      if (-not ([int]::TryParse(($version -split '\.')[0], [ref]$major)) -or $major -lt 20) {
        Stop-WithError "Node.js 20 or newer is required; found $version."
      }
      return $script:NodePath
    }
  }
  Stop-WithError 'The bundled Node.js runtime is missing. Reinstall from the complete Windows ZIP.'
}

function Get-CodexCandidates {
  $values = [System.Collections.Generic.List[string]]::new()
  $script:CodexAppIds = @{}
  if ($env:CODEX_EXE) { $values.Add($env:CODEX_EXE) }
  $values.Add((Join-Path $env:LOCALAPPDATA 'Programs\Codex\Codex.exe'))
  $values.Add((Join-Path $env:LOCALAPPDATA 'Programs\ChatGPT\ChatGPT.exe'))
  $values.Add((Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\Codex.exe'))
  $values.Add((Join-Path $env:ProgramFiles 'Codex\Codex.exe'))
  $values.Add((Join-Path $env:ProgramFiles 'OpenAI\Codex\Codex.exe'))
  try {
    $appPaths = @(
      'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Codex.exe',
      'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\Codex.exe',
      'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\ChatGPT.exe',
      'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\ChatGPT.exe'
    )
    foreach ($key in $appPaths) {
      if (Test-Path $key) {
        $value = (Get-Item $key).GetValue('')
        if ($value) { $values.Add([string]$value) }
      }
    }
  } catch {}
  try {
    foreach ($package in Get-AppxPackage -Name '*OpenAI*' -ErrorAction SilentlyContinue) {
      $manifest = Get-AppxPackageManifest $package
      foreach ($application in @($manifest.Package.Applications.Application)) {
        if ($application.Executable) {
          $packagedExe = Join-Path $package.InstallLocation ([string]$application.Executable)
          $values.Add($packagedExe)
          $script:CodexAppIds[$packagedExe.ToLowerInvariant()] = "$($package.PackageFamilyName)!$($application.Id)"
        }
      }
    }
  } catch {}
  return $values | Where-Object { $_ } | Select-Object -Unique
}

function Resolve-CodexApp {
  foreach ($candidate in Get-CodexCandidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    $name = [IO.Path]::GetFileName($resolved)
    if ($name -notin @('Codex.exe', 'ChatGPT.exe')) { continue }
    $script:CodexExe = $resolved
    $script:CodexVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($resolved).FileVersion
    $key = $resolved.ToLowerInvariant()
    if ($script:CodexAppIds.ContainsKey($key)) { $script:CodexAppUserModelId = $script:CodexAppIds[$key] }
    return $resolved
  }
  Stop-WithError 'Could not find ChatGPT.exe. Install and launch the official ChatGPT app once, or set CODEX_EXE to its full path.'
}

function Get-CodexProcesses {
  if (-not $script:CodexExe) { return @() }
  $expected = $script:CodexExe.ToLowerInvariant()
  return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.ToLowerInvariant() -eq $expected
  })
}

function Test-ProcessDescendsFromCodex {
  param([Parameter(Mandatory)][int]$ProcessId)
  $seen = @{}
  $current = $ProcessId
  for ($depth = 0; $depth -lt 24 -and $current -gt 0; $depth++) {
    if ($seen.ContainsKey($current)) { return $false }
    $seen[$current] = $true
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
    if (-not $process) { return $false }
    if ($process.ExecutablePath -and $script:CodexExe -and
      $process.ExecutablePath.Equals($script:CodexExe, [StringComparison]::OrdinalIgnoreCase)) { return $true }
    $current = [int]$process.ParentProcessId
  }
  return $false
}

function Test-CodexCdpEndpoint {
  param([Parameter(Mandatory)][ValidateRange(1024,65535)][int]$Port)
  try {
    $connections = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction Stop)
    if (-not $connections -or -not ($connections | Where-Object { Test-ProcessDescendsFromCodex -ProcessId $_.OwningProcess })) { return $false }
    $targets = @(Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2 -MaximumRedirection 0)
    foreach ($target in $targets) {
      if ($target.type -ne 'page' -or -not ([string]$target.url).StartsWith('app://')) { continue }
      $uri = [Uri]$target.webSocketDebuggerUrl
      if ($uri.Scheme -eq 'ws' -and $uri.Host -in @('127.0.0.1','localhost','[::1]') -and
        $uri.Port -eq $Port -and $uri.AbsolutePath -match '^/devtools/page/[A-Za-z0-9._-]{1,200}$') { return $true }
    }
  } catch {}
  return $false
}

function Get-AvailablePort {
  param([Parameter(Mandatory)][int]$Preferred)
  for ($candidate = $Preferred; $candidate -le [Math]::Min(65535, $Preferred + 100); $candidate++) {
    $listener = $null
    try {
      $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate)
      $listener.Start()
      return $candidate
    } catch {} finally { if ($listener) { $listener.Stop() } }
  }
  Stop-WithError "No free loopback port was found between $Preferred and $([Math]::Min(65535, $Preferred + 100))."
}

function Wait-CodexCdpEndpoint {
  param([Parameter(Mandatory)][int]$Port, [int]$TimeoutSeconds = 45)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (Test-CodexCdpEndpoint -Port $Port) { return $true }
    Start-Sleep -Milliseconds 350
  }
  return $false
}

function Read-State {
  if (-not (Test-Path -LiteralPath $script:StatePath -PathType Leaf)) { return $null }
  try { return Get-Content -LiteralPath $script:StatePath -Raw -Encoding UTF8 | ConvertFrom-Json }
  catch { Stop-WithError 'The saved state file is damaged; it was preserved for inspection.' }
}

function Write-State {
  param([int]$Port, [int]$InjectorPid, [string]$InjectorStartedAt, [int]$CodexPid)
  Initialize-StateRoot
  $state = [ordered]@{
    schemaVersion = 4; platform = "win32-$env:PROCESSOR_ARCHITECTURE"; skinVersion = $script:SkinVersion
    injectorProtocol = 2; port = $Port; injectorPid = $InjectorPid; injectorStartedAt = $InjectorStartedAt
    injectorPath = $script:InjectorPath; nodePath = $script:NodePath; nodeVersion = (& $script:NodePath --version)
    codexExe = $script:CodexExe; codexVersion = $script:CodexVersion; codexPid = $CodexPid
    projectRoot = $script:ProjectRoot; themeDir = $script:ThemeDir; createdAt = [DateTime]::UtcNow.ToString('o')
  }
  $temporary = "$($script:StatePath).$PID.tmp"
  $state | ConvertTo-Json | Set-Content -LiteralPath $temporary -Encoding UTF8
  Move-Item -LiteralPath $temporary -Destination $script:StatePath -Force
}

function Stop-RecordedInjector {
  $state = Read-State
  if (-not $state -or [int]$state.injectorPid -eq 0) { return }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.injectorPid)" -ErrorAction SilentlyContinue
  if (-not $process) { return }
  $valid = $process.ExecutablePath -and $process.CommandLine -and
    $process.ExecutablePath.Equals([string]$state.nodePath, [StringComparison]::OrdinalIgnoreCase) -and
    $process.CommandLine.IndexOf([string]$state.injectorPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $process.CommandLine.IndexOf("--port $([int]$state.port)", [StringComparison]::OrdinalIgnoreCase) -ge 0
  if (-not $valid) { Stop-WithError 'The recorded injector PID belongs to another process; it was not stopped and state was preserved.' }
  Stop-Process -Id ([int]$state.injectorPid) -ErrorAction Stop
  try { Wait-Process -Id ([int]$state.injectorPid) -Timeout 8 -ErrorAction SilentlyContinue } catch {}
}

function Stop-CodexApp {
  $processes = @(Get-CodexProcesses)
  foreach ($process in $processes) { Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue }
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while (@(Get-CodexProcesses).Count -gt 0 -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
  if (@(Get-CodexProcesses).Count -gt 0) { Stop-WithError 'Codex did not close within 15 seconds. Close it manually and retry.' }
}

function Get-CodexLangArgument {
  $locale = $null
  if (Test-Path -LiteralPath $script:ConfigPath) {
    try {
      $text = Get-Content -LiteralPath $script:ConfigPath -Raw -ErrorAction Stop
      $marker = 'localeOverride'
      $idx = $text.IndexOf($marker, [StringComparison]::Ordinal)
      if ($idx -ge 0) {
        $slice = $text.Substring($idx, [Math]::Min(120, $text.Length - $idx))
        $eq = $slice.IndexOf('=')
        if ($eq -ge 0) {
          $value = $slice.Substring($eq + 1).Trim()
          if ($value.Length -ge 2) {
            $quote = $value[0]
            if ($quote -eq [char]34 -or $quote -eq [char]39) {
              $end = $value.IndexOf($quote, 1)
              if ($end -gt 1) { $locale = $value.Substring(1, $end - 1).Trim() }
            }
          }
        }
      }
    } catch {}
  }
  if (-not $locale) {
    try {
      $locale = [System.Globalization.CultureInfo]::CurrentUICulture.Name
    } catch {}
  }
  if (-not $locale) { return $null }
  $locale = $locale.Split('@')[0].Replace('_', '-').Split('.')[0].Trim()
  if ($locale -match '^(zh|en|ja|ko|es|fr|de|pt|ru|it|nl|sv|da|fi|nb|pl|tr|th|vi|id|ms|ar|he|hi|uk|cs|ro|hu)') {
    return $locale
  }
  return $null
}

function Start-CodexWithCdp {
  param([Parameter(Mandatory)][int]$Port)
  Set-Content -LiteralPath $script:CodexLog -Value '' -Encoding UTF8
  Set-Content -LiteralPath $script:CodexErrorLog -Value '' -Encoding UTF8
  $lang = Get-CodexLangArgument
  $argList = [System.Collections.Generic.List[string]]::new()
  [void]$argList.Add('--remote-debugging-address=127.0.0.1')
  [void]$argList.Add("--remote-debugging-port=$Port")
  if ($lang) { [void]$argList.Add("--lang=$lang") }
  $launchArguments = ($argList -join ' ')
  if ($script:CodexAppUserModelId) {
    if (-not ('CodexQQSkin.ApplicationActivationManager' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CodexQQSkin {
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager {
    [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
    [PreserveSig] int ActivateForFile(string appUserModelId, IntPtr itemArray, string verb, out uint processId);
    [PreserveSig] int ActivateForProtocol(string appUserModelId, IntPtr itemArray, out uint processId);
  }
  public static class ApplicationActivationManager {
    public static uint Activate(string appUserModelId, string arguments) {
      var manager = (IApplicationActivationManager)new Manager();
      uint processId;
      int result = manager.ActivateApplication(appUserModelId, arguments, 0, out processId);
      if (result < 0) Marshal.ThrowExceptionForHR(result);
      return processId;
    }
    [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")]
    private class Manager { }
  }
}
'@
    }
    Write-Host "Activating packaged ChatGPT app $($script:CodexAppUserModelId)..."
    [CodexQQSkin.ApplicationActivationManager]::Activate($script:CodexAppUserModelId, $launchArguments) | Out-Null
  } else {
    Start-Process -FilePath $script:CodexExe -ArgumentList $argList.ToArray() `
      -RedirectStandardOutput $script:CodexLog -RedirectStandardError $script:CodexErrorLog | Out-Null
  }
}

function Start-Injector {
  param([Parameter(Mandatory)][int]$Port)
  Set-Content -LiteralPath $script:InjectorLog -Value '' -Encoding UTF8
  Set-Content -LiteralPath $script:InjectorErrorLog -Value '' -Encoding UTF8
  $process = Start-Process -FilePath $script:NodePath -ArgumentList @(
    ('"{0}"' -f $script:InjectorPath), '--watch', '--port', $Port, '--theme-dir', ('"{0}"' -f $script:ThemeDir)
  ) -WindowStyle Hidden -RedirectStandardOutput $script:InjectorLog -RedirectStandardError $script:InjectorErrorLog -PassThru
  Start-Sleep -Milliseconds 150
  if ($process.HasExited) { Stop-WithError "The injector exited during startup. See $($script:InjectorErrorLog)." }
  return $process
}

function Seed-BundledTheme {
  Initialize-StateRoot
  $preset = Join-Path $script:ProjectRoot 'presets\preset-classic-codex'
  $libraryPreset = Join-Path $script:ThemesRoot 'preset-classic-codex'
  if (Test-Path -LiteralPath $libraryPreset) { Remove-Item -LiteralPath $libraryPreset -Recurse -Force }
  Copy-Item -LiteralPath $preset -Destination $libraryPreset -Recurse
  if (-not (Test-Path -LiteralPath (Join-Path $script:ThemeDir 'theme.json'))) {
    if (Test-Path -LiteralPath $script:ThemeDir) { Remove-Item -LiteralPath $script:ThemeDir -Recurse -Force }
    Copy-Item -LiteralPath $preset -Destination $script:ThemeDir -Recurse
  }
}

function Invoke-Injector {
  param([Parameter(Mandatory)][string[]]$Arguments)
  & $script:NodePath $script:InjectorPath @Arguments
  if ($LASTEXITCODE -ne 0) { Stop-WithError "Injector command failed with exit code $LASTEXITCODE." }
}
