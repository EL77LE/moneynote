@echo off
REM ===================================================================
REM  MoneyNote Cloudflare Workers + D1 one-click deploy.
REM  Double-click this file. No Cloudflare account is required first:
REM  the script creates a 60-minute temporary preview account, deploys,
REM  and opens the claim page. Claim it within 60 minutes to keep it.
REM
REM  It creates a free D1 database, applies the schema, seeds demo
REM  data if the database is empty, deploys the Worker, and writes
REM  dist\cloudflare-url.txt for the delivery script to use.
REM
REM  Pure ASCII on purpose (same reason as the other .bat files).
REM  Pass "nopause" to skip the final pause.
REM ===================================================================

chcp 65001 >nul 2>&1
cd /d "%~dp0"

node "scripts\deploy-cloudflare.mjs"
set "EXITCODE=%ERRORLEVEL%"

if /i not "%~1"=="nopause" (
  echo.
  pause
)

exit /b %EXITCODE%
