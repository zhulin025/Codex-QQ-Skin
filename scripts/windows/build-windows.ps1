param(
  [string]$OutputDirectory = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'release'),
  [string]$NodeVersion = '22.17.1',
  [switch]$UseInstalledNode
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$work = Join-Path ([IO.Path]::GetTempPath()) "codex-qq-skin-windows-$PID"
$stage = Join-Path $work 'Codex QQ Skin'
$runtime = Join-Path $stage 'runtime'

try {
  New-Item -ItemType Directory -Force -Path $stage, $runtime, $OutputDirectory | Out-Null
  $includeDirectories = @('assets','presets','scripts')
  foreach ($directory in $includeDirectories) {
    $source = Join-Path $root $directory
    $destination = Join-Path $stage $directory
    $null = & robocopy.exe $source $destination /E /XD macos-app menubar /XF '*.sh' '*.command' '.DS_Store' /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $directory with exit code $LASTEXITCODE" }
  }
  foreach ($file in @('package.json','LICENSE','NOTICE.md','README-WINDOWS.md','Install Codex QQ Skin Windows.cmd','Start Codex QQ Skin Windows.cmd','Verify Codex QQ Skin Windows.cmd','Restore Codex QQ Skin Windows.cmd')) {
    Copy-Item -LiteralPath (Join-Path $root $file) -Destination (Join-Path $stage $file)
  }

  if ($UseInstalledNode) {
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    Copy-Item -LiteralPath $node -Destination (Join-Path $runtime 'node.exe')
  } else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $archiveName = "node-v$NodeVersion-win-x64.zip"
    $archive = Join-Path $work $archiveName
    $baseUrl = "https://nodejs.org/dist/v$NodeVersion"
    $webClient = [Net.WebClient]::new()
    try {
      $webClient.DownloadFile("$baseUrl/$archiveName", $archive)
      $checksums = $webClient.DownloadString("$baseUrl/SHASUMS256.txt")
    } finally { $webClient.Dispose() }
    $match = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})  $([regex]::Escape($archiveName))$")
    if (-not $match.Success) { throw 'The official Node.js checksum entry was not found.' }
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $match.Groups[1].Value) { throw 'The downloaded Node.js runtime failed SHA-256 verification.' }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $work 'node')
    $nodeDistribution = Join-Path $work "node\node-v$NodeVersion-win-x64"
    Copy-Item -LiteralPath (Join-Path $nodeDistribution 'node.exe') -Destination (Join-Path $runtime 'node.exe')
    Copy-Item -LiteralPath (Join-Path $nodeDistribution 'LICENSE') -Destination (Join-Path $runtime 'NODE-LICENSE.txt')
    Set-Content -LiteralPath (Join-Path $runtime 'NODE-VERSION.txt') -Encoding ASCII -Value @(
      "Node.js v$NodeVersion", "Source: $baseUrl/$archiveName", "SHA-256: $actual", 'License: https://github.com/nodejs/node/blob/main/LICENSE'
    )
  }

  & (Join-Path $runtime 'node.exe') (Join-Path $stage 'scripts\injector.mjs') --check-payload --theme-dir (Join-Path $stage 'presets\preset-classic-codex') | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The staged Windows injector payload check failed.' }

  $zip = Join-Path $OutputDirectory "Codex-QQ-Skin-Windows-x64-v$version.zip"
  Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$zip.sha256" -Encoding ASCII -Value "$hash  $([IO.Path]::GetFileName($zip))"
  Write-Host $zip
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
