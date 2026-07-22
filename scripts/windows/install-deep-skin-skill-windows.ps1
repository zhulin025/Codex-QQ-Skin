$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common-windows.ps1')
Resolve-NodeRuntime | Out-Null
& $script:NodePath (Join-Path $script:ProjectRoot 'scripts\install-deep-skin-skill.mjs') install
if ($LASTEXITCODE -ne 0) { throw 'Codex deep skin Skill installation failed.' }
