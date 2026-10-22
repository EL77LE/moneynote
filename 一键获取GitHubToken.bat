@echo off
REM ===================================================================
REM  MoneyNote - GitHub token helper (pure ASCII).
REM
REM  Opens GitHub's pre-filled classic-token page, then reads the token
REM  from the clipboard and saves it to secrets\token.txt.
REM  The token is never echoed in full and is gitignored.
REM
REM  Pass "nopause" to skip the final pause.
REM ===================================================================

chcp 65001 >nul 2>&1
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\github-token.ps1"
set "EXITCODE=%ERRORLEVEL%"

if /i not "%~1"=="nopause" (
  echo.
  pause
)

exit /b %EXITCODE%
