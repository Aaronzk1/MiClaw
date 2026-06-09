@echo off
cd /d D:\AaronClaw-New
echo Building AaronClaw...
call npx vite build --mode production
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)
echo Starting AaronClaw...
start "" "node_modules\electron\dist\electron.exe" .
