param([string]$Image, [string]$Name, [int]$Port = 9341, [switch]$NoApply)
. (Join-Path $PSScriptRoot 'common-windows.ps1')

Initialize-StateRoot
Resolve-NodeRuntime | Out-Null

if (-not $Image) {
  Add-Type -AssemblyName System.Windows.Forms
  $dialog = New-Object System.Windows.Forms.OpenFileDialog
  $dialog.Title = '选择一张图片，自动生成 Codex QQ Skin'
  $dialog.Filter = '图片|*.png;*.jpg;*.jpeg;*.webp|PNG|*.png|JPEG|*.jpg;*.jpeg|WebP|*.webp'
  $dialog.Multiselect = $false
  if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
  $Image = $dialog.FileName
}

$source = [IO.Path]::GetFullPath($Image)
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { Stop-WithError "Image not found: $source" }
$extension = [IO.Path]::GetExtension($source).ToLowerInvariant()
if ($extension -notin @('.png', '.jpg', '.jpeg', '.webp')) { Stop-WithError "Unsupported image type: $extension" }
$sourceInfo = Get-Item -LiteralPath $source
if ($sourceInfo.Length -lt 1 -or $sourceInfo.Length -gt 16MB) { Stop-WithError 'Image must be non-empty and no larger than 16 MB.' }
& $script:NodePath (Join-Path $script:ProjectRoot 'scripts\image-metadata.mjs') --check $source | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-WithError 'Image dimensions are invalid or exceed the 16384px / 50MP safety limit.' }

if (-not $Name) { $Name = [IO.Path]::GetFileNameWithoutExtension($source) }
$Name = $Name.Trim()
if (-not $Name) { $Name = '我的 Codex QQ Skin' }
if ($Name.Length -gt 80 -or $Name -match '[\x00-\x1f\x7f]') { Stop-WithError 'Theme name must be a single line of at most 80 characters.' }

New-Item -ItemType Directory -Force -Path $script:ThemeDir, $script:ThemesRoot | Out-Null
$imageName = 'background' + $extension
$temporary = Join-Path $script:ThemeDir ('.upload-' + [guid]::NewGuid().ToString('N') + $extension)
$prepared = Join-Path $script:ThemeDir $imageName
try {
  Copy-Item -LiteralPath $source -Destination $temporary -Force
  Move-Item -LiteralPath $temporary -Destination $prepared -Force
  & $script:NodePath (Join-Path $script:ProjectRoot 'scripts\write-theme.mjs') custom `
    --output-dir $script:ThemeDir --image $imageName --name $Name `
    --tagline '把喜欢的画面变成可交互的 Codex 工作台。' `
    --quote 'MAKE SOMETHING WONDERFUL' --appearance auto --safe-area auto --task-mode auto
  if ($LASTEXITCODE -ne 0) { Stop-WithError 'Could not generate the theme configuration.' }
} finally {
  Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
}

Get-ChildItem -LiteralPath $script:ThemeDir -File | Where-Object {
  $_.Name -ne 'theme.json' -and $_.Name -ne $imageName
} | Remove-Item -Force

$libraryId = 'custom-' + (Get-Date).ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 6)
$library = Join-Path $script:ThemesRoot $libraryId
New-Item -ItemType Directory -Force -Path $library | Out-Null
Copy-Item -LiteralPath $prepared, (Join-Path $script:ThemeDir 'theme.json') -Destination $library -Force

Write-Host "Generated custom skin '$Name' locally."
if (-not $NoApply) {
  & (Join-Path $PSScriptRoot 'start-qq-skin-windows.ps1') -Port $Port -RestartExisting
}
