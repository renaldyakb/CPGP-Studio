@echo off
setlocal EnableDelayedExpansion
title CPGP Studio (Content Planer Gam Puko)
color 0E

cd /d "%~dp0"

cls
echo ============================================================================
echo    CPGP STUDIO (Content Planer Gam Puko)
echo    Multi-Workspace Content Planner ^| Watermark Studio ^| Auto-Post Suite
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
    echo Silakan install Node.js v20+ terlebih dahulu di https://nodejs.org
    pause
    exit /b 1
)

if not exist "shared\captionParser.ts" (
    color 0C
    echo [ERROR] Folder "shared" tidak ditemukan!
    echo Kemungkinan file ZIP rilis belum selesai diekstrak seluruhnya.
    echo Silakan klik kanan file ZIP lalu pilih "Extract All..." ke folder lokal (misal D:\CPGP-Studio).
    pause
    exit /b 1
)

echo [1/2] Memeriksa dependencies (node_modules)...
if not exist "node_modules\" (
    if exist "dist\index.html" (
        echo       Mode rilis terdeteksi. Menjalankan npm install --omit=dev...
        call npm.cmd install --omit=dev
    ) else (
        echo       Dependencies belum ada. Menjalankan npm install...
        call npm.cmd install
    )
    if !ERRORLEVEL! neq 0 (
        color 0C
        echo [ERROR] Gagal menginstall dependencies.
        pause
        exit /b 1
    )
) else (
    echo       [OK] Dependencies sudah siap.
)

echo.
echo [2/2] Menjalankan CPGP Studio (bin\cpgp-studio.mjs)...
node bin\cpgp-studio.mjs %*
pause
