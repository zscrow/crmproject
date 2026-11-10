@echo off
cd /d "%~dp0"
if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)
start "" http://127.0.0.1:4173
call npm run dev
pause
