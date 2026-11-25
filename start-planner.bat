@echo off
setlocal EnableDelayedExpansion
title CPGP Studio - Content Planer Gam Puko
color 0E

cd /d "%~dp0"

cls
echo ============================================================================
echo    CPGP STUDIO - Content Planer Gam Puko
echo    Multi-Workspace Content Planner ^| Watermark Studio ^| Auto-Post Suite
echo ============================================================================
echo   App Root       : %CD%
echo   Workspace Data : Multi-Workspace JSON - data/workspaces.json
echo   Web Interface  : http://localhost:5173
echo ----------------------------------------------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 goto :err_no_node

if not exist "shared\captionParser.ts" goto :err_missing_shared

echo [1/2] Memeriksa dependencies node_modules...
if exist "node_modules\" goto :deps_ok

if exist "dist\index.html" goto :install_prod
echo       Dependencies belum ada. Menjalankan npm install...
call npm.cmd install
if errorlevel 1 goto :err_npm_install
goto :deps_done

:install_prod
echo       Mode rilis terdeteksi. Menjalankan npm install --omit=dev...
call npm.cmd install --omit=dev
if errorlevel 1 goto :err_npm_install
goto :deps_done

:deps_ok
echo       [OK] Dependencies sudah siap.

:deps_done
echo.
echo [2/2] Menjalankan CPGP Studio...
node "bin\cpgp-studio.mjs" %*
echo.
pause
exit /b %ERRORLEVEL%

:err_no_node
color 0C
echo [ERROR] Node.js tidak ditemukan di sistem ini.
echo Silakan install Node.js v20+ terlebih dahulu di https://nodejs.org
echo.
pause
exit /b 1

:err_missing_shared
color 0C
echo [ERROR] Folder "shared" tidak ditemukan.
echo Kemungkinan file ZIP rilis belum selesai diekstrak seluruhnya.
echo Klik kanan file ZIP lalu pilih "Extract All..." ke folder lokal seperti D:\CPGP-Studio.
echo.
pause
exit /b 1

:err_npm_install
color 0C
echo [ERROR] Gagal menginstall dependencies dengan npm.
echo Pastikan koneksi internet aktif lalu coba jalankan ulang start-planner.bat.
echo.
pause
exit /b 1
