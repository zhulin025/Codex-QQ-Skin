param(
  [string]$OutputDirectory = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'release'),
  [string]$NodeVersion = '22.17.1',
  [string]$OutputFileName = 'Codex QQ Skin Setup.exe',
  [switch]$UseInstalledNode
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$work = Join-Path ([IO.Path]::GetTempPath()) "codex-qq-skin-gui-$PID"
$payload = Join-Path $work 'payload'
$payloadZip = Join-Path $work 'payload.zip'
$output = Join-Path $OutputDirectory $OutputFileName
$compiledOutput = Join-Path $work $OutputFileName
$windowsIcon = Join-Path $work 'AppIcon.ico'

try {
  New-Item -ItemType Directory -Force -Path $payload, $OutputDirectory | Out-Null
  foreach ($directory in @('assets','presets','scripts')) {
    $null = & robocopy.exe (Join-Path $root $directory) (Join-Path $payload $directory) /E /XD macos-app menubar /XF '*.sh' '*.command' '.DS_Store' /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $directory with exit code $LASTEXITCODE" }
  }
  Copy-Item -LiteralPath (Join-Path $root 'package.json') -Destination $payload
  New-Item -ItemType Directory -Force -Path (Join-Path $payload 'runtime') | Out-Null
  if ($UseInstalledNode) {
    Copy-Item -LiteralPath (Get-Command node.exe -ErrorAction Stop).Source -Destination (Join-Path $payload 'runtime\node.exe')
  } else {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $archiveName = "node-v$NodeVersion-win-x64.zip"
    $archive = Join-Path $work $archiveName
    $baseUrl = "https://nodejs.org/dist/v$NodeVersion"
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archive
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt").Content
    $match = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})  $([regex]::Escape($archiveName))$")
    if (-not $match.Success -or (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) { throw 'Node.js checksum verification failed.' }
    Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $work 'node')
    Copy-Item -LiteralPath (Join-Path $work "node\node-v$NodeVersion-win-x64\node.exe") -Destination (Join-Path $payload 'runtime\node.exe')
  }
  Compress-Archive -Path (Join-Path $payload '*') -DestinationPath $payloadZip -CompressionLevel Optimal

  # Generate a Windows multi-size icon from the exact PNG used by the macOS
  # AppIcon.icns build. PNG-compressed ICO frames preserve alpha and detail.
  Add-Type -AssemblyName System.Drawing
  $sourceIcon = Join-Path $root 'website\project-logo.png'
  $sourceBitmap = [Drawing.Bitmap]::FromFile($sourceIcon)
  $frames = [System.Collections.Generic.List[object]]::new()
  try {
    foreach ($size in @(16,24,32,48,64,128,256)) {
      $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try {
          $graphics.Clear([Drawing.Color]::Transparent)
          $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
          $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
          $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
          $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
          $graphics.DrawImage($sourceBitmap, 0, 0, $size, $size)
        } finally { $graphics.Dispose() }
        $memory = [IO.MemoryStream]::new()
        $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png)
        $frames.Add([pscustomobject]@{ Size = $size; Bytes = $memory.ToArray() })
        $memory.Dispose()
      } finally { $bitmap.Dispose() }
    }
  } finally { $sourceBitmap.Dispose() }
  $iconStream = [IO.File]::Create($windowsIcon)
  $writer = [IO.BinaryWriter]::new($iconStream)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + (16 * $frames.Count)
    foreach ($frame in $frames) {
      $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
      $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
      $writer.Write([byte]0); $writer.Write([byte]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32)
      $writer.Write([uint32]$frame.Bytes.Length); $writer.Write([uint32]$offset)
      $offset += $frame.Bytes.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
  } finally { $writer.Dispose(); $iconStream.Dispose() }

  $csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if (-not (Test-Path $csc)) { $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe' }
  if (-not (Test-Path $csc)) { throw 'The Windows C# compiler was not found.' }
  & $csc /nologo /target:winexe /optimize+ /platform:x64 /win32icon:$windowsIcon /out:$compiledOutput /resource:"$payloadZip,CodexQQSkin.payload.zip" /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll (Join-Path $root 'windows-app\Program.cs')
  if ($LASTEXITCODE -ne 0) { throw 'C# compilation failed.' }
  Copy-Item -LiteralPath $compiledOutput -Destination $output -Force
  $hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath "$output.sha256" -Encoding ASCII -Value "$hash  $([IO.Path]::GetFileName($output))"
  Write-Host $output
} finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
