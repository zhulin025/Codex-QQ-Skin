@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\verify-qq-skin-windows.ps1" -Screenshot "%USERPROFILE%\Desktop\Codex QQ Skin Verification.png"
if errorlevel 1 pause
