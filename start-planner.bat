@echo off
setlocal EnableDelayedExpansion
title CPGP (Content Planer Gam Puko) v2.0
color 0E

cd /d "%~dp0"

cls
echo ============================================================================
echo    CPGP (Content Planer Gam Puko) v2.0 - Multi-Workspace Content Planner
echo    YouTube Shorts  ^|  TikTok  ^|  Instagram Reels  ^|  Facebook Reels
echo ============================================================================
echo   App Root       : %CD%
echo   Workspace Data : Multi-Workspace JSON (data/workspaces.json)
echo   Web Interface  : http://localhost:5173
echo ----------------------------------------------------------------------------
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0C
    echo [ERROR] Node.js tidak ditemukan di sistem ini.
    pause
    exit /b 1
)

echo [1/3] Memeriksa dependencies (node_modules)...
if not exist "node_modules\" (
    echo       Dependencies belum ada. Menjalankan npm install...
    call npm.cmd install
) else (
    echo       [OK] Dependencies sudah siap.
)

echo.
echo [2/3] Mensinkronkan workspace aktif ke Multi-Workspace JSON (data/workspaces.json)...
call npm.cmd run scan

if /i "%~1"=="--scan-only" (
    echo.
    echo [OK] Scan selesai.
    pause
    exit /b 0
)

echo.
echo [3/3] Membuka http://localhost:5173 di Browser dan menyalakan Server Lokal...
echo       (Biarkan jendela ini tetap terbuka selama menggunakan CPGP v2.0)
echo       (Tekan Ctrl + C untuk mematikan server)
echo.

if /i not "%~1"=="--no-browser" (
    start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5173"
)

call npm.cmd run dev
pause
