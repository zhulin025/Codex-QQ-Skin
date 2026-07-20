@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\restore-qq-skin-windows.ps1" -RestoreBaseTheme -RestartCodex
if errorlevel 1 pause
