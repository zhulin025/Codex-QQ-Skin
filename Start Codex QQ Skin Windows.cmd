@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\start-qq-skin-windows.ps1" -RestartExisting
if errorlevel 1 pause
