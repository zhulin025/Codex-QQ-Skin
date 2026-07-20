@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\customize-qq-skin-windows.ps1"
if errorlevel 1 pause
