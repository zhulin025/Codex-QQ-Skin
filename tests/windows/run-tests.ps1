$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node.exe -ErrorAction Stop).Source

$errors = @()
Get-ChildItem -LiteralPath (Join-Path $root 'scripts\windows') -Filter '*.ps1' | ForEach-Object {
  $tokens = $null
  $parseErrors = $null
  [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
  if ($parseErrors) {
    foreach ($parseError in $parseErrors) {
      $script:errors += ('{0}:{1}: {2}' -f $_.Name, $parseError.Extent.StartLineNumber, $parseError.Message)
    }
  }
}
if ($errors.Count) { throw ($errors -join [Environment]::NewLine) }

# StrictMode turns a one-item pipeline result into a scalar. Keep process-count
# checks explicitly array-wrapped so stopping exactly one Codex process works.
$commonWindows = Get-Content -LiteralPath (Join-Path $root 'scripts\windows\common-windows.ps1')
if ($commonWindows | Where-Object { $_ -match '\(Get-CodexProcesses\)\.Count' -and $_ -notmatch '@\(Get-CodexProcesses\)\.Count' }) {
  throw 'Get-CodexProcesses count checks must use @(...) under StrictMode.'
}

& $node (Join-Path $root 'scripts\injector.mjs') --check-payload --theme-dir (Join-Path $root 'presets\preset-classic-codex') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Injector payload check failed.' }
foreach ($test in @('image-metadata.test.mjs','injector-bootstrap.test.mjs','renderer-inject.test.mjs','deep-theme.test.mjs','skill-install.test.mjs','theme-stage.test.mjs','usage-level.test.mjs')) {
  & $node (Join-Path $root "tests\$test")
  if ($LASTEXITCODE -ne 0) { throw "$test failed." }
}

$temporary = Join-Path ([IO.Path]::GetTempPath()) "codex-qq-skin-theme-test-$PID"
try {
  New-Item -ItemType Directory -Force -Path $temporary | Out-Null
  $config = Join-Path $temporary 'config.toml'
  $backup = Join-Path $temporary 'backup.json'
  Set-Content -LiteralPath $config -Encoding UTF8 -Value "model = `"test`"`r`n`r`n[desktop]`r`nappearanceTheme = `"system`"`r`n"
  $env:CODEX_QQ_SKIN_PLATFORM = 'win32'
  & $node (Join-Path $root 'scripts\theme-config.mjs') install $config $backup | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Windows theme backup install test failed.' }
  $value = Get-Content -LiteralPath $backup -Raw | ConvertFrom-Json
  if ($value.platform -ne 'win32') { throw 'Windows theme backup has the wrong platform identity.' }
  & $node (Join-Path $root 'scripts\theme-config.mjs') restore $config $backup | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Windows theme backup restore test failed.' }
} finally {
  Remove-Item Env:CODEX_QQ_SKIN_PLATFORM -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'Windows static and cross-platform tests passed.'
