@echo off
title Menjalankan ESI Trenggalek Portal
echo ========================================================
echo   PORTAL RESMI PENGKAB ESI KABUPATEN TRENGGALEK
echo ========================================================
echo.

where npm >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Node.js & npm terdeteksi.
    echo Menjalankan server lokal via npm start...
    echo Buka di browser: http://localhost:3000
    echo.
    npm start
) else (
    echo [INFO] Node.js / npm belum terinstall di Windows Anda.
    echo.
    echo Jangan khawatir! Website ini bisa langsung berjalan tanpa npm.
    echo Sedang membuka index.html di browser Anda...
    start "" "index.html"
    echo.
    echo Jika Anda ingin menggunakan 'npm start', silakan download
    echo dan install Node.js terlebih dahulu di: https://nodejs.org
    echo ========================================================
    pause
)
