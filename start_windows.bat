@echo off
cd /d "%~dp0"
echo Starting InGen - AI Productivity Dashboard...
echo.

REM Ensure Ollama is running
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo Starting Ollama...
    start /min ollama serve
    timeout /t 3 /nobreak >nul
)

node launcher.js
pause
