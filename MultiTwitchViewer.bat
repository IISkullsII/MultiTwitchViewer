@echo off
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm wurde nicht gefunden. Bitte Node.js installieren.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Abhaengigkeiten werden installiert...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run dev
pause
