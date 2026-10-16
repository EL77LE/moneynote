@echo off
REM ===================================================================
REM  MoneyNote one-click test.  Double-click this file.
REM
REM  NOTE: this file is deliberately pure ASCII.
REM  cmd.exe parses .bat files byte-by-byte using the console codepage
REM  (GBK on Chinese Windows), so a UTF-8 Chinese character (3 bytes)
REM  is mis-counted as ~1.5 characters and the NEXT line gets its first
REM  character eaten -- "pause" becomes "ause".  chcp cannot fix that.
REM  All Chinese output comes from scripts\run-tests.mjs instead.
REM ===================================================================

chcp 65001 >nul 2>&1
cd /d "%~dp0"

node "scripts\run-tests.mjs"
set "EXITCODE=%ERRORLEVEL%"

if /i not "%~1"=="nopause" (
  echo.
  pause
)

exit /b %EXITCODE%
