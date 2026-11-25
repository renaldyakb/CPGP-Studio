@echo off
setlocal
chcp 65001 >nul 2>&1
title CPGP Studio - Content Planer Gam Puko
cd /d "%~dp0"

if exist "%~dp0scripts\launcher.ps1" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launcher.ps1" %*
  exit /b %ERRORLEVEL%
)

echo [ERROR] File scripts\launcher.ps1 tidak ditemukan.
echo Pastikan seluruh file paket CPGP Studio telah diekstrak dengan lengkap.
echo.
pause
exit /b 1
