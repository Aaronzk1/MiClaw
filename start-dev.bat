@echo off
cd /d D:\AaronClaw-New
set ELECTRON_RUN_AS_NODE=
start "" "node_modules\electron\dist\electron.exe" . --dev
