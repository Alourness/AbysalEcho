@echo off
title AbyssalEcho Launcher
cls
echo ========================================================
echo             AbyssalEcho Game Launcher
echo ========================================================
echo.

:: Проверка на символ & в пути папки (баг Windows cmd)
echo %CD% | findstr /C:"&" >nul
if %errorlevel% equ 0 (
    echo [CRITICAL ERROR]
    echo Your folder path contains the '&' symbol:
    echo %CD%
    echo.
    echo Windows cannot run programs when '&' is in the folder name!
    echo PLEASE RENAME THIS FOLDER to simply: AbyssalEcho
    echo (Remove the '&' from the folder name and run this file again).
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo [1/3] Installing modules...
    call npm.cmd install --legacy-peer-deps
) else (
    echo [1/3] Modules are installed.
)

echo [2/3] Starting game server...
start /b "" node "node_modules\vite\bin\vite.js" --port=3000 --host=0.0.0.0

echo [3/3] Waiting for game server to start...
timeout /t 3 /nobreak > nul

echo.
echo Opening game in standalone desktop window...
set OPENED=0

if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:3000 --window-size=920,740
    set OPENED=1
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=920,740
    set OPENED=1
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" --app=http://localhost:3000 --window-size=920,740
    set OPENED=1
)

if %OPENED%==0 (
    start http://localhost:3000
)

echo.
echo ========================================================
echo GAME IS RUNNING IN DESKTOP WINDOW!
echo Do not close this terminal window while playing.
echo ========================================================
pause
