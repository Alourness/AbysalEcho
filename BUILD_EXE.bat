@echo off
title AbyssalEcho EXE Builder
cls
echo ========================================================
echo             AbyssalEcho EXE Builder
echo ========================================================
echo.

if not exist node_modules (
    echo [1/2] Installing dependencies...
    call npm.cmd install --legacy-peer-deps
    if not exist node_modules (
        echo.
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [1/2] Dependencies already installed.
)

echo.
echo [2/2] Packaging AbyssalEcho.exe...
echo Please wait, downloading electron wrapper and packaging...
call npm.cmd run package-exe

echo.
echo ========================================================
echo Check the "dist" folder for AbyssalEcho.exe!
echo ========================================================
pause
